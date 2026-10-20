import assert from "node:assert/strict";
import test from "node:test";
import { developmentDbConfig, verifyDevelopmentDb } from "./development-db-target";
import type { Pool } from "pg";

const safe = {
  RUN_DEVELOPMENT_DB_TESTS: "1", PGHOST: "helium", PGDATABASE: "heliumdb",
  PGUSER: "fixture", PGPASSWORD: "synthetic-test-password",
};

test("explicit local test targets work independently of Replit identity and URL fallback", () => {
  for (const host of ["helium", "localhost", "127.0.0.1"]) {
    const config = developmentDbConfig({
      ...safe, PGHOST: host, REPL_ID: "unrelated-fork",
      DATABASE_URL: "postgresql://unused.invalid/neondb",
    });
    assert.equal(config.host, host);
    assert.equal(config.database, "heliumdb");
    assert.equal(config.connectionString, undefined);
  }
});

test("unsafe targets fail closed before a pool is created, with sanitized errors", () => {
  const cases = [
    { RUN_DEVELOPMENT_DB_TESTS: undefined }, { RUN_DEVELOPMENT_DB_TESTS: "true" },
    { NODE_ENV: "production" }, { REPLIT_DEPLOYMENT: "1" },
    { PGHOST: "remote.invalid" }, { PGHOST: "helium.attacker.invalid" },
    { PGDATABASE: "neondb" }, { PGUSER: "" }, { PGPASSWORD: "" },
    { PGHOST: undefined }, { PGPORT: "0" }, { PGPORT: "65536" }, { PGPORT: "1.5" },
    { PGPORT: "invalid" }, { PROD_DATABASE_URL: "malformed-secret" },
    { PROD_DATABASE_URL: "postgresql://other:secret@helium/heliumdb" },
    { PGHOST: "localhost", PROD_DATABASE_READONLY_URL: "postgresql://other:secret@127.0.0.1/neondb" },
  ];
  for (const override of cases) {
    assert.throws(() => developmentDbConfig({ ...safe, ...override }), (error: Error) => {
      assert.match(error.message, /Unsafe development DB test target/);
      assert.doesNotMatch(error.message, /secret|synthetic-test-password/);
      return true;
    });
  }
});

test("live database identity must be heliumdb before fixtures or cleanup", async () => {
  for (const database of ["neondb", undefined]) {
    const pool = { query: async () => ({ rows: [{ database }] }) } as unknown as Pool;
    await assert.rejects(verifyDevelopmentDb(pool), /heliumdb/);
  }
});
