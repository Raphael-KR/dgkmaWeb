import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  hashKakaoOAuthSessionBinding,
  hashKakaoOAuthState,
  kakaoOAuthStateStore,
  oauthStateHashesMatch,
} from "./kakao-oauth-state";

const isProduction =
  process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
const hasDatabaseEnvironment = Boolean(
  (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE)
    || process.env.DATABASE_URL,
);

test("OAuth state and session bindings are stored as fixed-length hashes", () => {
  const state = "state-value";
  const stateHash = hashKakaoOAuthState(state);
  const otherHash = hashKakaoOAuthState("other-state");

  assert.match(stateHash, /^[a-f0-9]{64}$/);
  assert.notEqual(stateHash, state);
  assert.match(hashKakaoOAuthSessionBinding("session-id"), /^[a-f0-9]{64}$/);
  assert.equal(oauthStateHashesMatch(stateHash, stateHash), true);
  assert.equal(oauthStateHashesMatch(stateHash, otherHash), false);
});

test("OAuth state schema rollout preserves the session store and is documented", async () => {
  const [drizzleConfig, design, plan, replitGuide] = await Promise.all([
    readFile(new URL("../drizzle.config.ts", import.meta.url), "utf8"),
    readFile(new URL(
      "../docs/superpowers/specs/2026-07-12-kakao-consent-and-account-deletion-design.md",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "../docs/superpowers/plans/2026-07-12-kakao-consent-and-account-deletion.md",
      import.meta.url,
    ), "utf8"),
    readFile(new URL("../replit.md", import.meta.url), "utf8"),
  ]);

  assert.match(drizzleConfig, /tablesFilter:\s*\["!session"\]/);
  assert.match(design, /kakao_oauth_states/);
  assert.match(design, /10분/);
  assert.match(design, /DELETE[^\n]*RETURNING/);
  assert.match(plan, /npm run db:push/);
  assert.match(plan, /Production Database에는 별도로 적용/);
  assert.match(replitGuide, /kakao_oauth_states/);
  assert.match(replitGuide, /Development Database에 적용/);
});

test("OAuth state binds a database generation and termination markers keep only an HMAC identity", async () => {
  const [schema, routes] = await Promise.all([
    readFile(new URL("../shared/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("./routes.ts", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /startedAt:\s*timestamp\("started_at", \{ withTimezone: true \}\)/);
  assert.match(schema, /pgTable\("kakao_identity_terminations"/);
  assert.match(schema, /identityHash:\s*text\("identity_hash"\)\.primaryKey\(\)/);
  assert.match(schema, /terminatedAt:\s*timestamp\("terminated_at", \{ withTimezone: true \}\)/);
  assert.match(routes, /kakaoOAuthStartedAt\?: number/);
  assert.match(routes, /startedAt:\s*new Date\(oauthStartedAt\)/);
});

test("development PostgreSQL atomically consumes one unexpired OAuth state", {
  skip: isProduction
    ? "운영 환경에서는 OAuth state 통합 테스트를 실행하지 않습니다."
    : !hasDatabaseEnvironment
      ? "PostgreSQL 개발 DB 환경변수가 없어 건너뜁니다."
      : false,
}, async () => {
  const { pool } = await import("./db");
  const databaseResult = await pool.query<{ database: string }>(
    "select current_database() as database",
  );
  assert.equal(
    databaseResult.rows[0]?.database,
    "heliumdb",
    "Development Database(heliumdb)가 아니므로 테스트를 거부합니다.",
  );

  const token = randomUUID();
  const stateHash = hashKakaoOAuthState(`state-${token}`);
  const sessionBindingHash = hashKakaoOAuthSessionBinding(`session-${token}`);
  const expiredStateHash = hashKakaoOAuthState(`expired-state-${token}`);
  const expiredSessionBindingHash = hashKakaoOAuthSessionBinding(`expired-session-${token}`);

  try {
    const issued = await kakaoOAuthStateStore.issue({
      stateHash,
      sessionBindingHash,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const outcomes = await Promise.all([
      kakaoOAuthStateStore.consume({
        stateHash,
        sessionBindingHash,
        startedAt: issued.startedAt,
      }),
      kakaoOAuthStateStore.consume({
        stateHash,
        sessionBindingHash,
        startedAt: issued.startedAt,
      }),
    ]);
    assert.deepEqual(outcomes.sort(), [false, true]);

    const expired = await kakaoOAuthStateStore.issue({
      stateHash: expiredStateHash,
      sessionBindingHash: expiredSessionBindingHash,
      expiresAt: new Date(Date.now() - 1_000),
    });
    assert.equal(await kakaoOAuthStateStore.consume({
      stateHash: expiredStateHash,
      sessionBindingHash: expiredSessionBindingHash,
      startedAt: expired.startedAt,
    }), false);
  } finally {
    await pool.query(
      `delete from kakao_oauth_states
       where state_hash = any($1::text[]) or session_binding_hash = any($2::text[])`,
      [[stateHash, expiredStateHash], [sessionBindingHash, expiredSessionBindingHash]],
    );
    const residue = await pool.query<{ count: number }>(
      `select count(*)::int as count from kakao_oauth_states
       where state_hash = any($1::text[]) or session_binding_hash = any($2::text[])`,
      [[stateHash, expiredStateHash], [sessionBindingHash, expiredSessionBindingHash]],
    );
    assert.equal(residue.rows[0]?.count, 0);
    await pool.end();
  }
});
