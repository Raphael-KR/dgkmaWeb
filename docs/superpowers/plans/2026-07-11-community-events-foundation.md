# Community Events Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add typed community-event contracts, PostgreSQL storage, an idempotent obituary migration, and authenticated event APIs while keeping the existing obituary application operational.

**Architecture:** A new `community_events` table stores draft and published records for four event types. Type-specific data is validated with Zod before it enters a JSONB `details` column. Existing obituary rows are copied by an explicit SQL script with `legacy_obituary_id` as the idempotency key; existing `/api/obituaries` routes remain unchanged in this plan.

**Tech Stack:** TypeScript 5.6, Zod 3, Express 4, Drizzle ORM 0.39, PostgreSQL, Node `node:test`, Replit

## Global Constraints

- Branch from current `main` into an isolated `codex/community-events-foundation` worktree.
- Do not execute migration SQL from tests or application startup.
- Event types are exactly `obituary`, `wedding`, `opening`, and `other`.
- Event statuses are exactly `draft` and `published`.
- All `/api/events/*` routes require `req.session.userId`.
- Draft reads, writes, and deletes are owner-only.
- Published list/detail responses must not expose `sourceText`.
- Existing obituary APIs and tables remain available throughout this plan.
- Validate in Replit with `npm test`, `npm run check`, and `npm run build`.

---

### Task 1: Shared Event Contracts

**Files:**
- Create: `shared/community-events.ts`
- Create: `server/community-events-contract.test.ts`

**Interfaces:**
- Produces: `COMMUNITY_EVENT_TYPES`, `COMMUNITY_EVENT_STATUSES`, `communityEventDraftSchema`, `communityEventPublishSchema`, `CommunityEventDraftInput`, `CommunityEventDetails`
- Consumes: Zod only; no database or server imports

- [ ] **Step 1: Write the failing contract tests**

Create `server/community-events-contract.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMUNITY_EVENT_STATUSES,
  COMMUNITY_EVENT_TYPES,
  communityEventDraftSchema,
  communityEventPublishSchema,
} from "@shared/community-events";

test("community event types and statuses are fixed", () => {
  assert.deepEqual(COMMUNITY_EVENT_TYPES, ["obituary", "wedding", "opening", "other"]);
  assert.deepEqual(COMMUNITY_EVENT_STATUSES, ["draft", "published"]);
});

test("drafts may be incomplete but published events require common fields", () => {
  assert.equal(communityEventDraftSchema.safeParse({ eventType: "obituary" }).success, true);
  assert.equal(communityEventPublishSchema.safeParse({ eventType: "obituary" }).success, false);
  assert.equal(communityEventPublishSchema.safeParse({
    eventType: "wedding",
    title: "결혼 소식",
    eventDate: "2026-08-01",
    relatedMemberName: "김동국",
    details: {},
  }).success, true);
});

test("published obituaries enforce the writing guide", () => {
  const base = {
    eventType: "obituary" as const,
    title: "부친상",
    eventDate: "2026-07-12",
    location: "동국병원 장례식장 1호실",
    relatedMemberName: "김동국",
    details: {
      deceasedName: "김한의",
      deceasedAge: 88,
      relationship: "부친",
      funeralDate: "2026년 7월 12일(일요일)",
      funeralHome: "동국병원 장례식장 1호실",
    },
  };
  assert.equal(communityEventPublishSchema.safeParse(base).success, true);
  assert.equal(communityEventPublishSchema.safeParse({
    ...base,
    details: { ...base.details, deceasedAge: undefined },
  }).success, false);
});
```

- [ ] **Step 2: Run RED verification in Replit**

Run:

```bash
npm test
```

Expected: FAIL because `@shared/community-events` does not exist.

- [ ] **Step 3: Implement the shared contracts**

Create `shared/community-events.ts`:

