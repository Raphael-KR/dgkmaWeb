# Kakao Environment Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one Replit project use the Kakao TEST app in development and the Kakao business app in published deployments without exposing server secrets or allowing authorization and token-exchange configuration to diverge.

**Architecture:** A focused server module selects one immutable Kakao OAuth configuration from `REPLIT_DEPLOYMENT` and builds both authorization and token requests. The browser starts login through a server redirect route, so it no longer embeds `VITE_KAKAO_*` login configuration. Existing generic Secrets stay in place until development and production smoke checks pass.

**Tech Stack:** TypeScript, Express 4, React 18, Vite 5, Node test runner through `tsx`, Replit App Secrets and Publishing

## Global Constraints

- Keep a single Replit project.
- Select production only when `REPLIT_DEPLOYMENT` is exactly `"1"`; select development otherwise.
- Development callback is exactly `https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev/kakao-callback`.
- Production callback is exactly `https://dgkma.org/kakao-callback`.
- Never expose the Kakao client secret through a `VITE_` variable, URL, API response, log, Git file, or chat.
- Do not fall back to old generic Kakao variable names, request headers, `APP_URL`, or the legacy `dgkma.replit.app` callback.
- Do not delete old generic Secrets until both development and production login smoke checks pass.
- Preserve untracked `KIKcd_B.20250701.txt` and `KIKcd_B.20250701.xlsx`.
- Local dependency installation may be used only for short TDD feedback; final test, type-check, and build evidence must come from `/home/runner/workspace` through Replit SSH.

---

## File Structure

- Create `server/kakao-oauth-config.ts`: environment selection, validation, authorization URL construction, and token request-body construction.
- Create `server/kakao-oauth-config.test.ts`: pure configuration and request-construction tests.
- Create `server/kakao-oauth-routes.test.ts`: Express route integration tests with injected Kakao configuration and fetch implementation.
- Modify `server/routes.ts`: register the authorization-start route and use one selected configuration for token exchange.
- Modify `client/src/lib/auth.ts`: start login through the server route and remove client-side Kakao key access.
- Modify `AGENTS.md`: document environment-specific Secret names and corrected callbacks.
- Modify `replit.md`: document the same operational contract and transition procedure.

---

### Task 1: Server-only Kakao OAuth configuration

**Files:**
- Create: `server/kakao-oauth-config.ts`
- Create: `server/kakao-oauth-config.test.ts`

**Interfaces:**
- Produces: `KakaoOAuthEnvironment = "development" | "production"`
- Produces: `KakaoOAuthConfig` with `environment`, `restApiKey`, `clientSecret`, and `redirectUri`
- Produces: `KakaoOAuthConfigurationError.missingVariables: readonly string[]`
- Produces: `resolveKakaoOAuthConfig(env?: NodeJS.ProcessEnv): KakaoOAuthConfig`
- Produces: `buildKakaoAuthorizeUrl(config: KakaoOAuthConfig): string`
- Produces: `buildKakaoTokenBody(config: KakaoOAuthConfig, code: string): URLSearchParams`

- [ ] **Step 1: Write the failing configuration tests**

Create `server/kakao-oauth-config.test.ts` with tests equivalent to:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  KakaoOAuthConfigurationError,
  buildKakaoAuthorizeUrl,
  buildKakaoTokenBody,
  resolveKakaoOAuthConfig,
} from "./kakao-oauth-config";

const completeEnv = {
  KAKAO_DEV_REST_API_KEY: "dev-rest",
  KAKAO_DEV_CLIENT_SECRET: "dev-secret",
  KAKAO_DEV_REDIRECT_URI: "https://dev.example/kakao-callback",
  KAKAO_PROD_REST_API_KEY: "prod-rest",
  KAKAO_PROD_CLIENT_SECRET: "prod-secret",
  KAKAO_PROD_REDIRECT_URI: "https://prod.example/kakao-callback",
} satisfies NodeJS.ProcessEnv;

test("development configuration is the default", () => {
  const config = resolveKakaoOAuthConfig({ ...completeEnv });
  assert.deepEqual(config, {
    environment: "development",
    restApiKey: "dev-rest",
    clientSecret: "dev-secret",
    redirectUri: "https://dev.example/kakao-callback",
  });
});

