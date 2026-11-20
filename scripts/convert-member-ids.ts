import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { pool as development } from "../server/db";
import { googleSheetsService } from "../server/integrations/google-sheets";

const expected = 3458;
const digest = (ids: string[]) =>
  createHash("sha256")
    .update([...ids].sort().join("\n"))
    .digest("hex");
const args = process.argv.slice(2);
const production = args[0] === "--production";
const flags = production ? args.slice(1) : args;
const fingerprintArg = flags[0];
const apply = Boolean(fingerprintArg);
const database = production ? "neondb" : "heliumdb";
if (
  process.env.REPL_ID !== "dc5e5541-525b-4ad6-b914-2d2db70cb4a9" ||
  process.env.REPLIT_DEPLOYMENT === "1" ||
  process.env.PGDATABASE !== "heliumdb" ||
  !process.env.PGHOST ||
  !process.env.PGUSER ||
  flags.length > 1 ||
  (apply && !/^--apply=[a-f0-9]{64}$/.test(fingerprintArg)) ||
  (production && !process.env.PROD_DATABASE_URL)
)
  throw new Error("Replit 개발 워크스페이스에서 대상과 실행 인자를 확인하세요.");

const targetPool = production
  ? new Pool({ connectionString: process.env.PROD_DATABASE_URL })
  : development;

async function readRoster() {
  if (!production) return googleSheetsService.fetchIdentityRoster();
  const source = await development.query(
    `SELECT a.matched_user_id AS id, a.name, a.department, a.generation,
      coalesce(a.mobile, '') AS mobile
      FROM alumni_database a JOIN users u ON a.matched_user_id=u.id
      WHERE current_database()='heliumdb' ORDER BY a.matched_user_id`,
  );
  return source.rows as {
    id: string;
    name: string;
    department: string;
    generation: string;
    mobile: string;
  }[];
}

async function run() {
  const client = await targetPool.connect();
  try {
    const target = await client.query(
      "SELECT current_database() AS db, pg_typeof((select id from users limit 0))::text AS type",
    );
    if (target.rows[0]?.db !== database || target.rows[0]?.type !== "integer")
      throw new Error("최초 전환 대상이 아닙니다.");
    const roster = await readRoster();
    if (roster.length !== expected) throw new Error("승인된 명부 건수와 다릅니다.");
    const fingerprint = createHash("sha256").update(JSON.stringify(roster)).digest("hex");
    if (apply && fingerprintArg !== "--apply=" + fingerprint)
      throw new Error("미리보기 이후 명부가 변경되었습니다.");
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await client.query("SET LOCAL lock_timeout = '8s'");
    if (apply)
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('dgkma:alumni-sync:v1',0))",
      );
    if (apply)
      await client.query(
        'LOCK TABLE users, alumni_database, posts, comments, payments, event_parse_rate_limits, "session" IN ACCESS EXCLUSIVE MODE',
      );
    await client.query(`CREATE FUNCTION pg_temp.phone(raw text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS
      'SELECT regexp_replace(regexp_replace(raw, ''[^0-9]'', '''', ''g''), ''^820?'', ''0'')'`);
    await client.query(
      `CREATE TEMP TABLE sheet_roster ON COMMIT DROP AS
      SELECT * FROM jsonb_to_recordset($1::jsonb)
        AS r(id uuid, name text, department text, generation text, graduation text, mobile text)`,
      [JSON.stringify(roster)],
    );
    await client.query(`CREATE TEMP TABLE roster_map ON COMMIT DROP AS
      SELECT a.id AS roster_id, r.id AS member_id, r.name, a.graduation_date, a.is_matched
      FROM sheet_roster r JOIN alumni_database a ON a.name = r.name AND a.generation = r.generation
      AND a.department = r.department AND pg_temp.phone(coalesce(a.mobile,'')) = pg_temp.phone(r.mobile)`);
    await client.query(
      "ALTER TABLE roster_map ADD PRIMARY KEY (roster_id), ADD UNIQUE (member_id)",
    );
    await client.query(`CREATE TEMP TABLE account_map ON COMMIT DROP AS
      SELECT u.id AS old_user_id, r.member_id FROM users u JOIN alumni_database a ON
        a.matched_user_id = u.id OR (a.matched_user_id IS NULL AND u.phone_number IS NOT NULL
        AND a.name = u.name AND pg_temp.phone(a.mobile) = pg_temp.phone(u.phone_number))
      JOIN roster_map r ON r.roster_id = a.id`);
    await client.query(
      "ALTER TABLE account_map ADD PRIMARY KEY (old_user_id), ADD UNIQUE (member_id)",
    );
    const {
      rows: [counts],
    } = await client.query(`SELECT
      (SELECT count(*)::int FROM roster_map) AS matched, (SELECT count(*)::int FROM alumni_database) AS registry,
      (SELECT count(*)::int FROM account_map) AS linked, (SELECT count(*)::int FROM users) AS accounts`);
    console.log({ ...counts, source: roster.length, fingerprint });
    if (
      counts.matched !== expected ||
      counts.registry !== expected ||
      counts.linked !== counts.accounts
    )
      throw new Error("명부 또는 기존 계정 대조가 불완전합니다. 변경을 중단합니다.");
    if (!apply) {
      await client.query("ROLLBACK");
      return;
    }
    await client.query(
      await readFile(new URL("./convert-member-ids.sql", import.meta.url), "utf8"),
    );
    await client.query(`INSERT INTO users (id, name, graduation_year)
      SELECT member_id, name, substring(graduation_date from '^[0-9]{4}')::int FROM roster_map
      ON CONFLICT (id) DO NOTHING`);
    await client.query(`UPDATE alumni_database a SET matched_user_id = m.member_id,
      is_matched = u.kakao_id IS NOT NULL FROM roster_map m JOIN users u ON u.id=m.member_id WHERE a.id=m.roster_id`);
    const check = await client.query("SELECT id FROM users ORDER BY id");
    const ids = roster.map((row) => row.id);
    if (digest(check.rows.map((row) => row.id)) !== digest(ids))
      throw new Error("회원 기본키가 명부 UUID와 일치하지 않습니다.");
    await client.query("COMMIT");
    const fresh = await targetPool.query(`SELECT u.id, a.id IS NOT NULL AS linked FROM users u
      LEFT JOIN alumni_database a ON a.matched_user_id = u.id`);
    if (
      !fresh.rows.every((row) => row.linked) ||
      digest(fresh.rows.map((row) => row.id)) !== digest(ids)
    )
      throw new Error("커밋 후 명부 연결 검증 실패");
    console.log({ verified: fresh.rowCount, identitySetMatches: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await run();
  } catch (error) {
    // PostgreSQL detail may include the identity or contact that failed a constraint.
    console.error(
      error && typeof error === "object" && "code" in error
        ? { databaseCode: error.code }
        : error instanceof Error && !("response" in error)
          ? error.message
          : "명부 전환 실패",
    );
    process.exitCode = 1;
  } finally {
    if (production) await targetPool.end();
    await development.end();
  }
}
void main();