```ts
import { z } from "zod";

export const COMMUNITY_EVENT_TYPES = ["obituary", "wedding", "opening", "other"] as const;
export const COMMUNITY_EVENT_STATUSES = ["draft", "published"] as const;
export const OBITUARY_RELATIONSHIPS = [
  "본인", "부친", "모친", "빙부", "빙모", "시부", "시모", "자녀",
] as const;

export const obituaryDetailsSchema = z.object({
  deceasedName: z.string().trim().min(1).optional(),
  deceasedAge: z.number().int().positive().max(130).optional(),
  relationship: z.enum(OBITUARY_RELATIONSHIPS).optional(),
  funeralDate: z.string().trim().min(1).optional(),
  funeralHome: z.string().trim().min(1).optional(),
  accountInfo: z.string().trim().optional(),
  sourceUrl: z.string().url().optional(),
  memberTitle: z.string().trim().optional(),
  familyContact: z.string().trim().optional(),
  burialPlace: z.string().trim().optional(),
  chiefMourner: z.string().trim().optional(),
});

const commonDraftFields = {
  eventType: z.enum(COMMUNITY_EVENT_TYPES),
  title: z.string().trim().optional(),
  eventDate: z.string().trim().optional(),
  location: z.string().trim().optional(),
  relatedMemberName: z.string().trim().optional(),
  contactNumber: z.string().trim().optional(),
  accountInfo: z.string().trim().optional(),
  sourceText: z.string().max(20_000).optional(),
  sourceUrls: z.array(z.string().url()).max(3).default([]),
};

export const communityEventDraftSchema = z.object({
  ...commonDraftFields,
  details: z.record(z.unknown()).default({}),
});

const publishedCommonSchema = communityEventDraftSchema.extend({
  title: z.string().trim().min(1),
  eventDate: z.string().trim().min(1),
  relatedMemberName: z.string().trim().min(1),
});

export const communityEventPublishSchema = z.discriminatedUnion("eventType", [
  publishedCommonSchema.extend({
    eventType: z.literal("obituary"),
    location: z.string().trim().min(1),
    details: obituaryDetailsSchema.extend({
      deceasedName: z.string().trim().min(1),
      deceasedAge: z.number().int().positive().max(130),
      relationship: z.enum(OBITUARY_RELATIONSHIPS),
      funeralDate: z.string().trim().min(1),
      funeralHome: z.string().trim().min(1),
    }),
  }),
  publishedCommonSchema.extend({ eventType: z.literal("wedding") }),
  publishedCommonSchema.extend({ eventType: z.literal("opening") }),
  publishedCommonSchema.extend({ eventType: z.literal("other") }),
]);

export type CommunityEventDraftInput = z.infer<typeof communityEventDraftSchema>;
export type CommunityEventPublishInput = z.infer<typeof communityEventPublishSchema>;
export type CommunityEventDetails = z.infer<typeof obituaryDetailsSchema> | Record<string, unknown>;
export type CommunityEventType = (typeof COMMUNITY_EVENT_TYPES)[number];
export type CommunityEventStatus = (typeof COMMUNITY_EVENT_STATUSES)[number];
```

- [ ] **Step 4: Run GREEN verification**

Run:

```bash
npx tsx --test server/community-events-contract.test.ts
npm run check
```

Expected: all three tests PASS and `tsc` exits `0`.

- [ ] **Step 5: Commit**

```bash
git add shared/community-events.ts server/community-events-contract.test.ts
git commit -m "Add community event contracts"
```

### Task 2: PostgreSQL Schema and Storage Boundary

**Files:**
- Modify: `shared/schema.ts`
- Modify: `server/storage.ts`
- Create: `server/community-events-storage-contract.test.ts`

**Interfaces:**
- Consumes: shared event type/status/detail contracts from Task 1
- Produces: `CommunityEvent`, `InsertCommunityEvent`, and `IStorage` methods for published events and owner drafts

- [ ] **Step 1: Write a failing schema/storage contract test**

Create `server/community-events-storage-contract.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("community event schema contains migration and ownership fields", async () => {
  const schema = await readFile(new URL("../shared/schema.ts", import.meta.url), "utf8");
  assert.match(schema, /pgTable\("community_events"/);
  assert.match(schema, /legacyObituaryId: integer\("legacy_obituary_id"\)\.unique\(\)/);
  assert.match(schema, /eventType: text\("event_type"\)\.notNull\(\)/);
  assert.match(schema, /status: text\("status"\)\.notNull\(\)\.default\("draft"\)/);
  assert.match(schema, /details: jsonb\("details"\)/);
  assert.match(schema, /authorId: integer\("author_id"\)/);
});

test("storage exposes owner-scoped draft methods", async () => {
  const storage = await readFile(new URL("./storage.ts", import.meta.url), "utf8");
  assert.match(storage, /getLatestEventDraft\(authorId: number, eventType: CommunityEventType\)/);
  assert.match(storage, /updateEventDraft\(id: number, authorId: number,/);
  assert.match(storage, /deleteEventDraft\(id: number, authorId: number\)/);
});
```

- [ ] **Step 2: Run RED verification**

Run:

```bash
npx tsx --test server/community-events-storage-contract.test.ts
```

Expected: FAIL because the table and methods are absent.

- [ ] **Step 3: Add the table and exported types**

In `shared/schema.ts`, add a `communityEvents` table with these exact columns:

```ts
export const communityEvents = pgTable("community_events", {
  id: serial("id").primaryKey(),
  legacyObituaryId: integer("legacy_obituary_id").unique(),
  eventType: text("event_type").notNull(),
  status: text("status").notNull().default("draft"),
  title: text("title"),
  eventDate: text("event_date"),
  location: text("location"),
  relatedMemberName: text("related_member_name"),
  contactNumber: text("contact_number"),
  accountInfo: text("account_info"),
  sourceText: text("source_text"),
  sourceUrls: text("source_urls").array().default([]),
  details: jsonb("details").$type<CommunityEventDetails>().notNull().default({}),
  authorId: integer("author_id").references(() => users.id),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type CommunityEvent = typeof communityEvents.$inferSelect;
export type InsertCommunityEvent = typeof communityEvents.$inferInsert;
```

Import `CommunityEventDetails` from `@shared/community-events` and add the `usersRelations`/`communityEventsRelations` relation definitions.

- [ ] **Step 4: Add storage interfaces and implementations**

Add these exact signatures to `IStorage` and implement them in `DatabaseStorage` with Drizzle predicates that include both `id` and `authorId` for draft mutations:

```ts
getPublishedEvents(eventType?: CommunityEventType): Promise<CommunityEvent[]>;
getPublishedEvent(id: number): Promise<CommunityEvent | undefined>;
getLatestEventDraft(authorId: number, eventType: CommunityEventType): Promise<CommunityEvent | undefined>;
createEventDraft(authorId: number, data: CommunityEventDraftInput): Promise<CommunityEvent>;
updateEventDraft(id: number, authorId: number, data: CommunityEventDraftInput): Promise<CommunityEvent | undefined>;
deleteEventDraft(id: number, authorId: number): Promise<boolean>;
publishEvent(id: number, authorId: number, data: CommunityEventPublishInput): Promise<CommunityEvent | undefined>;
```

Import `CommunityEventType` from the shared contract. `getPublishedEvents` must select only `status = 'published'`; `publishEvent` must set `status`, `publishedAt`, and `updatedAt` while filtering by owner. New drafts always receive the session user ID even though the column remains nullable to preserve legacy rows whose author was deleted or absent.

- [ ] **Step 5: Run GREEN verification**

Run:

```bash
npx tsx --test server/community-events-contract.test.ts server/community-events-storage-contract.test.ts
npm run check
```

Expected: contract tests PASS and `tsc` exits `0`.

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts server/storage.ts server/community-events-storage-contract.test.ts
git commit -m "Add community event storage"
```

### Task 3: Idempotent Legacy Obituary Migration

**Files:**
- Create: `scripts/migrate-obituaries-to-community-events.sql`
- Create: `server/community-events-migration.test.ts`
- Modify: `replit.md`

**Interfaces:**
- Consumes: `community_events.legacy_obituary_id` from Task 2
- Produces: explicit, repeatable data migration and verification queries; no automatic execution

- [ ] **Step 1: Write the failing migration contract test**

Create `server/community-events-migration.test.ts` that reads the SQL and asserts:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("legacy obituary migration is explicit and idempotent", async () => {
  const sql = await readFile(
    new URL("../scripts/migrate-obituaries-to-community-events.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /INSERT INTO community_events/);
  assert.match(sql, /'obituary'/);
  assert.match(sql, /'published'/);
  assert.match(sql, /jsonb_build_object/);
  assert.match(sql, /ON CONFLICT \(legacy_obituary_id\) DO NOTHING/);
  assert.match(sql, /FROM obituaries/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});
```

- [ ] **Step 2: Run RED verification**

Run:

```bash
npx tsx --test server/community-events-migration.test.ts
```

Expected: FAIL with `ENOENT`.

- [ ] **Step 3: Create the migration SQL**

Create one `INSERT ... SELECT` statement that maps:

```sql
INSERT INTO community_events (
  legacy_obituary_id, event_type, status, title, event_date, location,
  related_member_name, contact_number, account_info, source_urls, details,
  author_id, published_at, created_at, updated_at
)
SELECT
  id,
  'obituary',
  'published',
  title,
  date_of_death,
  funeral_home,
  chief_mourner,
  contact_number,
  bank_account,
  ARRAY[]::text[],
  jsonb_strip_nulls(jsonb_build_object(
    'deceasedName', deceased_name,
    'relationship', deceased_relation,
    'funeralDate', date_of_death,
    'funeralHome', funeral_home,
    'accountInfo', bank_account,
    'familyContact', contact_number,
    'burialPlace', jangji,
    'chiefMourner', chief_mourner
  )),
  author_id,
  created_at,
  created_at,
  created_at
FROM obituaries
ON CONFLICT (legacy_obituary_id) DO NOTHING;
```

Do not invent `deceasedAge`; migrated rows may remain published legacy records and must be edited before regenerating a standards-compliant announcement.

- [ ] **Step 4: Document environment-by-environment execution**

Add to `replit.md`:

```text
1. Apply the schema in the development database.
2. Record counts from obituaries and community_events.
3. Run scripts/migrate-obituaries-to-community-events.sql in the development SQL console.
4. Verify migrated count, legacy_obituary_id uniqueness, event_type, status, and author_id.
5. Repeat the script and verify the count does not change.
6. Republish code only after development verification.
7. Apply schema and data migration separately in the production SQL console.
8. Keep obituaries unchanged until rollback and route compatibility are verified.
```

- [ ] **Step 5: Run GREEN verification**

Run:

```bash
npx tsx --test server/community-events-migration.test.ts
git diff --check
```

Expected: PASS and no whitespace errors. Do not execute the SQL in this task.

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-obituaries-to-community-events.sql server/community-events-migration.test.ts replit.md
git commit -m "Add legacy obituary migration"
```

### Task 4: Authenticated Community Event APIs

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/route-security.test.ts`
- Create: `server/community-events-routes.test.ts`

**Interfaces:**
- Consumes: `requireAuthenticated`, shared schemas, and storage methods from Tasks 1-2
- Produces: member-only `/api/events` published and draft endpoints

- [ ] **Step 1: Write failing live HTTP tests**

Use the existing `startAuthorizationTestServer` pattern. Mock the event storage methods with `t.mock.method`. Assert this matrix:

```text
GET    /api/events                         anonymous 401, member 200
GET    /api/events/1                       anonymous 401, member 200
GET    /api/events/drafts/latest?type=...  anonymous 401, member 200/404
POST   /api/events/drafts                  anonymous 401, member 201
PATCH  /api/events/drafts/1                anonymous 401, owner 200, other member 404
DELETE /api/events/drafts/1                anonymous 401, owner 204, other member 404
POST   /api/events/1/publish               anonymous 401, owner 200, missing fields 400
```

Also assert request `authorId: 1` never reaches storage and the session user ID does.

- [ ] **Step 2: Run RED verification**

Run:

```bash
npx tsx --test server/community-events-routes.test.ts
```

Expected: FAIL with `404` for the new routes.

- [ ] **Step 3: Register the protected namespace**

Before the first event route, add:

```ts
app.use("/api/events", requireAuthenticated);
```

Register route order exactly as follows so static draft paths are not captured by `/:id`:

```text
GET /api/events/drafts/latest
POST /api/events/drafts
PATCH /api/events/drafts/:id
DELETE /api/events/drafts/:id
POST /api/events/:id/publish
GET /api/events
GET /api/events/:id
```

Parse every ID with a shared positive-integer helper. Parse draft bodies with `communityEventDraftSchema` and publish bodies with `communityEventPublishSchema`. Return `400` for Zod errors, `404` for owner-scoped misses, and never include `sourceText` in published list/detail JSON.

- [ ] **Step 4: Run GREEN verification**

Run:

```bash
npx tsx --test server/community-events-routes.test.ts server/route-security.test.ts
npm test
npm run check
```

Expected: all tests PASS and `tsc` exits `0`.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts server/route-security.test.ts server/community-events-routes.test.ts
git commit -m "Add authenticated community event APIs"
```

### Task 5: Foundation Review, Replit Verification, and Deployment Gate

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `walkthrough.md`
- Modify: `roadmap.md`

- [ ] **Step 1: Update documentation without claiming migration completion**

Record the new API and migration script as `진행 중`. Add walkthrough checks for anonymous `401`, member draft ownership, and published type filtering. Keep existing obituary checks.

- [ ] **Step 2: Run complete Replit verification**

Run:

```bash
npm test
npm run check
npm run build
git diff --check
```

Expected: zero failing tests, `tsc` exit `0`, build exit `0`; existing Browserslist/chunk-size warnings may remain.

- [ ] **Step 3: Request code review**

Review auth bypasses, draft ownership, published response privacy, schema/migration consistency, and accidental automatic SQL execution. Resolve all P0-P2 findings and rerun Step 2.

- [ ] **Step 4: Merge and deploy code without running data migration automatically**

Merge to `main`, push, sync Replit `main`, rerun Step 2, and Republish. Then apply schema and migration through the approved development/production SQL-console sequence.

- [ ] **Step 5: Verify migration and production API**

Verify:

```sql
SELECT count(*) FROM obituaries;
SELECT count(*) FROM community_events WHERE legacy_obituary_id IS NOT NULL;
SELECT legacy_obituary_id, count(*)
FROM community_events
WHERE legacy_obituary_id IS NOT NULL
GROUP BY legacy_obituary_id
HAVING count(*) > 1;
```

Expected: the first two counts match, including legacy rows without an author, and the duplicate query returns no rows. Anonymous event API requests return `401`; a real member can create, update, restore, and delete only their own draft.