test("production configuration requires REPLIT_DEPLOYMENT=1", () => {
  const config = resolveKakaoOAuthConfig({
    ...completeEnv,
    REPLIT_DEPLOYMENT: "1",
  });
  assert.equal(config.environment, "production");
  assert.equal(config.restApiKey, "prod-rest");
  assert.equal(config.clientSecret, "prod-secret");
  assert.equal(config.redirectUri, "https://prod.example/kakao-callback");

  assert.equal(
    resolveKakaoOAuthConfig({ ...completeEnv, REPLIT_DEPLOYMENT: "true" }).environment,
    "development",
  );
});

test("missing selected variables are reported by name only", () => {
  assert.throws(
    () => resolveKakaoOAuthConfig({ KAKAO_DEV_REST_API_KEY: "dev-rest" }),
    (error) => {
      assert.ok(error instanceof KakaoOAuthConfigurationError);
      assert.deepEqual(error.missingVariables, [
        "KAKAO_DEV_CLIENT_SECRET",
        "KAKAO_DEV_REDIRECT_URI",
      ]);
      assert.doesNotMatch(error.message, /dev-rest/);
      return true;
    },
  );
});

test("authorization and token requests use one configuration", () => {
  const config = resolveKakaoOAuthConfig({ ...completeEnv });
  const authorizeUrl = new URL(buildKakaoAuthorizeUrl(config));
  assert.equal(authorizeUrl.origin, "https://kauth.kakao.com");
  assert.equal(authorizeUrl.pathname, "/oauth/authorize");
  assert.equal(authorizeUrl.searchParams.get("client_id"), "dev-rest");
  assert.equal(authorizeUrl.searchParams.get("redirect_uri"), "https://dev.example/kakao-callback");
  assert.equal(authorizeUrl.searchParams.get("response_type"), "code");
  assert.equal(authorizeUrl.searchParams.get("state"), "kakao_login");
  assert.equal(authorizeUrl.searchParams.has("client_secret"), false);

  const tokenBody = buildKakaoTokenBody(config, "authorization-code");
  assert.equal(tokenBody.get("client_id"), "dev-rest");
  assert.equal(tokenBody.get("client_secret"), "dev-secret");
  assert.equal(tokenBody.get("redirect_uri"), "https://dev.example/kakao-callback");
  assert.equal(tokenBody.get("code"), "authorization-code");
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run locally for the TDD failure check. Install the locked project dependencies first because this Mac copy currently has no `tsx` binary:

```bash
test -x node_modules/.bin/tsx || npm install
npm exec -- tsx --test server/kakao-oauth-config.test.ts
```

Expected: FAIL because `server/kakao-oauth-config.ts` does not exist.

- [ ] **Step 3: Implement the configuration module**

Create `server/kakao-oauth-config.ts` with this behavior:

```ts
export type KakaoOAuthEnvironment = "development" | "production";

export type KakaoOAuthConfig = Readonly<{
  environment: KakaoOAuthEnvironment;
  restApiKey: string;
  clientSecret: string;
  redirectUri: string;
}>;

export class KakaoOAuthConfigurationError extends Error {
  constructor(public readonly missingVariables: readonly string[]) {
    super(`Missing Kakao OAuth variables: ${missingVariables.join(", ")}`);
    this.name = "KakaoOAuthConfigurationError";
  }
}

const KAKAO_SCOPE = "name,profile_image,account_email,birthday,phone_number";

export function resolveKakaoOAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): KakaoOAuthConfig {
  const environment: KakaoOAuthEnvironment =
    env.REPLIT_DEPLOYMENT === "1" ? "production" : "development";
  const prefix = environment === "production" ? "KAKAO_PROD" : "KAKAO_DEV";
  const names = {
    restApiKey: `${prefix}_REST_API_KEY`,
    clientSecret: `${prefix}_CLIENT_SECRET`,
    redirectUri: `${prefix}_REDIRECT_URI`,
  } as const;
  const values = {
    restApiKey: env[names.restApiKey]?.trim() ?? "",
    clientSecret: env[names.clientSecret]?.trim() ?? "",
    redirectUri: env[names.redirectUri]?.trim() ?? "",
  };
  const missingVariables = Object.entries(names)
    .filter(([key]) => !values[key as keyof typeof values])
    .map(([, variableName]) => variableName);

  if (missingVariables.length > 0) {
    throw new KakaoOAuthConfigurationError(missingVariables);
  }

  return Object.freeze({ environment, ...values });
}

export function buildKakaoAuthorizeUrl(config: KakaoOAuthConfig): string {
  const params = new URLSearchParams({
    client_id: config.restApiKey,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: KAKAO_SCOPE,
    state: "kakao_login",
  });
  return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
}

export function buildKakaoTokenBody(
  config: KakaoOAuthConfig,
  code: string,
): URLSearchParams {
  return new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.restApiKey,
    redirect_uri: config.redirectUri,
    code,
    client_secret: config.clientSecret,
  });
}
```

- [ ] **Step 4: Run the focused test and verify success**

Run:

```bash
npm exec -- tsx --test server/kakao-oauth-config.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit the configuration unit**

```bash
git add server/kakao-oauth-config.ts server/kakao-oauth-config.test.ts
git commit -m "Add Kakao environment resolver"
```

---

### Task 2: Server-owned Kakao login flow

**Files:**
- Modify: `server/routes.ts`
- Modify: `client/src/lib/auth.ts`
- Create: `server/kakao-oauth-routes.test.ts`

**Interfaces:**
- Consumes: `resolveKakaoOAuthConfig`, `buildKakaoAuthorizeUrl`, `buildKakaoTokenBody`, and `KakaoOAuthConfig` from Task 1.
- Extends: `RouteDependencies.getKakaoOAuthConfig?: () => KakaoOAuthConfig`
- Extends: `RouteDependencies.kakaoFetch?: typeof fetch`
- Produces: `GET /api/auth/kakao/start` returning a redirect to Kakao.

- [ ] **Step 1: Write failing route and client contract tests**

Create `server/kakao-oauth-routes.test.ts` that:

1. Starts an Express app with `express.json()` and `registerRoutes()`.
2. Injects a fixed `getKakaoOAuthConfig` returning development test values.
3. Calls `GET /api/auth/kakao/start` with `redirect: "manual"` and asserts HTTP 302 plus the selected `client_id` and `redirect_uri`.
4. Injects `kakaoFetch` so a token request returns a controlled Kakao 400 response, posts `{ "code": "test-code" }` to `/api/auth/kakao/authorize`, and asserts the captured form body contains the same REST key, redirect URI, and client secret.
5. Injects a resolver that throws `KakaoOAuthConfigurationError`, then asserts `/api/auth/kakao/start` returns HTTP 500 without returning a key or client-secret value.
6. Reads `client/src/lib/auth.ts` and asserts it contains `/api/auth/kakao/start` and contains neither `VITE_KAKAO_REST_API_KEY` nor `VITE_KAKAO_REDIRECT_URI`.

Use a test configuration shaped exactly as:

```ts
const config: KakaoOAuthConfig = {
  environment: "development",
  restApiKey: "route-rest-key",
  clientSecret: "route-client-secret",
  redirectUri: "https://dev.example/kakao-callback",
};
```

The test file must use this complete server harness and assertions:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import {
  KakaoOAuthConfigurationError,
  type KakaoOAuthConfig,
} from "./kakao-oauth-config";
import { registerRoutes, type RouteDependencies } from "./routes";

const clientAuthPath = new URL("../client/src/lib/auth.ts", import.meta.url);
const config: KakaoOAuthConfig = {
  environment: "development",
  restApiKey: "route-rest-key",
  clientSecret: "route-client-secret",
  redirectUri: "https://dev.example/kakao-callback",
};

async function startServer(dependencies: RouteDependencies) {
  const app = express();
  app.use(express.json());
  const server = await registerRoutes(app, dependencies);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

test("authorization start redirects with the selected configuration", async () => {
  const server = await startServer({ getKakaoOAuthConfig: () => config });
  try {
    const response = await fetch(`${server.baseUrl}/api/auth/kakao/start`, {
      redirect: "manual",
    });
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get("location") ?? "");
    assert.equal(location.searchParams.get("client_id"), config.restApiKey);
    assert.equal(location.searchParams.get("redirect_uri"), config.redirectUri);
    assert.equal(location.searchParams.has("client_secret"), false);
  } finally {
    await server.close();
  }
});

test("token exchange uses the same selected configuration", async () => {
  let capturedBody = "";
  const kakaoFetch: typeof fetch = async (_input, init) => {
    capturedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ error: "invalid_grant" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  };
  const server = await startServer({
    getKakaoOAuthConfig: () => config,
    kakaoFetch,
  });
  try {
    const response = await fetch(`${server.baseUrl}/api/auth/kakao/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "test-code" }),
    });
    assert.equal(response.status, 400);
    const body = new URLSearchParams(capturedBody);
    assert.equal(body.get("client_id"), config.restApiKey);
    assert.equal(body.get("client_secret"), config.clientSecret);
    assert.equal(body.get("redirect_uri"), config.redirectUri);
    assert.equal(body.get("code"), "test-code");
  } finally {
    await server.close();
  }
});

