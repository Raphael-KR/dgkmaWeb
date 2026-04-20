import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Replit 내장 PostgreSQL 우선 사용 (PG* 환경변수가 있으면 그것을 사용)
function buildConnectionString(): string {
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, DATABASE_URL } = process.env;
  if (PGHOST && PGUSER && PGDATABASE) {
    const port = PGPORT || "5432";
    const pwd = PGPASSWORD ? `:${encodeURIComponent(PGPASSWORD)}` : "";
    return `postgresql://${encodeURIComponent(PGUSER)}${pwd}@${PGHOST}:${port}/${PGDATABASE}`;
  }
  if (DATABASE_URL) return DATABASE_URL;
  throw new Error("DATABASE_URL must be set or PG* environment variables provided.");
}

const connectionString = buildConnectionString();
const isLocalDb = /(@|\/\/)(localhost|127\.0\.0\.1|helium)/i.test(connectionString);

console.log(`Connecting to PostgreSQL database (${isLocalDb ? "local/replit" : "remote"})...`);

export const pool = new Pool({
  connectionString,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });