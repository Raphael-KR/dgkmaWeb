import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test, { after } from "node:test";
import connectPgSimple from "connect-pg-simple";
import express from "express";
import session from "express-session";
import type { Pool } from "pg";
import type { PendingRegistrationReviewInput } from "./storage";
import { registerRoutes } from "./routes";

declare module "express-session" {
  interface SessionData {
    terminalRaceToken?: string;
  }
}

const isProduction =
  process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
const hasDatabaseEnvironment = Boolean(
  (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE)
    || process.env.DATABASE_URL,
);
const databaseSkip = isProduction
  ? "운영 환경에서는 종료 마커 경쟁 테스트를 실행하지 않습니다."
  : !hasDatabaseEnvironment
    ? "PostgreSQL 개발 DB 환경변수가 없어 건너뜁니다."
    : false;
const sessionSecret = process.env.SESSION_SECRET || "dev-secret-change-in-production";
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function within<T>(promise: Promise<T>, message: string, milliseconds = 5_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

let developmentPool: Pool | undefined;

after(async () => {
  await developmentPool?.end();
});

function identityHash(kind: "kakao" | "email", value: string): string {
  return createHmac("sha256", sessionSecret)
    .update(`${kind}:${value}`, "utf8")
    .digest("hex");
}

function stateHash(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

async function assertDevelopmentDatabase(pool: Pool): Promise<void> {
  const result = await pool.query<{ database: string }>(
    "select current_database() as database",
  );
  assert.equal(
    result.rows[0]?.database,
    "heliumdb",
    "Development Database(heliumdb)가 아니므로 테스트를 거부합니다.",
  );
}

async function terminationTableExists(pool: Pool): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    "select to_regclass('public.kakao_identity_terminations') is not null as exists",
  );
  return result.rows[0]?.exists === true;
}

type CleanupScope = {
  kakaoIds: string[];
  emails: string[];
  identityHashes: string[];
  stateHashes?: string[];
  terminalRaceToken?: string;
};