test("missing configuration returns a generic error", async () => {
  const server = await startServer({
    getKakaoOAuthConfig: () => {
      throw new KakaoOAuthConfigurationError(["KAKAO_DEV_CLIENT_SECRET"]);
    },
  });
  try {
    const response = await fetch(`${server.baseUrl}/api/auth/kakao/start`);
    assert.equal(response.status, 500);
    const body = JSON.stringify(await response.json());
    assert.doesNotMatch(body, /KAKAO_DEV_CLIENT_SECRET|route-client-secret/);
  } finally {
    await server.close();
  }
});

test("client login delegates to the server start route", async () => {
  const source = await readFile(clientAuthPath, "utf8");
  assert.match(source, /\/api\/auth\/kakao\/start/);
  assert.doesNotMatch(source, /VITE_KAKAO_REST_API_KEY/);
  assert.doesNotMatch(source, /VITE_KAKAO_REDIRECT_URI/);
});
```

- [ ] **Step 2: Run the route test and verify failure**

Run:

```bash
npm exec -- tsx --test server/kakao-oauth-routes.test.ts
```

Expected: FAIL because the route and dependency interfaces do not exist and the client still reads `VITE_KAKAO_*`.

- [ ] **Step 3: Add dependency injection and the authorization-start route**

In `server/routes.ts`:

```ts
import {
  KakaoOAuthConfigurationError,
  buildKakaoAuthorizeUrl,
  buildKakaoTokenBody,
  resolveKakaoOAuthConfig,
  type KakaoOAuthConfig,
} from "./kakao-oauth-config";

export type RouteDependencies = {
  getUserForAdmin?: AdminUserLookup;
  getKakaoOAuthConfig?: () => KakaoOAuthConfig;
  kakaoFetch?: typeof fetch;
};
```

Inside `registerRoutes`, initialize:

```ts
const getKakaoOAuthConfig =
  dependencies.getKakaoOAuthConfig ?? (() => resolveKakaoOAuthConfig());
const kakaoFetch = dependencies.kakaoFetch ?? fetch;
```

Register before the token-exchange route:

```ts
app.get("/api/auth/kakao/start", (_req, res) => {
  try {
    const config = getKakaoOAuthConfig();
    return res.redirect(buildKakaoAuthorizeUrl(config));
  } catch (error) {
    if (error instanceof KakaoOAuthConfigurationError) {
      console.error("[Kakao OAuth] missing configuration:", error.missingVariables);
      return res.status(500).json({ message: "Kakao 앱 설정 오류" });
    }
    console.error("[Kakao OAuth] authorization start failed:", getErrorType(error));
    return res.status(500).json({ message: "Kakao authorization failed" });
  }
});
```

- [ ] **Step 4: Make token exchange consume the same configuration**

In `POST /api/auth/kakao/authorize`:

- Remove direct reads of `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, and `KAKAO_REDIRECT_URI`.
- Remove Origin, Referer, `APP_URL`, localhost, and `dgkma.replit.app` fallbacks.
- Resolve `const config = getKakaoOAuthConfig()` once.
- Build the request with `const params = buildKakaoTokenBody(config, String(code ?? ""))`.
- Send Kakao token and user-info requests through `kakaoFetch`.
- Keep existing Kakao response handling, user information handling, session behavior, and onboarding behavior unchanged.
- When `DEBUG_KAKAO_AUTH=true`, log only `config.environment`, a masked REST-key prefix, `config.redirectUri`, and `hasClientSecret: true`; remove client-secret prefix logging.
- Handle `KakaoOAuthConfigurationError` by returning the same generic HTTP 500 configuration message while logging only `missingVariables`.

