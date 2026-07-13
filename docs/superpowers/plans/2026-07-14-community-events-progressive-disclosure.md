# Community Events Progressive Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the permanently expanded `/events` editor with the approved compact intake, inline review-on-demand, and unfiltered all-events list.

**Architecture:** Keep the existing event schemas, APIs, parsing, draft ownership, preview, and publish recovery. Change only presentation orchestration: the page always requests all published events, while `EventComposer` gates detailed fields and draft autosave behind local `isReviewOpen` state. Parsing opens the inline review panel, closing preserves the form and draft, and successful publish closes and resets it.

**Tech Stack:** React 18, React Hook Form, TanStack Query 5, TypeScript, Node `node:test`, Replit

## Global Constraints

- Preserve member-only routes, schemas, API paths, draft ownership, preview safety, and publish retry behavior.
- Keep the registration type selector `부고`, `결혼`, `개원`, `기타` above the source input.
- Remove the published-list filter and always request `GET /api/events`.
- Do not render the `경조사 등록` subheading or its explanatory copy.
- Render detailed fields, preview, draft controls, and final publish only after the dynamic type registration command is used.
- Do not implement external URL fetching in this change.
- Do not add a component library or frontend test framework.

---

### Task 1: Lock the Approved Screen Contract

**Files:**
- Modify: `server/community-events-ui-contract.test.ts`

**Interfaces:**
- Consumes: source files for `/events`, `EventComposer`, and `EventList`
- Produces: failing source-contract tests for compact intake, progressive review, and an all-events list

- [ ] **Step 1: Replace the list-filter assertions**

Assert that `index.tsx` contains no `Tabs`, filter state, or `selectedType`, and that `event-list.tsx` uses one query and URL:

```ts
assert.doesNotMatch(page, /\bTabs(?:List|Trigger)?\b|selectedType|eventFilters/);
assert.match(page, /<EventList onSelect=/);
assert.match(list, /queryKey: \["\/api\/events"\]/);
assert.match(list, /fetch\("\/api\/events", \{ credentials: "include" \}\)/);
assert.doesNotMatch(list, /\?type=|selectedType/);
```

- [ ] **Step 2: Add progressive composer assertions**

```ts
assert.match(composer, /const \[isReviewOpen, setIsReviewOpen\] = useState\(false\)/);
assert.match(composer, /isPaused: !isReviewOpen \|\| isParsing \|\| isPublishing/);
assert.match(composer, /`\$\{EVENT_TYPE_LABELS\[currentType\]\} 등록`/);
assert.match(composer, /\{isReviewOpen && \([\s\S]*<EventFields/);
assert.match(composer, /setIsReviewOpen\(true\)/);
assert.match(composer, /setIsReviewOpen\(false\)/);
assert.doesNotMatch(composer, />경조사 등록<|내용을 확인한 뒤 게시해주세요/);
```

- [ ] **Step 3: Run RED verification**

Run:

```bash
npx tsx --test server/community-events-ui-contract.test.ts
```

Expected: failures for the existing list filters, always-rendered `EventFields`, and missing review state.

### Task 2: Implement the Compact Intake and All-Events List

**Files:**
- Modify: `client/src/pages/events/index.tsx`
- Modify: `client/src/pages/events/event-list.tsx`
- Modify: `client/src/pages/events/event-composer.tsx`

**Interfaces:**
- Consumes: existing event APIs and `EventComposer` internals
- Produces: `EventList({ onSelect })` and an `EventComposer` with inline review state

- [ ] **Step 1: Remove list filtering**

Make `EventList` accept only `onSelect`, use query key `['/api/events']`, and always fetch `/api/events`. Remove tabs, filter state, and query-string initialization from `index.tsx`.

- [ ] **Step 2: Add review state and pause draft writes before review**

```ts
const [isReviewOpen, setIsReviewOpen] = useState(false);

useEventDraft({
  eventType: currentType,
  form,
  isPaused: !isReviewOpen || isParsing || isPublishing,
});
```

Changing type closes review and preserves the approved source/common-field behavior. Parsing opens review for text-only, URL-only, successful parser, and parser-failure paths so manual completion remains possible.

- [ ] **Step 3: Render the approved compact intake**

Render only the type toggle, source textarea, and dynamic `${EVENT_TYPE_LABELS[currentType]} 등록` command before review. Remove the composer subheading and explanatory text.

- [ ] **Step 4: Gate the review UI**

Inside `isReviewOpen`, render a compact header `${EVENT_TYPE_LABELS[currentType]} 내용 확인`, close and explicit draft-delete controls, `EventFields`, obituary preview, publish-recovery warning, and final cancel/publish actions. Closing hides the section without clearing the form. Successful publish resets the form, closes review, and invalidates the all-events query.

- [ ] **Step 5: Run GREEN verification**

Run:

```bash
npx tsx --test server/community-events-ui-contract.test.ts server/community-events-draft-hook.test.ts server/event-composer-logic.test.ts
npm run check
npm run build
```

Expected: all selected tests and compilation commands pass.

### Task 3: Align Documentation and Verify the Responsive Screen

**Files:**
- Modify: `planning_proposal.md`
- Modify: `walkthrough.md`
- Modify: `CHANGELOG.md`
- Modify: `server/final-recheck-documentation-contract.test.ts`

**Interfaces:**
- Consumes: approved design and implemented UI
- Produces: durable product/QA contract and final verification evidence

- [ ] **Step 1: Update current-state documentation**

Record that `/events` uses compact intake, progressive inline review, and an all-events list without duplicate type filters. Keep actual member verification in the consolidated QA queue.

- [ ] **Step 2: Extend the documentation contract**

Assert the integrated plan and walkthrough contain `개발 완료 후 통합 QA`, `상세 입력은 등록 명령 이후`, and `목록 필터 없이 전체 경조사` semantics.

- [ ] **Step 3: Run complete Replit verification**

Run in `/home/runner/workspace`:

```bash
npm test
npm run check
npm run build
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 4: Inspect development UI at responsive widths**

Open the Replit development `/events` page at desktop and mobile widths. Confirm no horizontal overflow, no duplicated list filter, details hidden initially, inline review after registration command, and the all-events list visible immediately below the compact intake. Do not ask the user for real-account QA unless authentication blocks all meaningful inspection.

- [ ] **Step 5: Commit and align GitHub/Replit**

Commit only the listed files, push `main`, fast-forward Replit `main`, and verify both resolve to the same commit.
