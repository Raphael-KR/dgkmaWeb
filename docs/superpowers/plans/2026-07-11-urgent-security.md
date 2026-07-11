# Urgent Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect all administrator APIs and payment creation with server-side administrator authorization, and remove personal data from server logs.

**Architecture:** Add a dependency-injected Express administrator middleware so authorization can be tested without a database. Apply it once to the `/api/admin` route namespace and directly to payment creation, then enforce a source-level privacy logging policy across the Kakao and alumni synchronization paths.

**Tech Stack:** TypeScript 5.6, Express 4, express-session, Node `node:test`, `tsx`, PostgreSQL/Drizzle, Replit

## Global Constraints

- GitHub `main` remains the shared source of truth; implementation is developed on a `codex/` branch and merged only after verification.
- Do not modify or commit `KIKcd_B.20250701.txt` or `KIKcd_B.20250701.xlsx`.
- Do not change the database schema, seed data, or production records.
- Trust only `req.session.userId` for authentication and authorization.
- Unauthenticated administrator requests return `401`; authenticated non-administrator requests return `403`.
- Until a real payment callback exists, only administrators may execute `POST /api/payments`.
- Do not log alumni source rows, names, telephone numbers, addresses, email addresses, birthdays, Kakao identifiers, authorization codes, or complete user objects.
- Preserve Kakao REST OAuth v5, session saving, onboarding, directory scope, boards, obituaries, and object storage behavior.
- Validate application changes in the Replit development workspace with `npm test`, `npm run check`, and `npm run build`.

---

### Task 1: Test Harness and Administrator Middleware

**Files:**
- Modify: `package.json`
- Create: `server/safe-logging.ts`
- Create: `server/auth-middleware.ts`
- Create: `server/auth-middleware.test.ts`

**Interfaces:**
- Consumes: `req.session.userId` and an injected `AdminUserLookup`
- Produces: `getErrorType(error: unknown): string` and `createRequireAdmin(getUser: AdminUserLookup): RequestHandler`

- [ ] **Step 1: Add the test command**

Add this script to `package.json`:

```json
"test": "tsx --test server/*.test.ts"
```

- [ ] **Step 2: Write the failing middleware tests**

Create `server/auth-middleware.test.ts` with response doubles and these cases:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { createRequireAdmin } from "./auth-middleware";

function requestWithUserId(userId?: number): Request {
  return { session: userId === undefined ? {} : { userId } } as unknown as Request;
}

function responseDouble() {
  const state: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      state.status = code;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      return response;
    },
  } as unknown as Response;
  return { response, state };
}

test("requireAdmin returns 401 without a session user", async () => {
  let lookupCalls = 0;
  const middleware = createRequireAdmin(async () => {
    lookupCalls += 1;
    return undefined;
  });
  const { response, state } = responseDouble();

  await middleware(requestWithUserId(), response, (() => {}) as NextFunction);

  assert.equal(state.status, 401);
  assert.equal(lookupCalls, 0);
});

test("requireAdmin returns 401 for a missing session user", async () => {
  const middleware = createRequireAdmin(async () => undefined);
  const { response, state } = responseDouble();
  await middleware(requestWithUserId(7), response, (() => {}) as NextFunction);
  assert.equal(state.status, 401);
});

test("requireAdmin returns 403 for a non-admin user", async () => {
  const middleware = createRequireAdmin(async () => ({ isAdmin: false }));
  const { response, state } = responseDouble();
  await middleware(requestWithUserId(7), response, (() => {}) as NextFunction);
  assert.equal(state.status, 403);
});

test("requireAdmin calls next for an admin user", async () => {
  const middleware = createRequireAdmin(async () => ({ isAdmin: true }));
  const { response, state } = responseDouble();
  let nextCalls = 0;
  await middleware(requestWithUserId(7), response, (() => { nextCalls += 1; }) as NextFunction);
  assert.equal(nextCalls, 1);
  assert.equal(state.status, undefined);
});