- [ ] **Step 5: Move the browser login command to the server route**

Replace the body of `kakaoLogin` in `client/src/lib/auth.ts` with:

```ts
export const kakaoLogin = () => {
  window.location.assign("/api/auth/kakao/start");
};
```

Do not retain a compatibility fallback to `VITE_KAKAO_*`.

- [ ] **Step 6: Run focused and full automated tests**

Run the local preflight suite. These results provide TDD feedback but do not replace the required Replit validation in Task 4:

```bash
npm exec -- tsx --test server/kakao-oauth-config.test.ts server/kakao-oauth-routes.test.ts
npm test
npm run check
npm run build
```

Expected: focused Kakao tests PASS, all server tests PASS, TypeScript exits 0, and production build exits 0. Existing Vite chunk-size or Browserslist age warnings are allowed; errors are not.

- [ ] **Step 7: Commit the login-flow change**

```bash
git add server/routes.ts client/src/lib/auth.ts server/kakao-oauth-routes.test.ts
git commit -m "Separate Kakao login by runtime environment"
```

---

### Task 3: Operational documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `replit.md`

**Interfaces:**
- Consumes: the six-Secret contract and runtime behavior from Tasks 1 and 2.
- Produces: durable instructions for future Codex and Replit work.

- [ ] **Step 1: Update the current operating documents**

Document all of the following in both current instruction surfaces where appropriate:

```text
KAKAO_DEV_REST_API_KEY
KAKAO_DEV_CLIENT_SECRET
KAKAO_DEV_REDIRECT_URI
KAKAO_PROD_REST_API_KEY
KAKAO_PROD_CLIENT_SECRET
KAKAO_PROD_REDIRECT_URI
```

Record that:

- Replit provides one App Secrets pane to this project.
- `REPLIT_DEPLOYMENT="1"` selects production; all other values select development.
- The browser starts login through `/api/auth/kakao/start`.
- The server alone selects REST key, client secret, and redirect URI.
- The development and production callbacks are the two exact Global Constraints values.
- The five generic Kakao Secrets are deprecated and removed only after both smoke checks pass.

Remove current statements that identify `https://dgkma.replit.app/kakao-callback` as the production callback or require the browser to read `VITE_KAKAO_*` login values.

- [ ] **Step 2: Verify documentation consistency**

Run:

```bash
rg -n "dgkma\.replit\.app/kakao-callback|VITE_KAKAO_REST_API_KEY|VITE_KAKAO_REDIRECT_URI" AGENTS.md replit.md client/src/lib/auth.ts server/routes.ts server/kakao-oauth-config.ts
rg -n "KAKAO_(DEV|PROD)_(REST_API_KEY|CLIENT_SECRET|REDIRECT_URI)|REPLIT_DEPLOYMENT" AGENTS.md replit.md server
git diff --check
```

Expected: the first command finds no active legacy references; the second finds the new contract; `git diff --check` exits 0.

- [ ] **Step 3: Commit the operating-document update**

```bash
git add AGENTS.md replit.md
git commit -m "Document Kakao environment secrets"
```

---

### Task 4: Replit Secret migration and development verification

**Files:**
- No repository file changes.

**Interfaces:**
- Consumes: all six Secret names and the completed code from Tasks 1 through 3.
- Produces: a verified development login while old generic Secrets remain available to the current published snapshot.

- [ ] **Step 1: Add the six new App Secrets without deleting old values**

In Replit Secrets, add the TEST app values under the three `KAKAO_DEV_*` names and business app values under the three `KAKAO_PROD_*` names. Use the exact callback URIs from Global Constraints. Do not paste any actual key or client secret into terminal history, Git, documentation, or chat.

