import { developmentDbSkip, getDevelopmentDbPool } from "../../tests/development-db-target";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  hashKakaoOAuthSessionBinding,
  hashKakaoOAuthState,
  kakaoOAuthStateStore,
  oauthStateHashesMatch,
} from "./kakao-oauth-state";

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

test(
  "development PostgreSQL atomically consumes one unexpired OAuth state",
  {
    skip: developmentDbSkip,
  },
  async () => {
    const pool = await getDevelopmentDbPool();

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

      const expiredStartedAt = new Date(Date.now() - 2_000);
      const expired = await kakaoOAuthStateStore.issue({
        stateHash: expiredStateHash,
        sessionBindingHash: expiredSessionBindingHash,
        startedAt: expiredStartedAt,
        expiresAt: new Date(expiredStartedAt.getTime() + 1_000),
      });
      assert.equal(
        await kakaoOAuthStateStore.consume({
          stateHash: expiredStateHash,
          sessionBindingHash: expiredSessionBindingHash,
          startedAt: expired.startedAt,
        }),
        false,
      );
    } finally {
      await pool.query(
        `delete from kakao_oauth_states
       where state_hash = any($1::text[]) or session_binding_hash = any($2::text[])`,
        [
          [stateHash, expiredStateHash],
          [sessionBindingHash, expiredSessionBindingHash],
        ],
      );
      const residue = await pool.query<{ count: number }>(
        `select count(*)::int as count from kakao_oauth_states
       where state_hash = any($1::text[]) or session_binding_hash = any($2::text[])`,
        [
          [stateHash, expiredStateHash],
          [sessionBindingHash, expiredSessionBindingHash],
        ],
      );
      assert.equal(residue.rows[0]?.count, 0);
      await pool.end();
    }
  },
);
