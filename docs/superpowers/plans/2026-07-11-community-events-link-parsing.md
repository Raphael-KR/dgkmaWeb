# Community Events Safe Link Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich community-event drafts from mixed Korean message text and public URLs without making URL availability mandatory or exposing the server to SSRF, oversized responses, or non-text content.

**Architecture:** Separate URL extraction, destination validation, bounded HTTP transport, HTML-to-text conversion, and event parsing into independent modules. The server validates and pins public DNS results for every request and redirect. Fetch failures become per-link status records while the original user text continues through the parser.

**Tech Stack:** Node.js 20 `http`/`https`/`dns`/`net`, Cheerio, TypeScript 5.6, Zod, Express 4, Node `node:test`, Replit

## Global Constraints

- Begin only after the foundation and UI/draft plans are merged and production-verified.
- Production code must not use `insane-search`, TLS impersonation, CAPTCHA bypass, login cookies, or headless browser execution.
- Accept at most 3 URLs per parse request.
- Accept only `http:` and `https:` URLs without embedded credentials.
- Default ports only: HTTP 80 and HTTPS 443.
- Reject loopback, private, link-local, multicast, unspecified, and cloud metadata destinations.
- Validate DNS before each request and validate every redirect independently.
- Pin the request lookup to a previously validated public address.
- Limit each response to 512 KiB, 5 seconds, and 3 redirects.
- Accept only `text/html` and `text/plain`.
- Treat remote text as untrusted data; never execute scripts or instructions from it.
- A link failure must not discard parseable user-supplied text.
- Validate in Replit with `npm test`, `npm run check`, and `npm run build`.

---

### Task 1: URL Extraction and Public-Destination Policy

**Files:**
- Create: `server/event-source-policy.ts`
- Create: `server/event-source-policy.test.ts`

**Interfaces:**
- Produces: `extractEventSourceUrls(input)`, `assertSafeSourceUrl(rawUrl)`, `isPublicAddress(address)`
- Consumes: Node `net` and standard URL parsing only

- [ ] **Step 1: Write failing policy tests**

Cover these exact cases:

```ts
assert.deepEqual(extractEventSourceUrls("내용 https://example.com/a 끝"), ["https://example.com/a"]);
assert.equal(extractEventSourceUrls("https://a.example https://b.example https://c.example https://d.example").length, 3);
assert.throws(() => assertSafeSourceUrl("file:///etc/passwd"), /지원하지 않는 주소/);
assert.throws(() => assertSafeSourceUrl("https://user:pass@example.com"), /인증 정보/);
assert.throws(() => assertSafeSourceUrl("http://example.com:8080"), /포트/);
for (const address of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fc00::1", "fe80::1"]) {
  assert.equal(isPublicAddress(address), false);
}
assert.equal(isPublicAddress("8.8.8.8"), true);
assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
```

- [ ] **Step 2: Run RED verification**

Run `npx tsx --test server/event-source-policy.test.ts`; expect module-not-found failure.

- [ ] **Step 3: Implement extraction and URL syntax validation**

Use a global `https?://[^\s<>"']+` matcher, strip trailing Korean/ASCII punctuation, deduplicate in input order, and return at most 3 URLs. `assertSafeSourceUrl` returns a normalized `URL` or throws a user-safe error.

- [ ] **Step 4: Implement IPv4 and IPv6 classification**

Use `net.isIP`. Convert IPv4 octets numerically and reject RFC1918, loopback, link-local, carrier-grade NAT, multicast, unspecified, and reserved metadata ranges. Normalize IPv6 and reject `::`, `::1`, `fc00::/7`, `fe80::/10`, multicast `ff00::/8`, and IPv4-mapped private addresses.

- [ ] **Step 5: Run GREEN verification and commit**

Run the policy test and `npm run check`. Commit with message `Add event source URL policy`.

### Task 2: DNS Validation and Bounded HTTP Transport

**Files:**
- Create: `server/public-page-fetcher.ts`
- Create: `server/public-page-fetcher.test.ts`

**Interfaces:**
- Consumes: `assertSafeSourceUrl`, `isPublicAddress`
- Produces: `fetchPublicPage(url, dependencies?): Promise<PublicPageResult>`

Define:

```ts
export type PublicPageResult = {
  requestedUrl: string;
  finalUrl: string;
  contentType: "text/html" | "text/plain";
  body: string;
};

export type RawPublicResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
};

export type RequestPublicAddress = (
  url: URL,
  address: string,
  family: 4 | 6,
) => Promise<RawPublicResponse>;

export type PublicPageFetcherDependencies = {
  lookup?: typeof dns.promises.lookup;
  requestPublicAddress?: RequestPublicAddress;
};
```

- [ ] **Step 1: Write failing tests with local controlled servers**

Tests must not call the public internet. Test the exported low-level `requestPublicAddress` against a local HTTP server because it accepts an already validated address. Test `fetchPublicPage` with injected lookup and `RequestPublicAddress` doubles so the high-level policy never needs to connect to a private test server. Cover:

- a small HTML response succeeds;
- a 302 redirect is revalidated;
- private lookup results are rejected before request;
- redirect to `127.0.0.1` is rejected;
- more than 3 redirects is rejected;
- `application/octet-stream` is rejected;
- a streamed body exceeding 512 KiB is aborted;
- a response delayed beyond 5 seconds is aborted.

Use test-only dependency injection; do not add test switches to production route behavior.

- [ ] **Step 2: Run RED verification**

Run `npx tsx --test server/public-page-fetcher.test.ts`; expect module-not-found failure.

- [ ] **Step 3: Implement validated DNS resolution**

Call `lookup(hostname, { all: true, verbatim: true })`. Reject an empty answer or any non-public address. Select one validated address and provide an `http.request`/`https.request` `lookup` callback that returns only that address and family. This pins the connection and prevents a second unvalidated DNS answer.

- [ ] **Step 4: Implement manual redirect and response limits**

Disable automatic redirects by using Node request APIs directly. Send `Accept-Encoding: identity` and reject compressed responses. For each redirect, parse `Location` relative to the prior URL and restart the full syntax/DNS validation. Read chunks while counting bytes; destroy the response above `512 * 1024`. Use a 5-second request timer and accept content types after stripping charset parameters.

- [ ] **Step 5: Run GREEN verification and commit**

Run the fetcher tests and `npm run check`. Commit with message `Add bounded public page fetcher`.

### Task 3: Structured HTML-to-Text Extraction

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `server/public-page-text.ts`
- Create: `server/public-page-text.test.ts`

**Interfaces:**
- Consumes: `PublicPageResult`
- Produces: `extractPublicPageText(page): string`

- [ ] **Step 1: Install the parser in Replit**

Run:

```bash
npm install cheerio@^1.1.2
```

Expected: `package.json` and lockfile update; do not install on the local Mac as validation evidence.

- [ ] **Step 2: Write failing extraction tests**

Fixtures must verify removal of `script`, `style`, `noscript`, navigation, forms, and comments; preservation of Korean visible text; whitespace normalization; and extraction from JSON-LD fields such as `name`, `description`, `startDate`, and `location` only when they are scalar public metadata.

- [ ] **Step 3: Run RED verification**

Run the extraction test; expect module-not-found failure.

- [ ] **Step 4: Implement with Cheerio**

For `text/plain`, normalize whitespace and cap output at 20,000 characters. For HTML, load with Cheerio, remove non-content nodes, collect safe JSON-LD scalar values, prefer `main`, `article`, or `[role=main]` text when present, otherwise use `body`, combine metadata and visible text, deduplicate adjacent lines, and cap output.

- [ ] **Step 5: Run GREEN verification and commit**

Run the extraction test, `npm run check`, and `npm run build`. Commit with message `Extract text from public event pages`.

### Task 4: Mixed Source Aggregation with Failure Fallback

**Files:**
- Create: `server/event-source-reader.ts`
- Create: `server/event-source-reader.test.ts`

**Interfaces:**
- Consumes: URL policy, public fetcher, HTML text extractor
- Produces: `readEventSources(input, dependencies?): Promise<EventSourceReadResult>`

Define:

```ts
export type EventSourceStatus = {
  url: string;
  status: "fetched" | "unavailable" | "blocked";
  message?: string;
};

export type EventSourceReadResult = {
  combinedText: string;
  urls: string[];
  sources: EventSourceStatus[];
};
```

- [ ] **Step 1: Write failing aggregation tests**

Test text-only, URL-only success, mixed text+URL success, one success plus one failure, all links failed with original text preserved, and a private URL reported as `blocked` without invoking the fetcher.

- [ ] **Step 2: Run RED verification**

Run the reader test; expect module-not-found failure.

- [ ] **Step 3: Implement sequential bounded reads**

Remove URLs from the user's text before normalization. Process at most 3 links sequentially to avoid burst traffic. Append only successfully extracted public text. Convert policy failures to `blocked` and network/expiry/empty-page failures to `unavailable`. Never include stack traces, IP addresses, or upstream body text in client messages.

- [ ] **Step 4: Run GREEN verification and commit**

Run reader/policy/fetcher/text tests and `npm run check`. Commit with message `Combine event text and public links`.

### Task 5: Expanded Obituary Parser

**Files:**
- Modify: `server/obituary-parser.ts`
- Create: `server/obituary-parser.test.ts`

**Interfaces:**
- Consumes: combined plain text
- Produces: writing-guide fields plus `missingFields`

- [ ] **Step 1: Write fixture tests from the approved Notion examples**

