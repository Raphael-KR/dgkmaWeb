---
name: Object storage blueprint serving gotchas
description: Security defaults to harden when using the Replit object_storage blueprint's upload + /objects serving routes.
---

The Replit `object_storage` blueprint (`server/replit_integrations/object_storage/`) ships **example** routes that are insecure by default for member-only content. Harden them when integrating:

**Why:** `registerObjectStorageRoutes` exposes `POST /api/uploads/request-url` and `GET /objects/:objectPath(*)`. Out of the box:
- request-url has no auth → anyone could mint presigned upload URLs and fill the bucket.
- GET /objects has no auth/ACL → objects are link-public (and `GET /api/posts` is often publicly enumerable, so "random UUID = secret" does NOT hold).
- The presigned PUT constrains only method+TTL, not Content-Type/size. `downloadObject` then serves files with their **stored** Content-Type from the app's own origin → a logged-in user can upload `text/html` and get stored XSS / cookie theft.

**How to apply:**
- Gate `request-url` and (for member-only apps) `GET /objects` behind `req.session?.userId`. `<img>` tags send the session cookie same-origin, so logged-in rendering is unaffected.
- In `downloadObject`, force non-`image/*` stored content types to `application/octet-stream` + `Content-Disposition: attachment`, and always set `X-Content-Type-Options: nosniff`.
- Validation for post `imageUrls` should only allow the real serving prefix `/objects/` (relative path), blocking external `<img src>` injection.
