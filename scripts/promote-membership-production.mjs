import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const rosterFields = [
  "department",
  "generation",
  "alumni_name",
  "admission_date",
  "graduation_date",
  "alumni_mobile",
  "alumni_group",
  "alumni_position",
  "alumni_memo",
];
const newFields = [...rosterFields, "alumni_status", "joined_at", "membership_history"];
const aliasFields = "name, normalized_name, alias_type, is_preferred";
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

class CutoverError extends Error {}
function requireState(condition, reason) {
  if (!condition) throw new CutoverError(reason);
}

async function transaction(options, database, readonly, run) {
  const db = new pg.Client({ ...options, connectionTimeoutMillis: 15000 });
  try {
    await db.connect();
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ" + (readonly ? " READ ONLY" : ""));
    const {
      rows: [target],
    } = await db.query(
      "SELECT current_database() AS db, pg_typeof((SELECT id FROM public.users LIMIT 0))::text AS id",
    );
    requireState(
      target.db === database && target.id === "uuid",
      "대상 UUID 데이터베이스를 확인하세요.",
    );
    const result = await run(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

async function rosterSnapshot(db) {
  const { rows: roster } = await db.query(`SELECT id, ${rosterFields.join(", ")},
    alumni_status = '사망' AS deceased FROM public.users ORDER BY id`);
  requireState(
    roster.length && roster.every((r) => r.alumni_name?.trim()),
    "기본명부의 실명과 행 수를 확인하세요.",
  );
  requireState(
    roster.every((r) => r.deceased === (r.alumni_group === "본인사망")),
    "사망 상태와 기본명부 그룹을 확인하세요.",
  );
  const { rows: aliases } =
    await db.query(`SELECT user_id, ${aliasFields} FROM public.alumni_name_aliases
    ORDER BY user_id, normalized_name`);
  return { roster, aliases };
}

async function accountFacts(db) {
  const { rows } = await db.query(
    `WITH reviews AS (
    SELECT kakao_id, count(*)::int AS n, min(status) AS status
    FROM public.pending_registrations WHERE status IN ('pending','rejected') GROUP BY kakao_id
  ) SELECT u.id, u.is_verified IS TRUE AS verified, u.kakao_id IS NOT NULL AS bound,
    u.is_admin IS TRUE AS admin, u.kakao_sync_enabled IS TRUE AS sync,
    coalesce(r.n,0) AS holds, r.status AS review,
    md5((to_jsonb(u) - $1::text[])::text) AS account_hash
    FROM public.users u LEFT JOIN reviews r ON u.kakao_id=r.kakao_id ORDER BY u.id`,
    [newFields],
  );
  return new Map(rows.map((row) => [row.id, row]));
}

async function otherFacts(db) {
  const {
    rows: [row],
  } = await db.query(`SELECT
    (SELECT count(*)::int FROM public.pending_registrations) AS reviews,
    (SELECT md5(string_agg(md5(to_jsonb(r)::text), '' ORDER BY r.id)) FROM public.pending_registrations r) AS review_hash,
    (SELECT count(*)::int FROM public.posts) AS posts,
    (SELECT count(*)::int FROM public.comments) AS comments,
    (SELECT count(*)::int FROM public.payments) AS payments,
    (SELECT count(*)::int FROM public.alumni_database) AS old_roster`);
  return row;
}

function statusFor(row, member) {
  requireState(
    !member || (member.holds <= 1 && (!member.verified || (member.bound && !member.holds))),
    "운영 승인·심사 정보 충돌",
  );
  if (row.deceased) {
    requireState(
      !member?.verified && !member?.admin && !member?.sync && !member?.holds,
      "사망과 운영 계정·심사 상태 충돌",
    );
    return "사망";
  }
  if (member?.verified) return "가입 완료";
  if (member?.review === "pending") return "가입 대기";
  if (member?.review === "rejected") return "가입 거부";
  return "미가입";
}

function aliasKey(a) {
  return JSON.stringify([a.user_id, a.normalized_name]);
}
function mergeAliases(existing, incoming) {
  const merged = new Map();
  const preferred = new Map();
  for (const a of [...existing, ...incoming]) {
    requireState(a.user_id, "운영 별칭의 명부 소유자를 확인하세요.");
    const key = aliasKey(a);
    const old = merged.get(key);
    requireState(
      !old ||
        (old.name === a.name &&
          old.alias_type === a.alias_type &&
          old.is_preferred === a.is_preferred),
      "운영·개발 별칭이 충돌합니다.",
    );
    if (a.is_preferred) {
      requireState(
        !preferred.has(a.user_id) || preferred.get(a.user_id) === key,
        "대표 이름이 충돌합니다.",
      );
      preferred.set(a.user_id, key);
    }
    merged.set(key, a);
  }
  return merged;
}

async function schemaState(db) {
  const {
    rows: [s],
  } = await db.query(
    `SELECT
    (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name = ANY($1::text[])) AS user_fields,
    (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name IN ('dues_receipt_id','dues_allocation_key')) AS payment_fields,
    EXISTS (SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='alumni_name_aliases' AND column_name='user_id') AS alias_uuid,
    to_regclass('public.dues_receipts') IS NOT NULL AS dues,
    (SELECT count(*)::int FROM pg_trigger t WHERE (tgrelid,tgname) IN (
     ('public.users'::regclass,'users_record_membership_change'),('public.payments'::regclass,'payments_clear_dues_source_labels')) AND tgenabled='O') AS triggers`,
    [newFields],
  );
  return s;
}

async function preview(db, source, contracts) {
  const s = await schemaState(db);
  requireState(
    !s.user_fields && !s.payment_fields && !s.dues && !s.alias_uuid && !s.triggers,
    "최초 전환 대상이 아닙니다. 적용된 환경은 --verify로 확인하세요.",
  );
  const members = await accountFacts(db);
  const other = await otherFacts(db);
  const ids = new Set(source.roster.map((row) => row.id));
  requireState(
    members.size && [...members.keys()].every((id) => ids.has(id)),
    "운영 UUID가 개발 기본명부에 없습니다.",
  );
  const { rows: oldAliases } = await db.query(`SELECT a.matched_user_id AS user_id,
    n.name, n.normalized_name, n.alias_type, n.is_preferred
    FROM public.alumni_name_aliases n LEFT JOIN public.alumni_database a ON a.id=n.alumni_id
    ORDER BY a.matched_user_id, n.normalized_name`);
  const aliases = mergeAliases(oldAliases, source.aliases);
  const rows = source.roster.map((row) => ({
    ...row,
    alumni_status: statusFor(row, members.get(row.id)),
  }));
  const byStatus = {};
  for (const row of rows) byStatus[row.alumni_status] = (byStatus[row.alumni_status] ?? 0) + 1;
  const fingerprint = hash([
    hash(await readFile(new URL(import.meta.url), "utf8")),
    contracts,
    source,
    [...members.values()],
    other,
    oldAliases,
  ]);
  console.log({
    mode: "preview",
    existing: members.size,
    additions: rows.length - members.size,
    aliases: aliases.size,
    retainedReviews: other.reviews,
    retainedPayments: other.payments,
    retainedPosts: other.posts,
    retainedComments: other.comments,
    byStatus,
    fingerprint,
  });
  return { members, other, aliases, rows, fingerprint };
}

async function apply(db, plan, source, contracts) {
  await db.query(`ALTER TABLE public.users ${[...rosterFields, "alumni_status"].map((c) => "ADD COLUMN " + c + " text").join(", ")},
    ADD COLUMN joined_at timestamptz, ADD COLUMN membership_history jsonb NOT NULL DEFAULT '[]'::jsonb`);
  const fields = [...rosterFields, "alumni_status"];
  const recordset = `jsonb_to_recordset($1::jsonb) AS s(id uuid, ${fields.map((f) => f + " text").join(", ")})`;
  const payload = [JSON.stringify(plan.rows)];
  await db.query(
    `UPDATE public.users u SET ${fields.map((f) => f + " = s." + f).join(", ")}
    FROM ${recordset} WHERE u.id = s.id`,
    payload,
  );
  await db.query(
    `INSERT INTO public.users (id, name, ${fields.join(", ")})
    SELECT s.id, s.alumni_name, ${fields.map((f) => "s." + f).join(", ")}
    FROM ${recordset} WHERE NOT EXISTS (SELECT FROM public.users u WHERE u.id=s.id)`,
    payload,
  );
  await db.query(`CREATE FUNCTION pg_temp.cutover_alias_owner(old_id integer) RETURNS uuid
    LANGUAGE sql STABLE STRICT AS 'SELECT matched_user_id FROM public.alumni_database WHERE id = old_id';
    ALTER TABLE public.alumni_name_aliases DROP CONSTRAINT alumni_name_aliases_alumni_id_alumni_database_id_fk,
      ALTER COLUMN alumni_id TYPE uuid USING pg_temp.cutover_alias_owner(alumni_id);
    ALTER TABLE public.alumni_name_aliases RENAME COLUMN alumni_id TO user_id;
    ALTER TABLE public.alumni_name_aliases ADD CONSTRAINT alumni_name_aliases_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE`);
  await db.query(
    `INSERT INTO public.alumni_name_aliases (user_id, ${aliasFields})
    SELECT s.* FROM jsonb_to_recordset($1::jsonb) AS s(user_id uuid, name text,
      normalized_name text, alias_type text, is_preferred boolean)
    WHERE NOT EXISTS (SELECT FROM public.alumni_name_aliases a WHERE a.user_id=s.user_id AND a.normalized_name=s.normalized_name)`,
    [JSON.stringify(source.aliases)],
  );
  for (const sql of contracts) await db.query(sql);
}

async function verify(db, source, plan) {
  const s = await schemaState(db);
  requireState(
    s.user_fields === newFields.length &&
      s.payment_fields === 2 &&
      s.dues &&
      s.alias_uuid &&
      s.triggers === 2,
    "전환 스키마를 확인하세요.",
  );
  const members = await accountFacts(db);
  const snapshot = await rosterSnapshot(db);
  requireState(
    hash(snapshot.roster) === hash(source.roster),
    "명부 UUID 또는 값이 일치하지 않습니다.",
  );
  const aliases = mergeAliases(snapshot.aliases, source.aliases);
  requireState(
    aliases.size === snapshot.aliases.length && (!plan || aliases.size === plan.aliases.size),
    "별칭 대조에 실패했습니다.",
  );
  const {
    rows: [state],
  } = await db.query(`SELECT
    (SELECT count(*)::int FROM public.dues_receipts) AS receipts,
    (SELECT count(*)::int FROM public.payments WHERE dues_receipt_id IS NOT NULL OR dues_allocation_key IS NOT NULL) AS staged,
    (SELECT count(*)::int FROM public.users WHERE joined_at IS NOT NULL OR membership_history <> '[]'::jsonb) AS historical`);
  requireState(
    state.receipts === 0 && state.staged === 0 && state.historical === 0,
    "원장이나 가입 이력이 초기 전환 기준과 다릅니다.",
  );
  const { rows: statuses } = await db.query(
    "SELECT id, alumni_status FROM public.users ORDER BY id",
  );
  requireState(
    statuses.every(
      (row, i) => row.alumni_status === statusFor(source.roster[i], members.get(row.id)),
    ),
    "운영 승인·심사·사망 상태 대조에 실패했습니다.",
  );
  if (plan) {
    requireState(
      [...plan.members].every(([id, old]) => members.get(id)?.account_hash === old.account_hash),
      "기존 운영 계정 정보가 변경되었습니다.",
    );
    requireState(
      hash(await otherFacts(db)) === hash(plan.other),
      "기존 운영 자료 집계가 변경되었습니다.",
    );
  }
  console.log({
    mode: "verify",
    members: members.size,
    aliases: snapshot.aliases.length,
    ...state,
  });
}

async function main() {
  const [arg] = process.argv.slice(2);
  const applying = /^--apply=[a-f0-9]{64}$/.test(arg ?? "");
  requireState(
    process.argv.length <= 3 && (!arg || arg === "--verify" || arg === "--preview" || applying),
    "미리보기, --verify 또는 --apply=<지문>을 사용하세요.",
  );
  const env = process.env;
  requireState(
    env.REPL_ID === "dc5e5541-525b-4ad6-b914-2d2db70cb4a9" &&
      env.REPLIT_DEPLOYMENT !== "1" &&
      env.PGDATABASE === "heliumdb" &&
      env.PGHOST &&
      env.PGUSER,
    "Replit 개발 워크스페이스가 필요합니다.",
  );
  const readonlyURL = env.PROD_DATABASE_READONLY_URL || env.PROD_DATABASE_URL;
  requireState(
    readonlyURL && (!applying || env.PROD_DATABASE_URL),
    "운영 DB 연결 설정을 확인하세요.",
  );
  const contracts = await Promise.all(
    ["member-status-contract", "dues-ledger-contract"].map((name) =>
      readFile(new URL("./lib/" + name + ".sql", import.meta.url), "utf8"),
    ),
  );
  const source = await transaction(
    {
      host: env.PGHOST,
      port: Number(env.PGPORT || 5432),
      user: env.PGUSER,
      password: env.PGPASSWORD,
      database: env.PGDATABASE,
    },
    "heliumdb",
    true,
    rosterSnapshot,
  );
  const read = (fn) => transaction({ connectionString: readonlyURL }, "neondb", true, fn);
  if (arg === "--verify") return read((db) => verify(db, source));
  if (!applying) return read((db) => preview(db, source, contracts));
  const plan = await transaction(
    { connectionString: env.PROD_DATABASE_URL },
    "neondb",
    false,
    async (db) => {
      // Run after the new deployment serves its readiness response. A 6.2 Kakao
      // request may hold an open transaction while waiting for provider unlink.
      const {
        rows: [activity],
      } = await db.query(`SELECT count(DISTINCT a.pid)::int AS in_flight FROM pg_stat_activity a
        JOIN pg_locks l ON l.pid=a.pid
        WHERE a.datname=current_database() AND a.pid<>pg_backend_pid()
          AND l.relation IN ('public.users'::regclass, 'public.pending_registrations'::regclass,
                             'public.alumni_database'::regclass, 'public.alumni_name_aliases'::regclass)
          AND l.mode <> 'AccessShareLock'`);
      requireState(
        !activity.in_flight,
        "처리 중인 운영 트랜잭션이 있습니다. 종료 후 다시 시도하세요.",
      );
      await db.query("SET LOCAL lock_timeout = '8s'");
      await db.query(
        "LOCK TABLE public.users, public.pending_registrations, public.alumni_database, public.alumni_name_aliases, public.payments IN SHARE ROW EXCLUSIVE MODE",
      );
      const p = await preview(db, source, contracts);
      requireState(arg === "--apply=" + p.fingerprint, "미리보기 이후 입력이 바뀌었습니다.");
      await apply(db, p, source, contracts);
      await verify(db, source, p);
      return p;
    },
  );
  console.log({ committed: true });
  await read((db) => verify(db, source, plan));
}

try {
  await main();
} catch (error) {
  // Database diagnostics can include row values or connection details.
  console.error(
    error instanceof CutoverError ? error.message : "운영 명부 전환 실패",
    error.code ?? "",
  );
  process.exitCode = 1;
}
