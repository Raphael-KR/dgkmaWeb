import assert from "node:assert/strict";
import type { Pool, PoolConfig } from "pg";

export const developmentDbSkip = process.env.RUN_DEVELOPMENT_DB_TESTS === undefined
  ? "DB 회귀 검사는 RUN_DEVELOPMENT_DB_TESTS=1로 명시적으로 실행합니다."
  : false;

// Test-only policy. Never change server/db.ts selection or fall back to DATABASE_URL.
export function developmentDbConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const refuse = () => { throw new Error("Unsafe development DB test target; require explicit opt-in and local heliumdb PG* configuration."); };
  if (env.RUN_DEVELOPMENT_DB_TESTS !== "1"
    || env.NODE_ENV === "production"
    || env.REPLIT_DEPLOYMENT === "1"
    || !["helium", "localhost", "127.0.0.1"].includes(env.PGHOST ?? "")
    || env.PGDATABASE !== "heliumdb"
    || !env.PGUSER || !env.PGPASSWORD) refuse();
  const port = Number(env.PGPORT ?? "5432");
  if (!Number.isInteger(port) || port < 1 || port > 65535) refuse();
  for (const key of ["PROD_DATABASE_URL", "PROD_DATABASE_READONLY_URL"]) {
    if (!env[key]) continue;
    let production: URL;
    try { production = new URL(env[key]!); } catch { return refuse(); }
    const localHost = (host: string) => host === "localhost" ? "127.0.0.1" : host;
    if (localHost(production.hostname) === localHost(env.PGHOST!)
      && Number(production.port || "5432") === port) refuse();
  }
  return {
    host: env.PGHOST, port, user: env.PGUSER, password: env.PGPASSWORD,
    database: "heliumdb", ssl: false, connectionTimeoutMillis: 5000,
  };
}

export async function verifyDevelopmentDb(pool: Pool): Promise<void> {
  const result = await pool.query<{ database: string }>("select current_database() as database");
  assert.equal(result.rows[0]?.database, "heliumdb", "Development Database(heliumdb)가 아니므로 테스트를 거부합니다.");
}