Use anonymized fixtures covering:

- `故김한의 (향년 88세)`;
- relations including 본인, 부친, 모친, 빙부, 빙모, 시부, 시모, 자녀;
- `발인: 2026년 6월 12일(금요일) 오전 7시 30분`;
- `빈소`, account, contact, burial place, chief mourner, and source URL;
- missing age or funeral home returned in `missingFields`.

- [ ] **Step 2: Run RED verification**

Run the parser test and expect failures for age, expanded relationships, funeral date, and missing fields.

- [ ] **Step 3: Extend parsing without claiming AI**

Keep deterministic regex parsing. Add dedicated extractors for age, approved relationship vocabulary, funeral/departure date, and source URL. Return:

```ts
{
  draft: Partial<CommunityEventDraftInput>,
  missingFields: string[],
}
```

Map obituary fields into `details` and common display fields. Do not infer a value when no evidence exists.

- [ ] **Step 4: Run GREEN verification and commit**

Run parser tests plus `npm test` and `npm run check`. Commit with message `Expand obituary message parsing`.

### Task 6: Protected Parse API and Abuse Limits

**Files:**
- Modify: `server/routes.ts`
- Create: `server/event-parse-limiter.ts`
- Create: `server/community-events-parse-route.test.ts`

**Interfaces:**
- Consumes: `readEventSources`, event type, deterministic parser
- Produces: `POST /api/events/parse` with draft, missing fields, and source statuses

- [ ] **Step 1: Write failing live route tests**

Assert anonymous `401`, member text-only `200`, private URL `200` with a blocked source and preserved text draft, more than 20,000 input characters `400`, invalid type `400`, and the 11th request within one minute `429` for one session user.

- [ ] **Step 2: Run RED verification**

Run the route test and expect `404`.

- [ ] **Step 3: Implement a small member-keyed limiter**

`event-parse-limiter.ts` exports `createEventParseLimiter({ windowMs: 60_000, max: 10 })`. Key by `req.session.userId`, prune expired counters on access, return `429 { message: "잠시 후 다시 시도해주세요" }`, and never key by forged headers or body fields.

- [ ] **Step 4: Implement the route**

Apply middleware in this order:

```ts
app.post("/api/events/parse", requireAuthenticated, eventParseLimiter, async (req, res) => { ... });
```

Validate `{ eventType, input }` with Zod (`input` min 1, max 20,000). Read sources, call the selected deterministic parser, and return `{ draft, missingFields, sources }`. A link failure is not a route failure.

- [ ] **Step 5: Run GREEN verification and commit**

Run route and source tests, `npm test`, and `npm run check`. Commit with message `Add safe event parsing API`.

### Task 7: Connect Parsing Results to the Always-Visible Composer

**Files:**
- Modify: `client/src/pages/events/event-composer.tsx`
- Modify: `server/community-events-ui-contract.test.ts`

- [ ] **Step 1: Add failing UI contract assertions**

Assert the composer calls `/api/events/parse`, merges returned draft fields into React Hook Form, renders each source status, and keeps the user's raw input after unavailable links.

- [ ] **Step 2: Run RED verification**

Run the UI contract; expect missing parse API assertions.

- [ ] **Step 3: Implement parse interaction**

Send the selected `eventType` and source input. On success, merge only returned defined values, preserve user-edited non-empty fields unless the user confirms replacement, display missing fields near form controls, and display concise statuses:

```text
링크 내용을 불러왔습니다.
링크가 종료되었거나 공개되지 않아 입력한 문자만 분석했습니다.
안전하지 않은 주소는 읽지 않았습니다.
```

- [ ] **Step 4: Run GREEN verification and commit**

Run `npm test`, `npm run check`, and `npm run build`. Commit with message `Use safe link parsing in event composer`.

### Task 8: Security Review and Production Verification

**Files:**
- Modify: `walkthrough.md`
- Modify: `roadmap.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add verification cases**

Document anonymized tests for mixed text/URL, an expired page, a public HTML page, private/localhost targets, redirect to private target, oversized/non-text responses, timeout fallback, rate limit, and unchanged source text.

- [ ] **Step 2: Run final Replit checks**

Run:

```bash
npm test
npm run check
npm run build
git diff --check
```

- [ ] **Step 3: Request focused security review**

Review DNS rebinding, IPv6 and IPv4-mapped ranges, redirect validation, response abort behavior, decompression limits, content-type parsing, error-data leakage, rate-limit identity, and untrusted-text handling. Resolve every P0-P2 finding and rerun Step 2.

- [ ] **Step 4: Republish and verify with controlled public URLs**

Do not probe private production infrastructure. Use an approved public HTML fixture and an expired Notion example link. Confirm that successful link text enriches the draft, expired links fall back to pasted text, and private destinations are blocked. Update roadmap status only after actual member verification.
