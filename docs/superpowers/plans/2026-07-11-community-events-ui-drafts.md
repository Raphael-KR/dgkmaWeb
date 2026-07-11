# Community Events UI and Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a member-only `/events` page with an always-visible event composer, owner-scoped server draft recovery, standard obituary preview, and a type-filtered published list.

**Architecture:** Split the page into focused composer, form, and list components. A draft hook creates a server draft on first meaningful input and debounces owner-scoped PATCH requests. Publishing validates the shared schema, renders a deterministic obituary template on the server/shared layer, invalidates event queries, and resets the composer without leaving the page.

**Tech Stack:** React 18, TanStack Query 5, React Hook Form, Zod, Wouter, TypeScript, Node `node:test`, Replit

## Global Constraints

- Begin only after the foundation plan is merged, deployed, and its production API is verified.
- The composer is visible by default and is not hidden behind an accordion or modal.
- Use segmented controls/tabs for `부고`, `결혼`, `개원`, and `기타`.
- Do not show internal IDs, raw source text, or another member's draft.
- Published-event list/detail data remains member-only.
- `/o`, `/o/new`, and `/o/:id` remain compatible.
- Do not add a new component library or frontend test framework.
- Validate in Replit with `npm test`, `npm run check`, and `npm run build`.

---

### Task 1: Deterministic Obituary Announcement Renderer

**Files:**
- Create: `shared/obituary-announcement.ts`
- Create: `server/obituary-announcement.test.ts`

**Interfaces:**
- Consumes: validated obituary event data plus server-sourced member display data
- Produces: `renderObituaryAnnouncement(input): string`

- [ ] **Step 1: Write failing renderer tests**

Create tests for the exact writing-guide behavior:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { renderObituaryAnnouncement } from "@shared/obituary-announcement";

const input = {
  graduationClass: "8기",
  admissionYear: "86학번",
  memberName: "김동국",
  membershipTier: "권리회원",
  memberTitle: "동국한의원 원장",
  relationship: "부친" as const,
  deceasedName: "김한의",
  deceasedAge: 88,
  funeralHome: "동국병원 장례식장 202호실",
  funeralDate: "2026년 6월 12일(금요일)",
  memberPhone: "010-0000-0000",
  accountInfo: "동국은행 000-000-000000 김동국",
  sourceUrl: "https://example.com/obituary",
};

