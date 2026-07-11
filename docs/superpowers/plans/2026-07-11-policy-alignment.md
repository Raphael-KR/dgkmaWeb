# Policy Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make obituary APIs member-only, enforce the approved board categories on both server and client, and align registration, category seed, planning, and verification documents with approved operations policy.

**Architecture:** Add a session-only Express middleware for member API namespaces. Keep selectable post category names in one shared policy module consumed by the server and React form, while an idempotent SQL seed defines the complete operational category set including the reserved `all` filter.

**Tech Stack:** TypeScript 5.6, Express 4, React 18, Node `node:test`, `tsx`, PostgreSQL/Drizzle, SQL, Replit

## Global Constraints

- Develop on a `codex/` branch in an isolated worktree and merge only after Replit verification and code review.
- Do not modify or commit `KIKcd_B.20250701.txt` or `KIKcd_B.20250701.xlsx`.
- Do not change the database schema or execute category seed SQL against development or production databases.
- Keep `/about/condolence` public while protecting all `/api/obituary/*` and `/api/obituaries/*` routes.
- Use only `req.session.userId` as the member authentication source.
- Preserve `authorId` assignment from the session and never accept it from request data.
- Selectable post categories are exactly `notice`, `free`, `event`, and `news`, and must be active.
- `all` remains a reserved list filter and must never be accepted as a post category.
- Preserve the current `202` pending-registration flow for unmatched alumni.
- Validate in the Replit development workspace with `npm test`, `npm run check`, and `npm run build`.

---

### Task 1: Member Authentication for Obituary APIs

**Files:**
- Modify: `server/auth-middleware.test.ts`
- Modify: `server/auth-middleware.ts`
- Modify: `server/route-security.test.ts`
- Modify: `server/routes.ts`

**Interfaces:**
- Consumes: `req.session.userId`
- Produces: `requireAuthenticated: RequestHandler` and two protected obituary route namespaces

- [ ] **Step 1: Write failing middleware tests**

Add these tests to `server/auth-middleware.test.ts`:

```ts
import { createRequireAdmin, requireAuthenticated } from "./auth-middleware";

test("requireAuthenticated returns 401 without a session user", () => {
  const { response, state } = responseDouble();
  let nextCalls = 0;
  requireAuthenticated(
    requestWithUserId(),
    response,
    (() => { nextCalls += 1; }) as NextFunction,
  );
  assert.equal(state.status, 401);
  assert.equal(nextCalls, 0);
});

test("requireAuthenticated calls next with a session user", () => {
  const { response, state } = responseDouble();
  let nextCalls = 0;
  requireAuthenticated(
    requestWithUserId(7),
    response,
    (() => { nextCalls += 1; }) as NextFunction,
  );
  assert.equal(state.status, undefined);
  assert.equal(nextCalls, 1);
});
```

- [ ] **Step 2: Add the failing live HTTP access test**

Extend `server/route-security.test.ts` with one test using the existing `startAuthorizationTestServer` helper:

```ts
test("obituary APIs require a member session", async () => {
  const memberId = 2_147_483_646;
  const server = await startAuthorizationTestServer(async () => ({ isAdmin: false }));

  try {
    const anonymousList = await fetch(`${server.baseUrl}/api/obituaries`);
    assert.equal(anonymousList.status, 401);

    const anonymousDetail = await fetch(`${server.baseUrl}/api/obituaries/1`);
    assert.equal(anonymousDetail.status, 401);

    const anonymousParse = await fetch(`${server.baseUrl}/api/obituary/parse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "故 홍길동" }),
    });
    assert.equal(anonymousParse.status, 401);

    const anonymousCreate = await fetch(`${server.baseUrl}/api/obituaries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(anonymousCreate.status, 401);

    const memberParse = await fetch(`${server.baseUrl}/api/obituary/parse`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": String(memberId),
      },
      body: JSON.stringify({ text: "故 홍길동" }),
    });
    assert.equal(memberParse.status, 200);
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 3: Run the tests and confirm RED**

Run in Replit:

```bash
npm test
```

Expected: import failure for `requireAuthenticated` or obituary anonymous access assertions fail because list, detail, and parse are still public.

- [ ] **Step 4: Implement the member middleware**

Add to `server/auth-middleware.ts`:

```ts
export const requireAuthenticated: RequestHandler = (req, res, next) => {
  if (!req.session?.userId) {
    res.status(401).json({ message: "로그인이 필요합니다" });
    return;
  }
  next();
};
```

- [ ] **Step 5: Apply it to both obituary namespaces**

Import `requireAuthenticated` in `server/routes.ts` and add before the first obituary route:

```ts
app.use("/api/obituary", requireAuthenticated);
app.use("/api/obituaries", requireAuthenticated);
```

Keep the defensive session check in obituary creation and continue filling `authorId` from `req.session.userId`.

- [ ] **Step 6: Run GREEN verification**

Run in Replit:

```bash
npm test
npm run check
```

Expected: all tests pass and `tsc` exits `0`.

- [ ] **Step 7: Commit**

```bash
git add server/auth-middleware.test.ts server/auth-middleware.ts server/route-security.test.ts server/routes.ts
git commit -m "Require membership for obituary APIs"
```

### Task 2: Shared Selectable Post Category Policy

**Files:**
- Create: `shared/category-policy.ts`
- Create: `server/category-policy.test.ts`
- Modify: `server/routes.ts`
- Modify: `client/src/pages/boards.tsx`

**Interfaces:**
- Consumes: category objects containing `name` and `isActive`
- Produces: `POST_CATEGORY_NAMES` and `isSelectablePostCategory(category)` shared by server and client

- [ ] **Step 1: Write the failing category policy test**

Create `server/category-policy.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  POST_CATEGORY_NAMES,
  isSelectablePostCategory,
} from "@shared/category-policy";

