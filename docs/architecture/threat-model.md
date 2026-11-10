# Threat Model

## Scope and evidence

This is a source-based description of the current trust boundaries, aligned with `main d7184ca` on 2026-11-09. It is not a new security scan, production inspection, or real-account QA result. Product authority remains in [제품·개발 계획](../product/planning-proposal.md); environment and last release evidence are in [replit.md](../../replit.md#현재-적용-상태).

The React/Vite and Node.js/Express application uses PostgreSQL/Drizzle and Kakao REST OAuth with server sessions. Public information pages are separate from member content and administrator workflows. Obituary, wedding, and clinic-opening notices share `posts` and `categories` with other posts.

## Assets

- **Accounts and sessions** — Kakao identities, OAuth state and termination markers, session cookies, membership and administrator status.
- **Member and alumni data** — contact/membership attributes, generations, regions, pending registrations, directory records and name aliases.
- **Content and payments** — Tiptap JSONB bodies, separate notice fact JSON, author-only source text/drafts, comments, attachments and payment records.
- **Administrative source data** — Google Sheets managed alumni roster and its PostgreSQL runtime copy.
- **Collection rules** — public API/field-mapping JSONB in `source_collection_rules`, separate from posts and original notice content.
- **Credentials and resources** — database/session, Kakao, Google, OpenAI and object-storage authority; outbound requests, LLM usage, browser/OCR capacity and storage.

## Trust boundaries and current controls

### Browser to application

Parameters, JSON, HTML/Markdown input, upload metadata and cookies are untrusted. The server derives identity and role from the authenticated session and stored user. Public access covers landing/about/legal pages and authentication entry points. All `/api/posts`, `/api/categories`, `/api/comments`, post search and board attachments require authentication; member and administrator scopes apply within that boundary.

Only the author may edit or delete a post, including an administrator's own post. Administrator authority over another author's post permits hiding or restoring visibility, not editing or deletion. Hidden posts are excluded from normal lists/search and remain accessible to their author or an administrator; detail, comments and attachments follow that boundary. Revision checks prevent stale writes. Notice editing additionally uses a signed preview and author confirmation.

### Content to storage and rendering

`posts.content` is the single Tiptap JSONB body source; `posts.event_data` stores notice facts separately. The shared document schema validates allowed nodes, marks, attributes, size and links. The editor and renderer use the same supported formats. HTML/Markdown are converted input/output, not trusted raw HTML stored alongside another body source. Unsupported or lossy Markdown edits use the documented error/confirmation path. Attachments remain separate from body markup.

### Application to PostgreSQL and identity providers

Queries and mutations must remain parameterized and scoped to the actor, object and operation. Kakao OAuth uses environment-specific server credentials, a single-use state, session binding and session rotation. Unlink, local deletion and termination markers retain their race protections. Administrator recovery uses server-side numeric Kakao ID allowlists, never model output or browser roles.

Google Sheets is the managed roster source; PostgreSQL is the login/registration runtime copy. Explicit administrator preview/apply, source fingerprints, an advisory lock and a transaction protect synchronization. Login requests do not query Sheets. DB target selection and change authority follow the [DB runbook](../runbooks/database-operations.md).

### Browser to application to object storage

The browser requests `/api/uploads/request-url`, then PUTs to the returned **application** URL `/api/uploads/:uploadToken`. Both require a logged-in session. The HMAC token binds an object ID, allowed content type, size and expiry. The application checks MIME and actual byte count before writing to storage; the browser does not receive a direct object-storage PUT URL. The current token does not bind a user ID, so token possession is not proof of ownership.

Uploads allow JPEG/PNG/WebP/GIF and at most 10 MiB. These are MIME/size checks, not a documented malware scan or image decoder validation. Downloads require an existing user, use `private, no-store`, and enforce object-path, response-type and `nosniff` handling. Attached objects additionally require a readable referencing post; uploads not yet referenced by a post retain the existing member-only preview boundary. Hiding an attachment's only readable post restricts that attachment too.

### Application to public pages and collection workers

Public-link collection crosses an SSRF and untrusted-code boundary. HTML, metadata, JSON-LD, initial state, scripts, API responses, rendered pages and OCR text remain untrusted facts. HTTP 200 alone does not establish success. URL/DNS/address/redirect/type/size checks and validated address pinning apply to saved-rule requests and browser subrequests mediated by the application.

Playwright runs Chromium with its sandbox enabled in a child process and disposable context. The child receives only a bounded runtime environment, temporary HOME/TMPDIR and collection input; it does not receive application Secrets, DB credentials or member sessions. The application mediates network access and alone reads/writes collection rules. This is not a separate VM or an independently enforced OS-wide memory quota.

The engine bounds time, requests, responses, browser concurrency, frames/interactions and OCR work as listed in [runtime limits](../../replit.md#경조사-런타임과-수집-경계). It does not bypass login, CAPTCHA or authorization. Direct API reuse is limited to observed, unauthenticated reads for the matching public page. Rules retain templates, extraction/shape checks and success metadata, not original personal content, page ID values, cookies or tokens. Mismatched rules fall back to discovery; no API found does not mean no public data exists.

### Application to OpenAI

Only the server uses `OPENAI_API_KEY` for Responses API Structured Outputs with `store: false`. Requests include text and collected facts needed for notice extraction/correction. External page instructions and model output are untrusted; schema validation, provenance, user corrections, deterministic rendering and author confirmation remain in the application. Membership, identity and registration authority are resolved independently of the model. The approved notice flow does not authorize sending unrelated secrets or member records.

## Threats to preserve during changes

- **Spoofing/elevation:** preserve authenticated actor checks, per-object author/administrator rules, OAuth state/session handling and environment-specific keys. Model guesses cannot grant identity or permission.
- **Tampering:** validate body/fact JSON and safe links, revisions, signed previews, roster fingerprints and upload token/body agreement. Client fields cannot assign roles or another author's ownership.
- **Information disclosure:** restrict source text/drafts, hidden content and attachments; expose only intended directory/payment fields. Do not record credentials, OAuth codes/tokens, roster rows or unnecessary notice content in logs/files.
- **Resource exhaustion:** retain collection rate/concurrency/time/size limits and bounded uploads. Administrator sync remains authenticated and serialized. These controls do not establish a general per-user storage quota.

## Scan anchors

- App/session: `server/index.ts`, `server/routes.ts`, `server/middleware/auth.ts`.
- Identity/roster/payment: `server/modules/identity/`, `server/integrations/kakao/`, `server/modules/registry/`, `server/modules/dues/`.
- Post authorization/persistence: `server/modules/content/routes.ts`, `server/modules/content/storage.ts`, `server/db/schema/index.ts`.
- Notice extraction/editing: `server/modules/events/`, including `notice-edit.ts`, `notice-extraction.ts`, `notice-rendering.ts` and `writer/`.
- Collection: `server/integrations/public-sources/`, `scripts/collector/worker.mjs`.
- Body schema/conversion/rendering: `shared/contracts/post-document.ts`, `shared/editor/post-document.ts`, `client/src/components/post-body.tsx`.
- Object storage: `server/integrations/object-storage/routes.ts`, `server/integrations/object-storage/objectStorage.ts`.

`artifacts/mockup-sandbox` is design/development-only unless production reachability is demonstrated. Actual executed coverage and remaining browser/OCR/site-specific uncertainty belong to the [release history](../history/replit-2026-11-09.md), not this source review.