test("renders the approved obituary template", () => {
  const text = renderObituaryAnnouncement(input);
  assert.match(text, /^#부고\n/);
  assert.match(text, /김동국 권리회원\(동국한의원 원장\) 부친상/);
  assert.match(text, /故김한의 \(향년 88세\)/);
  assert.match(text, /삼가 고인의 명복을 빕니다/);
});

test("self obituary adds the member-self tag", () => {
  assert.match(renderObituaryAnnouncement({ ...input, relationship: "본인" }), /^#부고 #동문본인상/);
});

test("omits absent optional lines without empty labels", () => {
  const text = renderObituaryAnnouncement({
    ...input,
    memberTitle: undefined,
    accountInfo: undefined,
    sourceUrl: undefined,
  });
  assert.doesNotMatch(text, /마음 전하실 곳/);
  assert.doesNotMatch(text, /위치 확인/);
  assert.doesNotMatch(text, /\(\)/);
});
```

- [ ] **Step 2: Run RED verification**

Run:

```bash
npx tsx --test server/obituary-announcement.test.ts
```

Expected: FAIL because the renderer module is absent.

- [ ] **Step 3: Implement the renderer as a pure function**

Define an `ObituaryAnnouncementInput` type with every field shown in Step 1. Build lines in writing-guide order, push optional account/URL lines only when values are non-empty, and join sections with `\n`. Do not read environment, database, or current time inside this function.

- [ ] **Step 4: Run GREEN verification and commit**

Run:

```bash
npx tsx --test server/obituary-announcement.test.ts
npm run check
```

Then commit:

```bash
git add shared/obituary-announcement.ts server/obituary-announcement.test.ts
git commit -m "Add standard obituary renderer"
```

### Task 2: Published Event List and Detail Page

**Files:**
- Create: `client/src/pages/events/index.tsx`
- Create: `client/src/pages/events/event-list.tsx`
- Create: `client/src/pages/events/event-composer.tsx`
- Create: `client/src/pages/events/detail.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/lib/seo.ts`
- Modify: `server/seo.ts`
- Create: `server/community-events-ui-contract.test.ts`

**Interfaces:**
- Consumes: `GET /api/events?type=<type>` and `GET /api/events/:id`
- Produces: `/events` and `/events/:id` member routes with `전체/부고/결혼/개원/기타` filtering

- [ ] **Step 1: Write the failing route/UI contract test**

Read the client sources and assert:

```ts
assert.match(app, /path="\/events"/);
assert.match(app, /path="\/events\/:id"/);
assert.match(page, /전체/);
assert.match(page, /부고/);
assert.match(page, /결혼/);
assert.match(page, /개원/);
assert.match(page, /기타/);
assert.match(page, /<EventComposer/);
assert.match(page, /<EventList/);
```

- [ ] **Step 2: Run RED verification**

Run `npx tsx --test server/community-events-ui-contract.test.ts` and expect `ENOENT` or missing route assertions.

- [ ] **Step 3: Add member routes and SEO**

Register routes inside `AuthGate`:

```tsx
<Route path="/events"><AuthGate><CommunityEventsPage /></AuthGate></Route>
<Route path="/events/:id"><AuthGate><CommunityEventDetail /></AuthGate></Route>
```

Add client/server SEO entries titled `경조사` and `경조사 상세`. Member routes should remain disallowed in robots/sitemap behavior already used for `/o`.

- [ ] **Step 4: Build the list component**

`EventList` accepts:

```ts
type EventListProps = {
  selectedType: "all" | CommunityEventType;
  onSelect: (id: number) => void;
};
```

Use TanStack Query with key `["/api/events", selectedType]`, send credentials, throw on non-OK responses, and render stable loading, empty, and error states. Event cards show type badge, title, event date, location when present, and related member name. They never show `sourceText`.

- [ ] **Step 5: Build the page shell and detail**

Create a minimal `EventComposer` in this task with the four-type segmented control, source textarea, and disabled `경조사 내용 불러오기`/`게시` commands labelled `등록 기능 준비 중`. Task 3 replaces the disabled commands with real form behavior. `CommunityEventsPage` renders, in order:

```tsx
<EventComposer selectedType={selectedType === "all" ? "obituary" : selectedType} />
<Tabs value={selectedType} onValueChange={setSelectedType}>...</Tabs>
<EventList selectedType={selectedType} onSelect={(id) => setLocation(`/events/${id}`)} />
```

Use compact page headings suitable for the member app; do not create a marketing hero. The detail page uses the same field labels as the selected event type and provides a back button to `/events?type=<type>`.

- [ ] **Step 6: Run GREEN verification and commit**

Run:

```bash
npx tsx --test server/community-events-ui-contract.test.ts
npm run check
npm run build
```

Then commit:

```bash
git add client/src/pages/events client/src/App.tsx client/src/lib/seo.ts server/seo.ts server/community-events-ui-contract.test.ts
git commit -m "Add community event list and detail"
```

### Task 3: Always-Visible Composer and Type-Specific Fields

**Files:**
- Modify: `client/src/pages/events/event-composer.tsx`
- Create: `client/src/pages/events/event-fields.tsx`
- Modify: `client/src/pages/events/index.tsx`
- Modify: `server/community-events-ui-contract.test.ts`

**Interfaces:**
- Consumes: shared draft/publish schemas and event APIs
- Produces: always-visible type selector, source input, editable fields, missing-field messages, and publish command

- [ ] **Step 1: Extend the failing UI contract**

Assert that the composer contains `TabsList` or `ToggleGroup` labels for all four types, a source `Textarea`, and visible form controls without `Dialog`, `Accordion`, or `Collapsible` wrappers.

- [ ] **Step 2: Run RED verification**

Run `npx tsx --test server/community-events-ui-contract.test.ts`. Expected: FAIL on missing composer controls.

- [ ] **Step 3: Implement the composer state**

Use `useForm<CommunityEventDraftInput>` with `zodResolver(communityEventDraftSchema)`. Default to `obituary`. Type changes reset only type-specific `details`; preserve common source text only after an explicit confirmation when the form is dirty.

The visible top section contains:

```text
[부고] [결혼] [개원] [기타]
[문자와 공개 링크를 함께 붙여넣으세요........................]
[경조사 내용 불러오기]
```

Until the link-parsing plan is implemented, `경조사 내용 불러오기` parses text only and displays `링크 내용 수집은 준비 중이며 입력한 문자만 분석했습니다.` when URLs are present.

- [ ] **Step 4: Implement type-specific fields**

For obituary, render every field from `docs/obituary-writing-guide.md`. For wedding/opening/other, render common title, event date, location, related member, contact, account, and a details memo. Show missing required fields from `communityEventPublishSchema.safeParse` next to the relevant controls.

- [ ] **Step 5: Publish without leaving the page**

On publish, call `POST /api/events/:draftId/publish`. On success:

```ts
await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
queryClient.removeQueries({ queryKey: ["/api/events/drafts/latest"] });
form.reset({ eventType: currentType, sourceUrls: [], details: {} });
setDraftId(undefined);
```

Show a success toast and keep the user on `/events` so the new card is immediately visible below.

- [ ] **Step 6: Run GREEN verification and commit**

Run `npm test`, `npm run check`, and `npm run build`, then commit the composer and contract test with message `Add always-visible event composer`.

### Task 4: Server Draft Autosave and Recovery Hook

**Files:**
- Create: `client/src/hooks/use-event-draft.ts`
- Modify: `client/src/pages/events/event-composer.tsx`
- Create: `server/community-events-draft-hook.test.ts`

**Interfaces:**
- Consumes: draft create/update/latest/delete endpoints
- Produces: `useEventDraft({ eventType, form }): { draftId, isSaving, discardDraft }`

- [ ] **Step 1: Write a failing source contract test**

Assert that the hook uses all four endpoint operations, includes a `600` millisecond debounce, sends credentials, cancels its timeout on unmount, and never sends `authorId`.

- [ ] **Step 2: Run RED verification**

Run `npx tsx --test server/community-events-draft-hook.test.ts`; expect `ENOENT`.

- [ ] **Step 3: Implement recovery**

Query `["/api/events/drafts/latest", eventType]`. When a draft exists and the current form is pristine, reset the form from the draft and store its ID. Display a small `임시저장된 내용을 복구했습니다` status with a `초안 삭제` command.

- [ ] **Step 4: Implement debounced autosave**

Watch form values. Ignore the initial empty state. After 600 ms without changes, POST a first draft or PATCH the existing draft. Store the returned ID, expose `isSaving`, and show `저장 중`/`임시저장됨` without toast spam.

- [ ] **Step 5: Implement discard**

DELETE the current draft, remove the draft query, reset the form for the current type, and clear the ID. A failed delete leaves the local form intact and shows an error toast.

- [ ] **Step 6: Run GREEN verification and commit**

Run:

```bash
npx tsx --test server/community-events-draft-hook.test.ts server/community-events-ui-contract.test.ts
npm test
npm run check
npm run build
```

Commit with message `Add event draft autosave`.

### Task 5: Obituary Preview with Server-Sourced Member Data

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/storage.ts`
- Modify: `server/community-events-routes.test.ts`
- Create: `client/src/pages/events/obituary-preview.tsx`
- Modify: `client/src/pages/events/event-composer.tsx`

**Interfaces:**
- Consumes: `renderObituaryAnnouncement`, session user, membership status, and validated obituary draft
- Produces: `POST /api/events/:id/preview` and an on-screen standard announcement preview

- [ ] **Step 1: Write failing route tests**

Assert anonymous `401`, non-owner `404`, incomplete obituary `400` with `missingFields`, and owner success `200 { text }`. Send forged `memberName`, `membershipTier`, and `memberPhone` and assert they are not used.

- [ ] **Step 2: Run RED verification**

Run the route test and expect `404` for the preview endpoint.

- [ ] **Step 3: Implement preview assembly**

Add `getAlumniRecordByUserId(userId: number): Promise<AlumniRecord | undefined>` to `IStorage` and `DatabaseStorage`, filtering `alumni_database.matched_user_id`. Load the owner draft, session user, matched alumni record, and `storage.getMembershipStatus(userId)`. Use `alumni.generation` for graduation class, derive the admission-year label only from a parseable `alumni.admissionDate`, use `alumni.alumniPosition` for the optional title, and use `user.phoneNumber ?? alumni.mobile` for the member contact. If a required display value is absent, return it in `missingFields` instead of inventing it. Ignore forged profile/tier/title fields in the request and pass only server-sourced values to `renderObituaryAnnouncement`.

- [ ] **Step 4: Add preview UI**

For obituary drafts, show `표준 부고문 미리보기` below the editable fields. Refresh it after successful autosave. Preserve line breaks with `whitespace-pre-wrap`; provide a copy icon button with an accessible label, not a text-heavy rounded control.

- [ ] **Step 5: Run GREEN verification and commit**

Run route tests, `npm test`, `npm run check`, and `npm run build`. Commit with message `Add obituary announcement preview`.

### Task 6: Entry Points and Legacy Route Compatibility

**Files:**
- Modify: `client/src/pages/boards.tsx`
- Modify: `client/src/pages/home.tsx`
- Modify: `client/src/App.tsx`
- Modify: `server/community-events-ui-contract.test.ts`

- [ ] **Step 1: Write failing entry-point assertions**

Assert the board header contains a `경조사` command pointing to `/events`, the home page no longer contains `obituaryUrl` or `parseObituaryMutation`, and legacy `/o` routes redirect to the approved `/events` equivalents.

- [ ] **Step 2: Run RED verification**

Run the UI contract and expect failures for the missing entry points and obsolete home code.

- [ ] **Step 3: Update the board and home**

Place a secondary `HeartHandshake` icon+text `경조사` button beside `글쓰기` without making either overflow the mobile header. Remove the broken home URL form and mutation. Replace it with one concise `경조사` command to `/events`.

- [ ] **Step 4: Add route redirects**

Use Wouter route components that preserve these mappings:

```text
/o       -> /events?type=obituary
/o/new   -> /events?type=obituary&compose=1
/o/:id   -> /events/:mappedId or the legacy detail until mapping exists
```

Do not redirect `/about/condolence`.

- [ ] **Step 5: Run GREEN verification and commit**

Run the UI contract, `npm test`, `npm run check`, and `npm run build`. Commit with message `Expose community events in member navigation`.

### Task 7: UI Review and Production Verification

**Files:**
- Modify: `walkthrough.md`
- Modify: `roadmap.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add manual checks**

Document mobile and desktop checks for visible composer, all type filters, draft recovery after reload, draft deletion, obituary preview, publish/list refresh, board/home entry points, and legacy routes.

- [ ] **Step 2: Run final Replit verification**

Run `npm test`, `npm run check`, `npm run build`, and `git diff --check`. Resolve failures before review.

- [ ] **Step 3: Review**

Review draft ownership, accidental profile-data trust, stale autosave races, query invalidation, mobile overflow, inaccessible controls, and legacy-link breakage. Resolve P0-P2 findings and rerun Step 2.

- [ ] **Step 4: Merge, Republish, and test with a real member**

Verify one draft per type, reload recovery, deletion, obituary preview, publication, immediate list appearance, board/home navigation, and existing obituary detail access. Update roadmap status only from observed production results.