async function cleanupRaceRows(pool: Pool, scope: CleanupScope): Promise<void> {
  const hasTerminationTable = await terminationTableExists(pool);
  const normalizedEmails = scope.emails.map((email) => email.toLowerCase());
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `delete from pending_registrations
        where kakao_id = any($1::text[]) or lower(email) = any($2::text[])`,
      [scope.kakaoIds, normalizedEmails],
    );
    if (scope.stateHashes?.length) {
      await client.query(
        "delete from kakao_oauth_states where state_hash = any($1::text[])",
        [scope.stateHashes],
      );
    }
    if (scope.terminalRaceToken) {
      await client.query(
        `delete from "session" where sess ->> 'terminalRaceToken' = $1`,
        [scope.terminalRaceToken],
      );
    }
    await client.query(
      `delete from users
        where kakao_id = any($1::text[]) or lower(email) = any($2::text[])`,
      [scope.kakaoIds, normalizedEmails],
    );
    if (hasTerminationTable) {
      await client.query(
        "delete from kakao_identity_terminations where identity_hash = any($1::text[])",
        [scope.identityHashes],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  const verifier = await pool.connect();
  try {
    const residue = await verifier.query<{
      users_count: number;
      pending_count: number;
      state_count: number;
      session_count: number;
    }>(
      `select
         (select count(*)::int from users
           where kakao_id = any($1::text[]) or lower(email) = any($2::text[])) as users_count,
         (select count(*)::int from pending_registrations
           where kakao_id = any($1::text[]) or lower(email) = any($2::text[])) as pending_count,
         (select count(*)::int from kakao_oauth_states
           where state_hash = any($3::text[])) as state_count,
         (select count(*)::int from "session"
           where sess ->> 'terminalRaceToken' = $4) as session_count`,
      [
        scope.kakaoIds,
        normalizedEmails,
        scope.stateHashes ?? [],
        scope.terminalRaceToken ?? "",
      ],
    );
    assert.deepEqual(residue.rows[0], {
      users_count: 0,
      pending_count: 0,
      state_count: 0,
      session_count: 0,
    });
    if (hasTerminationTable) {
      const markerResidue = await verifier.query<{ count: number }>(
        "select count(*)::int as count from kakao_identity_terminations where identity_hash = any($1::text[])",
        [scope.identityHashes],
      );
      assert.equal(markerResidue.rows[0]?.count, 0);
    }
  } finally {
    verifier.release();
  }
}

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function createCookie(baseUrl: string, path: string): Promise<string> {
  const response = await fetch(`${baseUrl}${path}`, { method: "POST" });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  await response.arrayBuffer();
  return cookie;
}

test("development PostgreSQL rejection purges the whole identity and blocks an older pending refresh", {
  skip: databaseSkip,
}, async () => {
  const { pool } = await import("./db");
  const { storage } = await import("./storage");
  developmentPool = pool;
  await assertDevelopmentDatabase(pool);

  const token = randomUUID().replaceAll("-", "");
  const kakaoIdNumber =
    (BigInt(`0x${token.slice(0, 14)}`) % 900_000_000_000n) + 100_000_000_000n;
  const kakaoId = String(kakaoIdNumber);
  const sameEmailKakaoId = String(kakaoIdNumber + 1n);
  const email = `reject-race-${token}@example.invalid`;
  const otherEmail = `reject-race-other-${token}@example.invalid`;
  const kakaoHash = identityHash("kakao", kakaoId);
  const emailHash = identityHash("email", email.toLowerCase());
  const started = await pool.query<{ started_at: Date }>(
    "select clock_timestamp() - interval '1 second' as started_at",
  );
  const oauthStartedAt = started.rows[0].started_at;
  let selectedId = 0;
  let unlinkCalls = 0;
  let releaseUnlink: (() => void) | undefined;
  let markUnlinkEntered: (() => void) | undefined;
  const unlinkEntered = new Promise<void>((resolve) => {
    markUnlinkEntered = resolve;
  });
  const unlinkGate = new Promise<void>((resolve) => {
    releaseUnlink = resolve;
  });
  let refreshPromise: Promise<unknown> | undefined;
  let emailRefreshPromise: Promise<unknown> | undefined;
  let rejectionPromise: Promise<Response> | undefined;
  let server: Awaited<ReturnType<typeof registerRoutes>> | undefined;

  try {
    const userData = (rowKakaoId: string, rowEmail: string) => JSON.stringify({
      kakaoId: rowKakaoId,
      email: rowEmail,
      name: "거절경쟁",
      phoneNumber: "+82 10-9000-0001",
      profileImage: null,
      birthday: null,
      birthdayType: null,
      isLeapMonth: null,
      conflictReason: "not_found",
    });
    const inserted = await pool.query<{ id: number }>(
      `insert into pending_registrations (kakao_id, email, name, user_data, status)
       values
         ($1, $2, '거절경쟁', $3::jsonb, 'pending'),
         ($1, $4, '거절경쟁', $5::jsonb, 'pending'),
         ($6, $7, '거절경쟁', $8::jsonb, 'pending')
       returning id`,
      [
        kakaoId,
        email,
        userData(kakaoId, email),
        otherEmail,
        userData(kakaoId, otherEmail),
        sameEmailKakaoId,
        email.toUpperCase(),
        userData(sameEmailKakaoId, email.toUpperCase()),
      ],
    );
    selectedId = inserted.rows[0].id;
    await pool.query(
      `insert into users (kakao_id, email, name, is_verified)
       values ($1, $2, '거절 전 승격', true)`,
      [kakaoId, email],
    );

    const app = express();
    app.use(express.json());
    app.use(session({ secret: "reject-race-session", resave: false, saveUninitialized: false }));
    app.post("/__test/admin-session", (req, res) => {
      req.session.userId = 1;
      res.json({ ok: true });
    });
    server = await registerRoutes(app, {
      getUserForAdmin: async () => ({ isAdmin: true }),
      getKakaoAdminConfig: () => ({ environment: "development", adminKey: "mock-admin-key" }),
      unlinkKakaoUser: async () => {
        unlinkCalls += 1;
        markUnlinkEntered?.();
        await unlinkGate;
      },
    });
    const baseUrl = await listen(server);
    const cookie = await createCookie(baseUrl, "/__test/admin-session");

    rejectionPromise = fetch(`${baseUrl}/api/admin/pending-registrations/${selectedId}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });
    const rejectionStart = await within(Promise.race([
      unlinkEntered.then(() => ({ kind: "unlink" as const })),
      rejectionPromise.then((response) => ({ kind: "response" as const, response })),
    ]), "거절 요청이 unlink 또는 응답에 도달하지 않았습니다.");
    if (rejectionStart.kind === "response") {
      throw new Error(`거절 요청이 unlink 전에 HTTP ${rejectionStart.response.status}로 종료됐습니다.`);
    }

    const registration: PendingRegistrationReviewInput = {
      kakaoId,
      email,
      name: "거절경쟁",
      userData: {
        kakaoId,
        email,
        name: "거절경쟁",
        phoneNumber: "+82 10-9000-0001",
        profileImage: null,
        birthday: null,
        birthdayType: null,
        isLeapMonth: null,
        conflictReason: "not_found",
      },
    };
    const createOrRefresh = storage.createOrRefreshPendingRegistration as unknown as (
      input: PendingRegistrationReviewInput,
      startedAt: Date,
    ) => Promise<unknown>;
    refreshPromise = createOrRefresh.call(storage, registration, oauthStartedAt);
    emailRefreshPromise = createOrRefresh.call(storage, {
      ...registration,
      kakaoId: sameEmailKakaoId,
      userData: {
        ...registration.userData,
        kakaoId: sameEmailKakaoId,
      },
    }, oauthStartedAt);
    await wait(25);
    releaseUnlink?.();

    const [rejectionResponse, refreshOutcome, emailRefreshOutcome] = await Promise.all([
      rejectionPromise,
      refreshPromise.then(
        (value) => ({ status: "fulfilled" as const, value }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      ),
      emailRefreshPromise.then(
        (value) => ({ status: "fulfilled" as const, value }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      ),
    ]);
    assert.equal(rejectionResponse.status, 200);
    assert.deepEqual(await rejectionResponse.json(), { deleted: true, id: selectedId });
    assert.equal(unlinkCalls, 1);

    const finalState = await pool.query<{ pending_count: number; user_count: number }>(
      `select
         (select count(*)::int from pending_registrations
           where kakao_id = $1 or lower(email) = lower($2)) as pending_count,
         (select count(*)::int from users
           where kakao_id = $1 or lower(email) = lower($2)) as user_count`,
      [kakaoId, email],
    );
    assert.deepEqual(finalState.rows[0], { pending_count: 0, user_count: 0 });
    assert.equal(refreshOutcome.status, "rejected");
    if (refreshOutcome.status === "rejected") {
      assert.equal(
        refreshOutcome.error instanceof Error ? refreshOutcome.error.name : undefined,
        "KakaoOAuthTerminatedError",
      );
    }
    assert.equal(emailRefreshOutcome.status, "rejected");
    if (emailRefreshOutcome.status === "rejected") {
      assert.equal(
        emailRefreshOutcome.error instanceof Error
          ? emailRefreshOutcome.error.name
          : undefined,
        "KakaoOAuthTerminatedError",
      );
    }

    assert.equal(await terminationTableExists(pool), true);
    const marker = await pool.query<{
      marker_count: number;
      latest_terminated_at: Date;
    }>(
      `select
         count(*)::int as marker_count,
         max(terminated_at) as latest_terminated_at
       from kakao_identity_terminations
       where identity_hash = any($1::text[])`,
      [[kakaoHash, emailHash]],
    );
    assert.equal(marker.rowCount, 1);
    assert.equal(marker.rows[0].marker_count, 2);

    const freshResult = await createOrRefresh.call(
      storage,
      registration,
      new Date(marker.rows[0].latest_terminated_at.getTime() + 1),
    ) as { kind: string };
    assert.equal(freshResult.kind, "pending");
  } finally {
    releaseUnlink?.();
    await Promise.allSettled(
      [rejectionPromise, refreshPromise, emailRefreshPromise].filter(Boolean),
    );
    if (server) await closeServer(server);
    await cleanupRaceRows(pool, {
      kakaoIds: [kakaoId, sameEmailKakaoId],
      emails: [email, otherEmail],
      identityHashes: [kakaoHash, emailHash],
    });
  }
});

test("development PostgreSQL account deletion blocks an older OAuth callback without blocking a new generation", {
  skip: databaseSkip,
}, async () => {
  const { pool } = await import("./db");
  developmentPool = pool;
  await assertDevelopmentDatabase(pool);

  const token = randomUUID().replaceAll("-", "");
  const kakaoNumericId = String(
    (BigInt(`0x${token.slice(0, 14)}`) % 900_000_000_000n) + 100_000_000_000n,
  );
  const email = `delete-race-${token}@example.invalid`;
  const raceToken = `delete-race-session-${token}`;
  const kakaoHash = identityHash("kakao", kakaoNumericId);
  const emailHash = identityHash("email", email.toLowerCase());
  const trackedStateHashes: string[] = [];
  let userId = 0;
  let releaseUserInfo: (() => void) | undefined;
  let markUserInfoEntered: (() => void) | undefined;
  const userInfoEntered = new Promise<void>((resolve) => {
    markUserInfoEntered = resolve;
  });
  const userInfoGate = new Promise<void>((resolve) => {
    releaseUserInfo = resolve;
  });
  let userInfoCalls = 0;
  let unlinkCalls = 0;
  let callbackPromise: Promise<Response> | undefined;
  let server: Awaited<ReturnType<typeof registerRoutes>> | undefined;
  let pgSessionStore: InstanceType<ReturnType<typeof connectPgSimple>> | undefined;

  try {
    const inserted = await pool.query<{ id: number }>(
      `insert into users
         (kakao_id, email, name, is_verified, kakao_sync_enabled, phone_number)
       values ($1, $2, '탈퇴경쟁', true, true, '+82 10-9000-0002')
       returning id`,
      [kakaoNumericId, email],
    );
    userId = inserted.rows[0].id;

    const app = express();
    const PgSession = connectPgSimple(session);
    pgSessionStore = new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: false,
      pruneSessionInterval: false,
    });
    app.use(express.json());
    app.use(session({
      store: pgSessionStore,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
    }));
    app.post("/__test/member-session", (req, res) => {
      req.session.userId = userId;
      req.session.terminalRaceToken = raceToken;
      res.json({ ok: true });
    });
    app.post("/__test/oauth-session", (req, res) => {
      req.session.terminalRaceToken = raceToken;
      res.json({ ok: true });
    });

    const userInfo = {
      id: Number(kakaoNumericId),
      kakao_account: {
        email,
        is_email_verified: true,
        name: "탈퇴경쟁",
        phone_number: "+82 10-9000-0002",
      },
    };
    server = await registerRoutes(app, {
      getKakaoOAuthConfig: () => ({
        environment: "development",
        restApiKey: "mock-rest-key",
        clientSecret: "mock-client-secret",
        redirectUri: "https://dev.example/kakao-callback",
      }),
      getKakaoAdminConfig: () => ({ environment: "development", adminKey: "mock-admin-key" }),
      unlinkKakaoUser: async () => {
        unlinkCalls += 1;
      },
      kakaoFetch: async (input) => {
        const url = String(input);
        if (url === "https://kauth.kakao.com/oauth/token") {
          return new Response(JSON.stringify({ access_token: "mock-access-token" }));
        }
        if (url === "https://kapi.kakao.com/v2/user/me?secure_resource=true") {
          userInfoCalls += 1;
          if (userInfoCalls === 1) {
            markUserInfoEntered?.();
            await userInfoGate;
          }
          return new Response(JSON.stringify(userInfo));
        }
        throw new Error("Unexpected Kakao mock URL");
      },
    });
    const baseUrl = await listen(server);
    const memberCookie = await createCookie(baseUrl, "/__test/member-session");

    const beginAuthorization = async () => {
      const initialCookie = await createCookie(baseUrl, "/__test/oauth-session");
      const startResponse = await fetch(`${baseUrl}/api/auth/kakao/start`, {
        headers: { cookie: initialCookie },
        redirect: "manual",
      });
      assert.equal(startResponse.status, 302);
      const location = new URL(startResponse.headers.get("location") ?? "");
      const state = location.searchParams.get("state");
      assert.ok(state);
      trackedStateHashes.push(stateHash(state));
      return {
        cookie: startResponse.headers.get("set-cookie") ?? initialCookie,
        state,
      };
    };
    const authorize = (authorization: { cookie: string; state: string }) => fetch(
      `${baseUrl}/api/auth/kakao/authorize`,
      {
        method: "POST",
        headers: { cookie: authorization.cookie, "content-type": "application/json" },
        body: JSON.stringify({ code: "mock-code", state: authorization.state }),
      },
    );

    const oldAuthorization = await beginAuthorization();
    callbackPromise = authorize(oldAuthorization);
    await userInfoEntered;

    const deletionResponse = await fetch(`${baseUrl}/api/users/me`, {
      method: "DELETE",
      headers: { cookie: memberCookie, "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "탈퇴" }),
    });
    assert.equal(deletionResponse.status, 200);
    assert.deepEqual(await deletionResponse.json(), { success: true });
    releaseUserInfo?.();

    const oldCallbackResponse = await callbackPromise;
    const finalState = await pool.query<{
      user_count: number;
      pending_count: number;
      authenticated_session_count: number;
    }>(
      `select
         (select count(*)::int from users where kakao_id = $1) as user_count,
         (select count(*)::int from pending_registrations
           where kakao_id = $1 or lower(email) = lower($2)) as pending_count,
         (select count(*)::int from "session"
           where sess ->> 'userId' = $3) as authenticated_session_count`,
      [kakaoNumericId, email, String(userId)],
    );
    assert.deepEqual(finalState.rows[0], {
      user_count: 0,
      pending_count: 0,
      authenticated_session_count: 0,
    });
    assert.equal(oldCallbackResponse.status, 409);
    assert.equal(unlinkCalls, 1);

    assert.equal(await terminationTableExists(pool), true);
    const marker = await pool.query<{ identity_hash: string; terminated_at: Date }>(
      `select identity_hash, terminated_at
         from kakao_identity_terminations
        where identity_hash = $1`,
      [kakaoHash],
    );
    assert.equal(marker.rowCount, 1);
    assert.match(marker.rows[0].identity_hash, /^[a-f0-9]{64}$/);
    assert.notEqual(marker.rows[0].identity_hash, kakaoNumericId);

    await wait(10);
    const freshAuthorization = await beginAuthorization();
    const freshCallbackResponse = await authorize(freshAuthorization);
    assert.equal(freshCallbackResponse.status, 202);
    const freshState = await pool.query<{ pending_count: number; user_count: number }>(
      `select
         (select count(*)::int from pending_registrations where kakao_id = $1) as pending_count,
         (select count(*)::int from users where kakao_id = $1) as user_count`,
      [kakaoNumericId],
    );
    assert.deepEqual(freshState.rows[0], { pending_count: 1, user_count: 0 });
  } finally {
    releaseUserInfo?.();
    await Promise.allSettled([callbackPromise].filter(Boolean));
    if (server) await closeServer(server);
    pgSessionStore?.close();
    await cleanupRaceRows(pool, {
      kakaoIds: [kakaoNumericId],
      emails: [email],
      identityHashes: [kakaoHash, emailHash],
      stateHashes: trackedStateHashes,
      terminalRaceToken: raceToken,
    });
  }
});

test("development PostgreSQL deletion waits for a finalizing login and removes its saved session", {
  skip: databaseSkip,
}, async () => {
  const { pool } = await import("./db");
  const { storage } = await import("./storage");
  developmentPool = pool;
  await assertDevelopmentDatabase(pool);

  const token = randomUUID().replaceAll("-", "");
  const kakaoId = String(
    (BigInt(`0x${token.slice(0, 14)}`) % 900_000_000_000n) + 100_000_000_000n,
  );
  const email = `finalize-first-${token}@example.invalid`;
  const raceToken = `finalize-first-session-${token}`;
  const sid = `finalize-first-sid-${token}`;
  const kakaoHash = identityHash("kakao", kakaoId);
  const emailHash = identityHash("email", email);
  let releaseFinalizer: (() => void) | undefined;
  let markFinalizerEntered: (() => void) | undefined;
  const finalizerEntered = new Promise<void>((resolve) => {
    markFinalizerEntered = resolve;
  });
  const finalizerGate = new Promise<void>((resolve) => {
    releaseFinalizer = resolve;
  });
  let finalizePromise: ReturnType<typeof storage.finalizeKakaoLogin> | undefined;
  let deletePromise: ReturnType<typeof storage.deleteUserAccount> | undefined;

  try {
    const inserted = await pool.query<{ id: number }>(
      `insert into users
         (kakao_id, email, name, is_verified, kakao_sync_enabled, phone_number)
       values ($1, $2, '최종화우선', true, true, '+82 10-9000-0003')
       returning id`,
      [kakaoId, email],
    );
    const userId = inserted.rows[0].id;
    const user = await storage.getUser(userId);
    assert.ok(user);
    const started = await pool.query<{ started_at: Date }>(
      "select clock_timestamp() - interval '1 second' as started_at",
    );

    finalizePromise = storage.finalizeKakaoLogin(
      userId,
      { kakaoId, email, startedAt: started.rows[0].started_at },
      async () => {
        await pool.query(
          `insert into "session" (sid, sess, expire)
           values ($1, $2::json, now() + interval '1 hour')
           on conflict (sid) do update set sess = excluded.sess, expire = excluded.expire`,
          [sid, JSON.stringify({ userId, terminalRaceToken: raceToken })],
        );
        markFinalizerEntered?.();
        await finalizerGate;
      },
    );
    await within(finalizerEntered, "로그인 finalizer가 세션 저장 경계에 도달하지 않았습니다.");

    deletePromise = storage.deleteUserAccount(user);
    await wait(25);
    releaseFinalizer?.();

    const finalizedUser = await finalizePromise;
    assert.equal(finalizedUser.id, userId);
    await deletePromise;

    const finalState = await pool.query<{
      user_count: number;
      session_count: number;
      marker_count: number;
    }>(
      `select
         (select count(*)::int from users where id = $1) as user_count,
         (select count(*)::int from "session" where sid = $2) as session_count,
         (select count(*)::int from kakao_identity_terminations
           where identity_hash = any($3::text[])) as marker_count`,
      [userId, sid, [kakaoHash, emailHash]],
    );
    assert.deepEqual(finalState.rows[0], {
      user_count: 0,
      session_count: 0,
      marker_count: 2,
    });
  } finally {
    releaseFinalizer?.();
    await Promise.allSettled([finalizePromise, deletePromise].filter(Boolean));
    await cleanupRaceRows(pool, {
      kakaoIds: [kakaoId],
      emails: [email],
      identityHashes: [kakaoHash, emailHash],
      terminalRaceToken: raceToken,
    });
  }
});