test("requireAdmin returns 500 without logging the original error", async () => {
  const originalError = console.error;
  const calls: unknown[][] = [];
  console.error = (...args: unknown[]) => { calls.push(args); };
  try {
    const secretError = new Error("private alumni value");
    const middleware = createRequireAdmin(async () => { throw secretError; });
    const { response, state } = responseDouble();
    await middleware(requestWithUserId(7), response, (() => {}) as NextFunction);
    assert.equal(state.status, 500);
    assert.equal(calls.flat().includes(secretError), false);
    assert.equal(JSON.stringify(calls).includes(secretError.message), false);
  } finally {
    console.error = originalError;
  }
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run in Replit:

```bash
npm test
```

Expected: FAIL because `server/auth-middleware.ts` does not exist.

- [ ] **Step 4: Implement safe error typing and middleware**

Create `server/safe-logging.ts`:

```ts
export function getErrorType(error: unknown): string {
  if (error instanceof Error) {
    return error.name || "Error";
  }
  return "UnknownError";
}
```

Create `server/auth-middleware.ts`:

```ts
import type { RequestHandler } from "express";
import { getErrorType } from "./safe-logging";

export type AdminUserLookup = (
  userId: number,
) => Promise<{ isAdmin?: boolean | null } | undefined>;

export function createRequireAdmin(getUser: AdminUserLookup): RequestHandler {
  return async (req, res, next) => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ message: "로그인이 필요합니다" });
      return;
    }

    try {
      const user = await getUser(userId);
      if (!user) {
        res.status(401).json({ message: "로그인이 필요합니다" });
        return;
      }
      if (!user.isAdmin) {
        res.status(403).json({ message: "관리자 권한이 필요합니다" });
        return;
      }
      next();
    } catch (error) {
      console.error("Admin authorization failed:", getErrorType(error));
      res.status(500).json({ message: "관리자 권한 확인에 실패했습니다" });
    }
  };
}
```

- [ ] **Step 5: Run the focused tests**

Run in Replit:

```bash
npm test
```

Expected: all five middleware tests PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json server/safe-logging.ts server/auth-middleware.ts server/auth-middleware.test.ts
git commit -m "Add administrator authorization middleware"
```

### Task 2: Protect Administrator and Payment Routes

**Files:**
- Modify: `server/routes.ts`
- Create: `server/route-security.test.ts`

**Interfaces:**
- Consumes: `createRequireAdmin`, `storage.getUser`, current Express route registration
- Produces: one namespace guard for `/api/admin/*` and one direct guard for `POST /api/payments`

- [ ] **Step 1: Write the failing route wiring tests**

Create `server/route-security.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routesPath = new URL("./routes.ts", import.meta.url);

test("all admin routes are registered after the shared administrator guard", async () => {
  const source = await readFile(routesPath, "utf8");
  const guardIndex = source.indexOf('app.use("/api/admin", requireAdmin)');
  const adminRouteIndexes = Array.from(source.matchAll(/app\.(?:get|post|patch|put|delete)\("\/api\/admin\//g))
    .map((match) => match.index ?? -1);
  assert.ok(guardIndex >= 0);
  assert.equal(adminRouteIndexes.length, 5);
  assert.ok(adminRouteIndexes.every((index) => index > guardIndex));
});

test("payment creation requires an administrator", async () => {
  const source = await readFile(routesPath, "utf8");
  assert.match(source, /app\.post\("\/api\/payments", requireAdmin,/);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run in Replit:

```bash
npm test
```

Expected: route security tests FAIL because neither guard is wired.

- [ ] **Step 3: Wire the shared middleware**

In `server/routes.ts`:

```ts
import { createRequireAdmin } from "./auth-middleware";
```

Inside `registerRoutes`, before protected routes are registered:

```ts
const requireAdmin = createRequireAdmin((userId) => storage.getUser(userId));
```

Change payment creation to:

```ts
app.post("/api/payments", requireAdmin, async (req, res) => {
```

Immediately before the first administrator route, add:

```ts
app.use("/api/admin", requireAdmin);
```

Remove the obsolete `TODO` saying administrator authorization is missing.

- [ ] **Step 4: Run tests and TypeScript validation**

Run in Replit:

```bash
npm test
npm run check
```

Expected: tests PASS and `tsc` exits `0`.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts server/route-security.test.ts
git commit -m "Protect admin and payment APIs"
```

### Task 3: Enforce Privacy-Safe Server Logging

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/google-sheets.ts`
- Modify: `server/google-sheets-old.ts`
- Modify: `server/storage.ts`
- Create: `server/privacy-logging.test.ts`

**Interfaces:**
- Consumes: `getErrorType` and existing operational log events
- Produces: count-and-stage-only operational logs with no personal source values

- [ ] **Step 1: Write the failing source-level privacy test**

Create `server/privacy-logging.test.ts` using the TypeScript parser to inspect `console` call arguments in the four protected server files. `.length` count expressions, literals, and `getErrorType(error)` are explicitly safe; raw data identifiers, sensitive properties, and raw caught errors are violations.

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const protectedFiles = [
  "routes.ts",
  "google-sheets.ts",
  "google-sheets-old.ts",
  "storage.ts",
];

const sensitiveIdentifiers = new Set([
  "rows",
  "row",
  "user",
  "finalUser",
  "userInfo",
  "userData",
  "alumniData",
  "googleResults",
  "name",
  "email",
  "mobile",
  "phone",
  "phoneNumber",
  "address",
  "birthday",
  "kakaoId",
  "accessToken",
  "code",
  "error",
  "err",
]);

const sensitiveProperties = new Set([
  "name",
  "email",
  "mobile",
  "phone",
  "phoneNumber",
  "address",
  "birthday",
  "kakaoId",
  "accessToken",
  "userData",
]);

function isConsoleCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === "console";
}

function containsSensitiveValue(node: ts.Node): boolean {
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return false;
  }
  if (
    ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === "getErrorType"
  ) {
    return false;
  }
  if (ts.isPropertyAccessExpression(node)) {
    if (node.name.text === "length") {
      return false;
    }
    if (sensitiveProperties.has(node.name.text)) {
      return true;
    }
  }
  if (
    ts.isElementAccessExpression(node)
    && ts.isIdentifier(node.expression)
    && (node.expression.text === "rows" || node.expression.text === "row")
  ) {
    return true;
  }
  if (ts.isIdentifier(node) && sensitiveIdentifiers.has(node.text)) {
    return true;
  }

  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && containsSensitiveValue(child)) {
      found = true;
    }
  });
  return found;
}

test("protected server logs contain no personal source values", async () => {
  const violations: string[] = [];

  for (const fileName of protectedFiles) {
    const fileUrl = new URL(`./${fileName}`, import.meta.url);
    const source = await readFile(fileUrl, "utf8");
    const sourceFile = ts.createSourceFile(
      fileName,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    function visit(node: ts.Node): void {
      if (isConsoleCall(node) && node.arguments.some(containsSensitiveValue)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        violations.push(`${fileName}:${line}`);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

assert.deepEqual(violations, []);
});
```

- [ ] **Step 2: Run the test and confirm it detects current leaks**

Run in Replit:

```bash
npm test
```

Expected: FAIL with violations in `routes.ts`, `google-sheets.ts`, `google-sheets-old.ts`, and `storage.ts`.

- [ ] **Step 3: Sanitize Kakao and administrator route logs**

In `server/routes.ts`:

- Replace Kakao request, registration, and login logs containing values or user objects with fixed event messages.
- Replace `codePrefix` with `hasCode` in the gated OAuth debug log.
- Remove raw session user IDs from the activity-region debug log.
- Import `getErrorType` and replace raw caught error objects in authentication and alumni synchronization logs with `getErrorType(error)`.
- Keep synchronization response statistics because they contain counts only.

- [ ] **Step 4: Sanitize Google Sheets logs**

In both Google Sheets service files:

- Remove header, source row, sample record, duplicate mobile value, and duplicate name value logs.
- Keep total, valid, skipped, duplicate, and match counts.
- Replace phone/name match messages with fixed messages plus counts only.
- Replace raw caught error objects with `getErrorType(error)`.
- Remove `headersLogged` if it is no longer used.

- [ ] **Step 5: Sanitize storage synchronization logs**

In `server/storage.ts`:

- Remove names and raw record objects from match and invalid-row messages.
- Replace existing-record logs containing names or mobile numbers with aggregate progress messages.
- Identify failed rows only by source index, not by name or generation.
- Replace raw caught error objects with `getErrorType(error)` in alumni lookup and synchronization paths.
- Preserve final synchronization counts.

- [ ] **Step 6: Run privacy and full tests**

Run in Replit:

```bash
npm test
```

Expected: privacy violations are empty and all tests PASS.

Run a manual source audit:

```bash
rg -n "console\.(log|info|debug|warn|error)" server/routes.ts server/google-sheets.ts server/google-sheets-old.ts server/storage.ts
```

Expected: log calls contain fixed messages, counts, stages, configuration presence, or `getErrorType(error)` only; no listed personal values or complete objects appear.

- [ ] **Step 7: Commit**

```bash
git add server/routes.ts server/google-sheets.ts server/google-sheets-old.ts server/storage.ts server/privacy-logging.test.ts
git commit -m "Remove personal data from server logs"
```

### Task 4: Replit Verification and Operations Documentation

**Files:**
- Modify: `roadmap.md`
- Modify: `walkthrough.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: test, type-check, build, and post-deploy verification evidence
- Produces: accurate implementation status and production verification checklist

- [ ] **Step 1: Run complete Replit validation**

Run in the Replit development workspace:

```bash
npm test
npm run check
npm run build
```

Expected: all three commands exit `0`. The existing Vite chunk-size and Browserslist notices may remain warnings.

- [ ] **Step 2: Update pre-deploy documentation**

Add these bullets under `CHANGELOG.md` > `Unreleased` > `Security`:

```markdown
- 모든 `/api/admin/*`에 공통 서버 관리자 인증을 적용
- 실제 결제 연동 전까지 결제 기록 생성을 관리자 전용으로 제한
- 카카오 로그인과 Google Sheets 명부 처리 로그에서 개인정보와 원본 행 제거
```

Replace the warning text and checklist in `walkthrough.md` > `관리자 기능 주의사항` with:

```markdown
관리자 화면과 `/api/admin/*`는 서버에서도 관리자 계정을 요구한다. 실제 결제 연동 전까지 결제 기록 생성도 관리자만 수행한다.

- [ ] 비로그인 `GET /api/admin/sync-progress` 요청이 `401`을 반환한다.
- [ ] 일반회원 `GET /api/admin/sync-progress` 요청이 `403`을 반환한다.
- [ ] 관리자 화면에서 가입 승인, Google Sheets 연결 확인, 명부 동기화와 진행 조회가 정상 동작한다.
- [ ] 비로그인 및 일반회원 `POST /api/payments` 요청이 각각 `401`, `403`을 반환하고 기록을 생성하지 않는다.
- [ ] 관리자가 합의된 테스트 결제 기록을 생성하면 `201`을 반환한다.
- [ ] Replit 실행 로그에 동문 원본 행, 이름, 전화번호, 주소, 이메일, 생일, 사용자 객체가 나타나지 않는다.
```

Add `npm test` before the existing check and build commands in `walkthrough.md`:

```bash
npm test
npm run check
npm run build
```

In `roadmap.md`, set the three implemented rows to `진행 중` with `코드·Replit 검증` as evidence. Do not mark them complete before Republish and production verification.

Use these exact row states:

```markdown
| P0 | 관리자 API 보호 | 진행 중 | 코드·Replit 검증 | 모든 `/api/admin/*`가 비로그인 요청에 `401`, 일반회원 요청에 `403`, 관리자 요청에 성공 응답 | 공통 `requireAdmin` 정책 |
| P0 | 결제 기록 보호 | 진행 중 | 코드·Replit 검증 | 공개 결제 기록 생성이 차단되고 관리자 또는 검증된 결제 콜백만 기록을 생성 | 결제 기록 작성 주체 결정 |
| P1 | 개인정보 로그 제거 | 진행 중 | 코드·Replit 검증 | 동문 원본 행·이름·전화번호·주소·이메일·생일·사용자 객체가 로그에 출력되지 않고 건수·처리 단계·마스킹된 식별자만 기록 | 없음 |
```

- [ ] **Step 3: Verify documentation and diff integrity**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only scoped implementation, tests, plans, and operations documents are changed. The two `KIKcd_B.20250701.*` files remain untracked and unstaged.

- [ ] **Step 4: Commit documentation**

```bash
git add roadmap.md walkthrough.md CHANGELOG.md
git commit -m "Document urgent security verification"
```

- [ ] **Step 5: Push and synchronize Replit**

Push the implementation branch, merge it into GitHub `main` after all automated checks pass, then update the Replit development workspace with:

```bash
git pull --ff-only origin main
```

Expected: local GitHub `main` and Replit development workspace resolve to the same commit.

- [ ] **Step 6: Republish and run production checks**

After the user completes Republish, verify:

```bash
curl -i https://dgkma.replit.app/api/admin/sync-progress
curl -i -X POST https://dgkma.replit.app/api/payments \
  -H "Content-Type: application/json" \
  -d '{"userId":1,"amount":1,"year":2026,"type":"verification","status":"pending"}'
```

Expected: both unauthenticated requests return `401` and create no payment record. The user then verifies a normal member receives `403` and an administrator can access the admin screen. Administrator payment creation is tested only with an agreed reversible record.

- [ ] **Step 7: Mark roadmap completion after production evidence**

Only after all production checks pass, change the three roadmap rows from `진행 중` to `기능 검증 완료`, record `프로덕션 검증` as evidence, and commit the final status update.