test("only the four approved active post categories are selectable", () => {
  assert.deepEqual(POST_CATEGORY_NAMES, ["notice", "free", "event", "news"]);
  for (const name of POST_CATEGORY_NAMES) {
    assert.equal(isSelectablePostCategory({ name, isActive: true }), true);
  }
  assert.equal(isSelectablePostCategory({ name: "all", isActive: true }), false);
  assert.equal(isSelectablePostCategory({ name: "notice", isActive: false }), false);
  assert.equal(isSelectablePostCategory({ name: "market", isActive: true }), false);
  assert.equal(isSelectablePostCategory(undefined), false);
});

test("server and board form use the shared category policy", async () => {
  const routes = await readFile(new URL("./routes.ts", import.meta.url), "utf8");
  const boards = await readFile(
    new URL("../client/src/pages/boards.tsx", import.meta.url),
    "utf8",
  );
  assert.match(routes, /isSelectablePostCategory\(category\)/);
  assert.match(boards, /\.filter\(isSelectablePostCategory\)/);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run in Replit:

```bash
npm test
```

Expected: FAIL because `@shared/category-policy` does not exist.

- [ ] **Step 3: Implement the shared policy**

Create `shared/category-policy.ts`:

```ts
export const POST_CATEGORY_NAMES = ["notice", "free", "event", "news"] as const;

export type SelectablePostCategory = {
  name: string;
  isActive?: boolean | null;
};

export function isSelectablePostCategory(
  category: SelectablePostCategory | null | undefined,
): boolean {
  return category?.isActive === true
    && POST_CATEGORY_NAMES.includes(category.name as typeof POST_CATEGORY_NAMES[number]);
}
```

- [ ] **Step 4: Add server enforcement**

Import `isSelectablePostCategory` in `server/routes.ts`. After `insertPostSchema.parse(rest)` and before image validation, add:

```ts
const category = validatedData.categoryId == null
  ? undefined
  : await storage.getCategory(validatedData.categoryId);
if (!isSelectablePostCategory(category)) {
  return res.status(400).json({ message: "게시글 카테고리를 선택해주세요" });
}
```

- [ ] **Step 5: Use the same policy in the board form**

Import `isSelectablePostCategory` from `@shared/category-policy` in `client/src/pages/boards.tsx`. Replace:

```ts
.filter((cat: Category) => cat.name !== "all")
```

with:

```ts
.filter(isSelectablePostCategory)
```

- [ ] **Step 6: Run tests and type checking**

Run in Replit:

```bash
npm test
npm run check
```

Expected: all tests pass and `tsc` exits `0`.

- [ ] **Step 7: Commit**

```bash
git add shared/category-policy.ts server/category-policy.test.ts server/routes.ts client/src/pages/boards.tsx
git commit -m "Enforce approved post categories"
```

### Task 3: Idempotent Category Seed and Policy Documents

**Files:**
- Create: `scripts/seed-categories.sql`
- Create: `server/category-seed.test.ts`
- Modify: `planning_proposal.md`
- Modify: `walkthrough.md`
- Modify: `roadmap.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: approved category names, current production colors and variants, approved pending-registration policy
- Produces: reusable operational seed and consistent planning/verification status

- [ ] **Step 1: Write the failing seed contract test**

Create `server/category-seed.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("category seed defines the approved ordered idempotent set", async () => {
  const sql = await readFile(
    new URL("../scripts/seed-categories.sql", import.meta.url),
    "utf8",
  );
  const names = Array.from(sql.matchAll(/\('(all|notice|free|event|news)'/g))
    .map((match) => match[1]);
  assert.deepEqual(names, ["all", "notice", "free", "event", "news"]);
  assert.match(sql, /ON CONFLICT \(name\) DO UPDATE/);
  assert.match(sql, /is_active = true/);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run in Replit:

```bash
npm test
```

Expected: FAIL with `ENOENT` because the seed file does not exist.

- [ ] **Step 3: Create the idempotent seed**

Create `scripts/seed-categories.sql`:

```sql
INSERT INTO categories (
  name,
  display_name,
  color,
  badge_variant,
  is_active,
  sort_order
)
VALUES
  ('all', '전체', '#6b7280', 'secondary', true, 0),
  ('notice', '공지', '#ef4444', 'destructive', true, 1),
  ('free', '자유', '#3b82f6', 'default', true, 2),
  ('event', '행사', '#22c55e', 'secondary', true, 3),
  ('news', '소식', '#f59e0b', 'outline', true, 4)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  color = EXCLUDED.color,
  badge_variant = EXCLUDED.badge_variant,
  is_active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
```

Do not execute this SQL in either database.

- [ ] **Step 4: Align the product plan**

In `planning_proposal.md`:

- Replace unmatched registration rejection with administrator approval waiting and remove the unresolved policy note.
- Change Community status to `구현 완료` for the current board scope.
- Replace the old five proposed tags with the approved categories `공지`, `자유`, `행사`, `소식`, documenting `전체` as a reserved filter.
- Replace the obituary access policy decision with confirmed member-only access.

- [ ] **Step 5: Update verification and roadmap state**

In `walkthrough.md`:

- State unmatched registration approval waiting as confirmed policy, not an open decision.
- Add anonymous `401` and member success checks for obituary list, detail, parse, and create.
- State that `전체` is never selectable during post creation.

In `roadmap.md`:

- Set obituary access to `진행 중` with policy approval and code/Replit evidence until Republish.
- Set unmatched registration policy to `진행 중` until an actual unmatched account is verified.
- Set board category policy to `기능 검증 완료` using the already confirmed production API and UI behavior.
- Remove the corresponding unresolved dependency notes from the completed foundation table.

Add these `CHANGELOG.md` security/changed bullets:

```markdown
- 부고 목록·상세·문자 파싱·등록 API를 로그인 회원 전용으로 통일
- 게시글 작성 시 활성화된 공지·자유·행사·소식 분류만 허용
- 명부 불일치 가입을 관리자 승인 대기 정책으로 확정
- 운영 카테고리 기준을 재현하는 idempotent seed SQL 추가
```

- [ ] **Step 6: Run tests and document checks**

Run in Replit:

```bash
npm test
npm run check
npm run build
```

Run locally:

```bash
git diff --check
rg -n "정책 결정 필요|가입 거부|안내.*경조사.*장터.*임상정보" planning_proposal.md walkthrough.md roadmap.md
```

Expected: all Replit commands exit `0`; no stale policy statement remains for the three approved decisions.

- [ ] **Step 7: Commit**

```bash
git add scripts/seed-categories.sql server/category-seed.test.ts planning_proposal.md walkthrough.md roadmap.md CHANGELOG.md
git commit -m "Align approved membership and board policies"
```

### Task 4: Review, Merge, and Production Verification

**Files:**
- No new files unless review finds a defect

**Interfaces:**
- Consumes: complete feature branch and Replit verification evidence
- Produces: reviewed GitHub `main`, synchronized Replit workspace, and post-Republish checklist

- [ ] **Step 1: Run final Replit verification**

Run:

```bash
npm test
npm run check
npm run build
```

Expected: all tests pass and both build commands exit `0`; existing Browserslist and chunk-size warnings may remain.

- [ ] **Step 2: Request focused code review**

Review the branch diff against this plan and `docs/superpowers/specs/2026-07-11-policy-alignment-design.md`, prioritizing authentication bypasses, category validation gaps, data mutation, and missing tests. Resolve every critical or important finding before merge.

- [ ] **Step 3: Merge and synchronize**

Fast-forward local `main`, push GitHub `main`, switch Replit back to `main`, and pull with `--ff-only`. Preserve Replit-owned `.replit` changes and local KIK files.

- [ ] **Step 4: Verify the merged SHA**

Confirm local `HEAD`, GitHub `refs/heads/main`, and Replit `HEAD` are identical. Re-run `npm test`, `npm run check`, and `npm run build` in Replit on `main`.

- [ ] **Step 5: Republish and verify production**

After user Republish, unauthenticated requests to list, detail, and parse must return `401`. The user verifies member list/detail/parse/create flows and, when an unmatched test account is available, the `202` approval queue flow. Only then mark the remaining roadmap rows complete.
