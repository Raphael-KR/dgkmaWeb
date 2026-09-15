# Threat Model

## Project Overview

dgkmaWeb is a publicly deployed alumni-community application. A React browser client calls a Node.js/Express API backed by PostgreSQL/Drizzle. Kakao OAuth provides identity; the server maintains PostgreSQL-backed sessions. The application includes member profiles and directory data, community posts/comments/events, payments, administrator registration and alumni-sync workflows, server-side public-link parsing, and private object storage for board images.

## Assets

- **Accounts and sessions** — Kakao identities, session cookies, OAuth state, membership and administrator status. Compromise permits impersonation or privileged actions.
- **Member and alumni data** — names, contact/membership attributes, generations, regions, pending registrations, and directory records.
- **Community and payment data** — posts, comments, event drafts/publications, obituaries, and dues/payment records.
- **Administrative source data** — Google Sheets alumni roster and synchronization state.
- **Application credentials** — database URLs, session secret, Kakao client/admin credentials, Google service-account credentials, and object-storage authority.
- **Service resources** — database, outbound-fetch capacity, and object-storage capacity/bandwidth.

## Trust Boundaries

- **Browser to Express API** — request parameters, bodies, cookies, headers, and upload metadata are attacker-controlled. Sensitive actions require server-established identity and authorization.
- **Public vs member vs administrator** — public categories/content and OAuth initiation are separated from member directories, author-owned drafts/content, and administrator approval, sync, and payment operations.
- **API to PostgreSQL** — the server can read and mutate all application and session data; queries must remain parameterized and scoped to the authenticated subject.
- **API to Kakao/Google** — OAuth and unlink operations use privileged credentials; callbacks must be state-bound and external responses untrusted. Alumni sync crosses from Google Sheets into runtime authorization data.
- **API to arbitrary public URLs** — event parsing accepts user-provided URLs, creating an SSRF boundary that requires scheme, DNS/address, redirect, timeout, type, and size controls.
- **Browser to object storage** — authenticated users receive presigned upload URLs and then upload directly, bypassing the application server unless restrictions are cryptographically included in the signed operation.

## Scan Anchors

- Production entry points: `server/index.ts`, `server/routes.ts`, and `server/replit_integrations/object_storage/routes.ts`.
- Highest-risk code: Kakao/session modules under `server/kakao-*`; authorization and business routes in `server/routes.ts`; persistence in `server/storage.ts`; outbound readers/policies in `server/*source*` and `server/public-page-fetcher.ts`; object storage in `server/replit_integrations/object_storage/`.
- Public deployment: `https://dgkma.org` and `https://dgkma.replit.app`; authenticated member and administrator APIs are server-enforced.
- `artifacts/mockup-sandbox` is design/development-only and should be ignored unless production reachability is demonstrated.

## Threat Categories

### Spoofing

Kakao callbacks must require a cryptographically random, single-use state bound to the initiating session, use the matching environment configuration, and rotate sessions after authentication. Session cookies must remain HttpOnly, Secure in production, and protected from unintended cross-site mutation. Administrator recovery must depend only on Kakao-verified numeric IDs in the server-side environment allowlist.

### Tampering

All profile, content, draft, registration, payment, publishing, and sync mutations must derive the actor from the trusted session. Author-owned objects must be queried with both object ID and owner scope; administrator actions require a server-side administrator guard. Client fields must not set identity, role, membership, payment ownership, publication state, or tenant scope.

### Information Disclosure

Member/alumni lists and private attachments must require membership and expose only intended fields. Payment reads must be restricted to the subject user or an administrator. Logs and errors must not expose OAuth codes/tokens, Kakao IDs, roster rows, secrets, database details, or stack traces.

### Denial of Service

Public parsing must enforce concurrency/rate, timeout, redirect, response-size, compression, and content-type limits. Upload size/type and per-user resource budgets must be enforced by the storage provider rather than trusted client metadata. Expensive administrator sync operations must be authenticated and concurrency-controlled.

### Elevation of Privilege

Every sensitive API requires authentication plus action/object-level authorization. SQL must remain parameterized. Outbound URL validation must reject private/special-use addresses across initial DNS resolution and redirects and pin validated addresses to prevent rebinding. Upload and object paths must remain confined to the configured bucket prefix; browser-served content must use safe response types and must not enable stored script execution.