- [ ] **Step 2: Verify Secret presence without printing values**

Through Replit SSH, run a Node command that prints only `OK` or `MISSING` for the six variable names and prints the two redirect URI values. It must not print REST keys or client secrets.

```bash
node -e 'const names=["KAKAO_DEV_REST_API_KEY","KAKAO_DEV_CLIENT_SECRET","KAKAO_DEV_REDIRECT_URI","KAKAO_PROD_REST_API_KEY","KAKAO_PROD_CLIENT_SECRET","KAKAO_PROD_REDIRECT_URI"]; for (const name of names) console.log(`${name}:`, process.env[name] ? "OK" : "MISSING"); console.log("DEV redirect:", process.env.KAKAO_DEV_REDIRECT_URI ?? "MISSING"); console.log("PROD redirect:", process.env.KAKAO_PROD_REDIRECT_URI ?? "MISSING");'
```

Expected: all six variables report `OK`; the redirect URIs match Global Constraints exactly.

- [ ] **Step 3: Push code and align the Replit workspace**

Push the completed local commits to `origin/main`, then in `/home/runner/workspace` fetch and fast-forward or hard-align only after confirming the Replit worktree contains no user changes that need preservation.

Expected: local `main`, `origin/main`, and Replit `main` resolve to the same commit.

- [ ] **Step 4: Run authoritative validation in Replit**

In `/home/runner/workspace`, run:

```bash
npm exec -- tsx --test server/kakao-oauth-config.test.ts server/kakao-oauth-routes.test.ts
npm test
npm run check
npm run build
```

Expected: focused Kakao tests and the full server suite pass, TypeScript exits 0, and the production build exits 0. Existing Vite chunk-size or Browserslist age warnings are allowed; errors are not.

- [ ] **Step 5: Restart and smoke-test development login**

Restart the Replit development workflow, open the development homepage, and initiate Kakao login.

Verify:

- Kakao displays the TEST app identity.
- Callback returns to the exact development callback URI.
- The server does not report a missing `KAKAO_DEV_*` variable.
- Session/onboarding behavior completes against Development Database.

Under the pre-launch reset policy, remove any development test user/session/pending-registration records created only by this smoke check and verify `alumni_database` remains at 3,458 rows.

---

### Task 5: Production publication and final cleanup

**Files:**
- No repository file changes unless verification discovers a defect.

**Interfaces:**
- Consumes: the verified development commit and six App Secrets.
- Produces: a verified production login on the business Kakao app and removal of obsolete generic Secrets.

- [ ] **Step 1: Republish the verified commit**

Republish from Replit only after Task 4 passes. Confirm the published snapshot uses the same commit verified in development.

- [ ] **Step 2: Smoke-test production login**

Open `https://dgkma.org`, initiate Kakao login, and verify:

- Kakao displays the business app identity.
- Callback returns to `https://dgkma.org/kakao-callback`.
- The published server does not report a missing `KAKAO_PROD_*` variable.
- Session/onboarding behavior completes against Production Database.

Before any direct Production Database inspection, follow `docs/database-operations.md`. Under the pre-launch reset policy, remove only records created by this smoke check when they are no longer needed.

- [ ] **Step 3: Remove obsolete generic Kakao Secrets**

Only after both smoke checks pass, remove:

```text
KAKAO_REST_API_KEY
KAKAO_CLIENT_SECRET
KAKAO_REDIRECT_URI
VITE_KAKAO_REST_API_KEY
VITE_KAKAO_REDIRECT_URI
```

Do not remove `KAKAO_DEV_*`, `KAKAO_PROD_*`, unrelated Secrets, or database Secrets.

- [ ] **Step 4: Restart development and Republish once more**

Restart development and verify `/api/auth/kakao/start` still redirects successfully. Republish so the production snapshot is also proven independent of the deleted generic Secrets.

- [ ] **Step 5: Final verification**

Run in Replit:

```bash
npm test
npm run check
npm run build
git status --short --branch
```

Expected: all tests pass, check/build exit 0, Replit `main` matches `origin/main`, and no tracked changes remain.
