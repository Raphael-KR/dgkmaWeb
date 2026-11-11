import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import session from "express-session";
import type { AlumniRecord, User } from "@shared/schema";
import { type KakaoOAuthConfig } from "../../../integrations/kakao/kakao-oauth-config";
import type { PendingRegistrationReviewInput } from "../../../storage";
import { registerRoutes, type RouteDependencies } from "../../../routes";
import type { KakaoOAuthStateBinding, KakaoOAuthStateStore } from "../kakao-oauth-state";
import { KAKAO_OAUTH_STATE_TTL_MS } from "../kakao-oauth-state";

export const config: KakaoOAuthConfig = {
  environment: "development",
  restApiKey: "route-rest-key",
  clientSecret: "route-client-secret",
  redirectUri: "https://dev.example/kakao-callback",
};

type KakaoAuthStorage = NonNullable<RouteDependencies["kakaoAuthStorage"]>;

export const newKakaoUserInfo = {
  id: 987654321,
  kakao_account: {
    email: "new-member@example.com",
    is_email_verified: true,
    name: "김동문",
    phone_number: "+82 10-9876-5432",
  },
};

export function takeKakaoResponse(responses: Response[]): Response {
  const response = responses.shift();
  assert.ok(response, "unexpected Kakao fetch call");
  return response;
}

export function kakaoResponses(userInfo = newKakaoUserInfo) {
  const responses = [
    new Response(JSON.stringify({ access_token: "test-access-token" })),
    new Response(JSON.stringify(userInfo)),
  ];
  return async () => takeKakaoResponse(responses);
}

export const alumniRecord: AlumniRecord = {
  id: 31,
  department: "한의학과",
  generation: "20",
  name: "김동문",
  admissionDate: "1999-03-01",
  graduationDate: "2005-02-28",
  address: null,
  mobile: "010-9876-5432",
  phone: null,
  group: null,
  status: null,
  alumniPosition: null,
  memo: null,
  isMatched: false,
  matchedUserId: null,
};

export const createdUser: User = {
  id: 41,
  kakaoId: "987654321",
  email: "new-member@example.com",
  name: "김동문",
  graduationYear: 2005,
  isVerified: true,
  isAdmin: false,
  kakaoSyncEnabled: true,
  profileImage: null,
  phoneNumber: "+82 10-9876-5432",
  birthday: null,
  birthdayType: null,
  isLeapMonth: null,
  activityRegion: null,
  createdAt: new Date("2026-07-12T00:00:00.000Z"),
  updatedAt: new Date("2026-07-12T00:00:00.000Z"),
};

export function finalizeKakaoLoginDouble(user: User = createdUser) {
  return async (_userId: number, _generation: unknown, saveSession: () => Promise<void>) => {
    await saveSession();
    return user;
  };
}

export function kakaoAuthStorageDouble(overrides: Partial<KakaoAuthStorage> = {}) {
  return {
    getUser: async () => createdUser,
    getUserByEmail: async () => undefined,
    getUserByKakaoId: async () => undefined,
    getUserByNormalizedPhone: async () => undefined,
    findAlumniByName: async () => [],
    createUserWithAlumniClaim: async () => createdUser,
    updateUser: async () => createdUser,
    finalizeKakaoLogin: finalizeKakaoLoginDouble(),
    createOrRefreshPendingRegistration: async (registration: PendingRegistrationReviewInput) => ({
      kind: "pending" as const,
      registration: {
        id: 1,
        ...registration,
        status: "pending",
        createdAt: new Date(),
      },
    }),
    ...overrides,
  } satisfies KakaoAuthStorage;
}

function kakaoOAuthStateStoreDouble(): KakaoOAuthStateStore {
  const bindings = new Map<string, KakaoOAuthStateBinding>();
  return {
    issue: async (binding) => {
      const startedAt = binding.startedAt ?? new Date();
      const issued = {
        ...binding,
        startedAt,
        expiresAt: binding.expiresAt ?? new Date(startedAt.getTime() + KAKAO_OAUTH_STATE_TTL_MS),
      };
      bindings.set(binding.sessionBindingHash, issued);
      return issued;
    },
    consume: async ({ stateHash, sessionBindingHash, startedAt }) => {
      const binding = bindings.get(sessionBindingHash);
      if (
        !binding ||
        binding.stateHash !== stateHash ||
        binding.startedAt.getTime() !== startedAt.getTime() ||
        binding.expiresAt.getTime() <= Date.now()
      ) {
        return false;
      }
      bindings.delete(sessionBindingHash);
      return true;
    },
  };
}

export async function startServer(
  dependencies: RouteDependencies,
  options: {
    failStartSessionSave?: boolean;
    synchronizeAuthorizeRequests?: boolean;
  } = {},
) {
  const app = express();
  const kakaoOAuthStateStore = dependencies.kakaoOAuthStateStore ?? kakaoOAuthStateStoreDouble();
  app.use(express.json());
  app.use(session({ secret: "test-session-secret", resave: false, saveUninitialized: false }));
  if (options.failStartSessionSave) {
    app.use("/api/auth/kakao/start", (req, _res, next) => {
      const originalSave = req.session.save.bind(req.session);
      let failed = false;
      req.session.save = (callback) => {
        if (!failed) {
          failed = true;
          callback?.(new Error("forced session save failure"));
          return req.session;
        }
        return originalSave(callback);
      };
      next();
    });
  }
  app.post("/__test/admin-session", (req, res) => {
    req.session.userId = 1;
    res.json({ ok: true });
  });
  if (options.synchronizeAuthorizeRequests) {
    let arrivals = 0;
    let release: (() => void) | undefined;
    const bothRequestsReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    app.use("/api/auth/kakao/authorize", async (_req, _res, next) => {
      arrivals += 1;
      if (arrivals === 2) release?.();
      await bothRequestsReady;
      next();
    });
  }
  const server = await registerRoutes(app, { ...dependencies, kakaoOAuthStateStore });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

export async function beginKakaoAuthorization(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/auth/kakao/start`, { redirect: "manual" });
  assert.equal(response.status, 302);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie, "OAuth state session cookie is required");
  const location = new URL(response.headers.get("location") ?? "");
  const state = location.searchParams.get("state");
  assert.ok(state, "OAuth state query parameter is required");
  return { cookie, location, state };
}

export async function postKakaoAuthorize(
  baseUrl: string,
  body: Record<string, unknown> = { code: "test-code" },
  authorization?: { cookie: string; state: string },
) {
  const started = authorization ?? (await beginKakaoAuthorization(baseUrl));
  return fetch(`${baseUrl}/api/auth/kakao/authorize`, {
    method: "POST",
    headers: {
      cookie: started.cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...body, state: started.state }),
  });
}

export async function createAdminSession(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/__test/admin-session`, { method: "POST" });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie;
}
