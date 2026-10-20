---
name: Route loading policy
description: Why public home and auth stay eager while route screens load on demand
---

Keep the public home and auth state infrastructure eager; defer the other screen bodies through feature public APIs, with auth gates outside member lazy screens.

**Why:** The public home is the default visitor entry, so deferring it adds a request without avoiding work. Deferring the auth provider risks resetting session UI during navigation. Keeping page splitting inside feature APIs preserves module boundaries.

**How to apply:** When adding routes, avoid eager page re-exports from shared auth/feature entrypoints. Measure the entire entry's static dependency closure, not merely the entry filename; total chunk count is not the initial request count. Use explicit reload recovery for failed lazy imports rather than automatic reload loops. In Express wildcard middleware, use `req.originalUrl` to classify asset paths; mounted `req.path` can be `/` and incorrectly send missing assets to the HTML fallback.

**Why:** A missing hashed chunk must reach the browser as a real asset failure so the lazy-route boundary can show recovery UI; wildcard-mounted paths are not reliable inputs for this classification.
