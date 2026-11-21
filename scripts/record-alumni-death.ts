import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { users } from "../server/db/schema";
import { db, pool } from "../server/db";
import {
  normalizePhoneForComparison,
  normalizedPhoneSql,
} from "../server/modules/identity/registration-support";

class RosterError extends Error {}

// Existing office memos may use a dotted date, a Korean date, or a date followed by ‘사망’.
function deathMemo(memo: string | null, date: string | undefined, alreadyDeceased: boolean) {
  if (!date) return memo;
  const calendarDate =
    /(?<![0-9])([0-9]{4})\s*[-./년]\s*([0-9]{1,2})\s*[-./월]\s*([0-9]{1,2})(?![0-9])(?:일|\.)?/g;
  let recorded = false;
  for (const line of (memo ?? "").split(/[\n;|]/)) {
    for (const match of Array.from(line.matchAll(calendarDate))) {
      const before = line.slice(0, match.index).trim();
      const after = line.slice(match.index + match[0].length).trim();
      const labeled =
        /^(?:본인\s*)?(?:사망|별세)(?:일자|일)?\s*[:：]?$/.test(before) ||
        (!before && /^(?:본인\s*)?(?:사망|별세)(?:$|[\s.,;])/.test(after));
      if (!labeled && !(alreadyDeceased && !before && !after)) continue;
      const saved = [match[1], match[2].padStart(2, "0"), match[3].padStart(2, "0")].join("-");
      if (saved !== date)
        throw new RosterError("기존 사망일과 다릅니다. 사무국에서 원자료를 대조하세요.");
      recorded = true;
    }
  }
  if (recorded) return memo;
  const entry = `사망일: ${date}`;
  return memo ? memo + (memo.endsWith("\n") ? "" : "\n") + entry : entry;
}

async function run() {
  const { values } = parseArgs({
    options: { id: { type: "string" }, date: { type: "string" }, apply: { type: "string" } },
  });
  const { id, date, apply } = values;
  if (!id || !z.string().uuid().safeParse(id).success)
    throw new RosterError("--id에 명부에서 확인한 동문 UUID를 입력하세요.");
  if (
    date !== undefined &&
    (!z.string().date().safeParse(date) ||
      date > new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date()))
  )
    throw new RosterError("--date에는 확인된 사망일을 YYYY-MM-DD로 입력하거나 옵션을 생략하세요.");
  if (apply !== undefined && !/^[a-f0-9]{64}$/.test(apply))
    throw new RosterError("--apply에는 미리보기에서 확인한 지문을 입력하세요.");

  const { REPL_ID, REPLIT_DEPLOYMENT, PGDATABASE, PGHOST, PGUSER } = process.env;
  if (
    REPL_ID !== "dc5e5541-525b-4ad6-b914-2d2db70cb4a9" ||
    REPLIT_DEPLOYMENT === "1" ||
    PGDATABASE !== "heliumdb" ||
    !PGHOST ||
    !PGUSER
  )
    throw new RosterError("Replit 개발 워크스페이스의 PG 연결을 확인하세요.");

  const result = await db.transaction(
    async (tx) => {
      const target = await tx.execute(sql`select current_database() as database`);
      if (target.rows[0]?.database !== "heliumdb") throw new RosterError("개발 DB가 아닙니다.");
      if (apply) {
        await tx.execute(sql`set local lock_timeout = '8s'`);
        // Serialize max+1 with all users writers, including the cohort import.
        await tx.execute(sql`lock table public.users in share row exclusive mode`);
      }
      const trigger = await tx.execute(sql`select 1 from pg_trigger
      where tgrelid = 'public.users'::regclass and tgname = 'users_record_membership_change'
        and tgfoid = to_regprocedure('public.record_membership_change()')
        and tgenabled in ('O','A') and current_setting('session_replication_role') = 'origin'`);
      if (!trigger.rowCount)
        throw new RosterError("회원 상태 이력 트리거의 활성 상태를 확인하세요.");

      const [person] = await tx
        .select({
          id: users.id,
          name: users.alumniName,
          generation: users.generation,
          status: users.alumniStatus,
          group: users.alumniGroup,
          mobile: users.alumniMobile,
          memo: users.alumniMemo,
        })
        .from(users)
        .where(and(eq(users.id, id), isNotNull(users.alumniName)));
      if (!person) throw new RosterError("해당 UUID의 동문 명부 행이 없습니다.");

      const alreadyDeceased = person.status === "사망";
      const memo = deathMemo(person.memo, date, alreadyDeceased);
      let mobile = person.mobile;
      const reservedNumber = /^0100000[0-9]{4}$/;
      if (!alreadyDeceased || !reservedNumber.test(normalizePhoneForComparison(mobile ?? ""))) {
        const digits = normalizedPhoneSql(users.alumniMobile);
        const [numbers] = await tx
          .select({
            last: sql<number>`coalesce(max(right(${digits}, 4)::int), 0)`,
          })
          .from(users)
          .where(sql`${digits} ~ '^0100000[0-9]{4}$'`);
        if (numbers.last >= 9999)
          throw new RosterError("대체번호가 9999에 도달했습니다. 변경을 중단합니다.");
        mobile = `010-0000-${String(numbers.last + 1).padStart(4, "0")}`;
      }

      const changes = [
        ...(!alreadyDeceased ? ["상태 → 사망"] : []),
        ...(person.group !== "본인사망" ? ["그룹 → 본인사망"] : []),
        ...(mobile !== person.mobile ? ["명부 휴대전화 → 새 대체번호"] : []),
        ...(memo !== person.memo ? ["메모에 사망일 추가"] : []),
      ];
      if (!changes.length) return "변경 없음";
      const fingerprint = createHash("sha256")
        .update(JSON.stringify([person, mobile, date ?? null]))
        .digest("hex");
      if (!apply) {
        const identity = process.stdout.isTTY
          ? `${person.name} (${person.generation ?? "기수 미기록"})\n`
          : "";
        return `${identity}예정: ${changes.join(", ")}\n미리보기 지문: ${fingerprint}`;
      }
      if (fingerprint !== apply)
        throw new RosterError("미리보기와 다릅니다. 현재 명부로 다시 확인하세요.");
      const updated = await tx
        .update(users)
        .set({
          alumniMobile: mobile,
          alumniGroup: "본인사망",
          alumniStatus: "사망",
          alumniMemo: memo,
        })
        .where(eq(users.id, person.id))
        .returning({ status: users.alumniStatus });
      if (updated.length !== 1 || updated[0].status !== "사망")
        throw new RosterError("대상 한 명의 변경을 확인하지 못했습니다.");
      return `처리 완료: ${changes.join(", ")}`;
    },
    apply
      ? { isolationLevel: "read committed" }
      : { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  console.log(result);
}

run()
  .catch((error: unknown) => {
    console.error(
      error instanceof RosterError
        ? error.message
        : "처리 결과를 확인하지 못했습니다. 명령 인자와 개발 DB 상태를 확인한 뒤 다시 미리보기 하세요.",
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
