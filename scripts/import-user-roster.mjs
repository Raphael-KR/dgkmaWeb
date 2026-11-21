import { createHash } from "node:crypto";
import { pool } from "../server/db.ts";
import { googleSheetsService } from "../server/integrations/google-sheets.ts";

// B:K in sheet order: destination column and Sheets reader field.
const fields = [
  ["department", "department"],
  ["generation", "generation"],
  ["alumni_name", "name"],
  ["admission_date", "admissionDate"],
  ["graduation_date", "graduationDate"],
  ["alumni_mobile", "mobile"],
  ["alumni_group", "group"],
  ["alumni_status", "status"],
  ["alumni_position", "alumniPosition"],
  ["alumni_memo", "memo"],
];
const columns = fields.map(([column]) => column);
const roster = `jsonb_to_recordset($1::jsonb) AS s(id uuid, ${columns.map((c) => c + " text").join(", ")})`;
const different = fields
  .map(([c]) => `(to_jsonb(u)->>'${c}') IS DISTINCT FROM s.${c}`)
  .join(" OR ");

class ImportError extends Error {}

async function inspect(client, payload) {
  const {
    rows: [counts],
  } = await client.query(
    `SELECT count(*) FILTER (WHERE s.id IS NOT NULL)::int AS source,
            count(*) FILTER (WHERE u.id IS NOT NULL)::int AS users,
            count(*) FILTER (WHERE s.id IS NULL)::int AS users_without_source,
            count(*) FILTER (WHERE u.id IS NULL)::int AS source_without_user,
            count(*) FILTER (WHERE u.id IS NOT NULL AND s.id IS NOT NULL AND (${different}))::int AS changed,
            count(*) FILTER (WHERE u.id IS NOT NULL AND s.id IS NOT NULL AND NOT (${different}))::int AS identical
       FROM ${roster} FULL JOIN public.users u ON u.id = s.id`,
    [payload],
  );
  return counts;
}

// Include every pre-existing users column (including timestamps) without returning a personnel record.
async function accountDigest(client) {
  const {
    rows: [state],
  } = await client.query(
    `SELECT md5(string_agg(md5((to_jsonb(u) - $1::text[])::text), '' ORDER BY u.id)) AS digest
       FROM public.users u`,
    [columns],
  );
  return state.digest;
}

async function checkTarget(client) {
  const {
    rows: [db],
  } = await client.query(
    "SELECT current_database() AS db, pg_typeof((SELECT id FROM public.users LIMIT 0))::text AS type",
  );
  const {
    rows: [schema],
  } = await client.query(
    `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_schema='public'
       AND table_name='alumni_name_aliases' AND column_name='user_id') AS transitioned`,
  );
  if (schema.transitioned)
    throw new ImportError("기본명부 전환이 끝나 시트 재반영을 종료했습니다.");
  if (db.db !== "heliumdb" || db.type !== "uuid")
    throw new ImportError("개발 UUID DB를 확인하세요.");
}

async function run() {
  const args = process.argv.slice(2);
  const apply = args.length === 1 && /^--apply=[a-f0-9]{64}$/.test(args[0]);
  if (args.length && !apply) throw new ImportError("미리보기 또는 --apply=<지문>을 사용하세요.");
  if (
    process.env.REPL_ID !== "dc5e5541-525b-4ad6-b914-2d2db70cb4a9" ||
    process.env.REPLIT_DEPLOYMENT === "1" ||
    process.env.PGDATABASE !== "heliumdb" ||
    !process.env.PGHOST ||
    !process.env.PGUSER
  )
    throw new ImportError("Replit 개발 워크스페이스가 필요합니다.");

  await checkTarget(pool);
  const source = await googleSheetsService.fetchBasicRoster();
  if (!source.length) throw new ImportError("원본 명부가 비어 있습니다.");
  const payload = JSON.stringify(
    source
      .map((row) => ({
        id: row.id,
        ...Object.fromEntries(fields.map(([column, key]) => [column, row[key] || null])),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  const client = await pool.connect();
  let before;
  try {
    await checkTarget(client);
    await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    if (apply) {
      await client.query("SET LOCAL lock_timeout = '8s'");
      await client.query("LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE");
      await checkTarget(client);
    }
    const counts = await inspect(client, payload);
    console.log({ mode: apply ? "apply" : "preview", ...counts });
    if (
      counts.source !== source.length ||
      counts.users_without_source ||
      counts.source_without_user
    )
      throw new ImportError("기존 회원과 시트의 UUID 집합이 다릅니다.");
    // Bind approval to the inspected differences too. Adding empty roster columns doesn't change these counts.
    const fingerprint = createHash("sha256")
      .update(payload)
      .update(JSON.stringify(counts))
      .digest("hex");
    if (!apply) {
      console.log({ fingerprint });
      await client.query("COMMIT");
      return;
    }
    if (args[0] !== "--apply=" + fingerprint)
      throw new ImportError("명부 또는 DB가 미리보기 이후 바뀌었습니다.");
    before = await accountDigest(client);
    const result = await client.query(
      `UPDATE public.users u SET ${columns.map((c) => c + " = s." + c).join(", ")}
       FROM ${roster} WHERE u.id = s.id AND (${different})`,
      [payload],
    );
    if (result.rowCount !== counts.changed || (await accountDigest(client)) !== before)
      throw new ImportError("적용 건수 또는 기존 회원 필드 대조에 실패했습니다.");
    const final = await inspect(client, payload);
    if (final.identical !== source.length || final.changed)
      throw new ImportError("커밋 전 명부 대조에 실패했습니다.");
    await client.query("COMMIT");
    console.log({ updated: result.rowCount, inserted: 0, deleted: 0 });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release(true);
  }
  const fresh = await pool.connect();
  try {
    await checkTarget(fresh);
    await fresh.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const final = await inspect(fresh, payload);
    const preserved = (await accountDigest(fresh)) === before;
    console.log({ mode: "verify", ...final, accountFieldsPreserved: preserved });
    if (
      final.identical !== source.length ||
      final.changed ||
      final.source_without_user ||
      final.users_without_source ||
      !preserved
    )
      throw new ImportError("커밋 후 새 연결 대조에 실패했습니다.");
    await fresh.query("COMMIT");
  } finally {
    fresh.release(true);
  }
}

try {
  await run();
} catch (error) {
  // Provider and SQL errors may embed the source row or credentials.
  console.error(error instanceof ImportError ? error.message : "명부 처리 실패", error?.code ?? "");
  process.exitCode = 1;
} finally {
  await pool.end();
}
