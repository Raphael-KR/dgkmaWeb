# Database architecture recovery

## Decision

Draft PR #16 and `codex/database-architecture-todo16` are a forensic archive. Do not add commits, merge, close, deploy, or use their receipts as current proof. Recovery starts from GitHub `main`, and every implementation must be rebuilt as a small, independently tested change.

This is the only recovery plan for PR #16. It does not replace the responsibility of `planning_proposal.md`, `docs/database-schema.md`, or `docs/database-operations.md`, and it must not grow a parallel roadmap, manifest, receipt, fixture, or evidence tree.

## Working contract

| Item | Definition |
| --- | --- |
| Goal | Freeze the oversized branch as history and recover only product-necessary behavior from `main`. |
| Boundary | Read-only comparison of `main`, PR #16, and the existing audit checkout; this document and, only when a current defect exists, one small recovery slice. |
| Done | The archive boundary, exhaustive file-decision rules, small-PR sequence, and next validation gate are reviewable from one document. |
| Non-goals | F1-F4/A1, Production access, DB writes, Replit deploy/Republish/restart, merge, PR #16 close, provider writes, secrets, or cleanup of existing worktrees. |
| Verification | Git/GitHub state, canonical files on `main`, exhaustive diff counts, focused checks for the files actually changed, and Development-only runtime checks when a later code slice requires them. |

## Independently verified state

Checked on 2026-08-12 KST without using PR #16 receipts as success evidence.

| Surface | Verified state |
| --- | --- |
| GitHub `main` | `f0850820c0dd401cd316c08456eb427a1f0780ca` |
| PR #16 | Draft, open, head `08becc1d39e0c4c5fa4cdef1760a851fbf5ffa2e`, 296 commits, 493 changed files, +32,968/-146, zero registered checks |
| PR #16 mutation in this recovery | None; no commit, close, merge, comment, or branch update |
| Existing audit checkout | Head `d87126a99c5dac3822f64ca10a17cb74c19a485a`; 127 tracked branch-diff files plus pre-existing dirty/untracked state, all preserved |
| Progress authority conflict | The PR-committed roadmap says Todo 22 is startable; the audit checkout's untracked roadmap says Todo 22 is complete and proposes F1-F4. Neither is current product authority. |
| Production | Unverified; no Production connection, write, deploy, or smoke check occurred |

The freeze is a recovery policy, not a GitHub lock: the remote PR remains Draft/Open and the branch remains physically writable. Enforcement is by refusing further commits and reviews that treat it as mergeable product work.

## Current `main` boundary

- `docs/database-schema.md` and `scripts/database-schema-catalog.sql` remain the metadata baseline. Production parity is unknown.
- `server/db.ts` prefers Replit `PG*` values and falls back to `DATABASE_URL`. That matches the current Development-default project policy. The frozen PR's checked-in target/receipt gate is not a defect fix for `main`.
- Current authorization remains session user lookup plus the server admin middleware. The frozen PR's checked-in Development admin receipt must not become runtime authorization.
- `npm test` runs `server/*.test.ts`. `main` has no `server/accounting/` directory or accounting tests, so the present entry point omits no test that exists on `main`.
- A recursive runner must be considered only in the same slice that first adds an accepted nested test. It must not be added for hypothetical future recovery work.

These findings make the first code slice empty. Changing the test runner or runtime target now would modify a non-defective `main` in anticipation of frozen-branch code.

## Exhaustive PR #16 file disposition

The diff contains 478 added and 15 modified files. Each of the 493 paths receives exactly one decision through the following mutually exclusive rules, evaluated in order. The rules are the file-level audit record; no generated inventory is added to the repository.

1. `evidence-only`: `docs/**`, `planning_proposal.md`, `server/fixtures/**`, and `migrations/artifacts/**`. These 246 files may explain branch history but are never copied into a recovery PR.
2. `discard`: `scripts/**` except `scripts/database-schema-catalog.sql`. These 92 files are branch-specific generators, probes, publishers, verifiers, or operational wrappers and are not product authority.
3. `rewrite`: every remaining application, test, configuration, SQL, or migration path, plus `scripts/database-schema-catalog.sql`. These 155 files are candidates only at the level of product need; none may be cherry-picked or copied wholesale.
4. `retain`: no file. Zero files have enough independent, standard-entrypoint and runtime evidence to transfer verbatim.

The disposition totals reconcile exactly: `0 retain + 155 rewrite + 92 discard + 246 evidence-only = 493`.

### Five-slice matrix

| Slice | retain | rewrite | discard | evidence-only | Total | Reason |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| DB target/ledger | 0 | 4 | 3 | 31 | 38 | The branch couples runtime selection to checked-in target evidence and expands a resolver to disposable/Production concerns; `main` currently needs neither. |
| Accounting schema | 0 | 75 | 17 | 26 | Physical accounting SQL and domain code are entangled with a 2,242-line ordinary migration, manual variants, catalog changes, and nonstandard tests. |
| Source decision/import | 0 | 52 | 43 | 124 | Product logic is mixed with versioned adapters, previews, release descriptors, approvals, and generated source artifacts. |
| Admin API/auth | 0 | 10 | 10 | 2 | `server/routes.ts` adds accounting operations while binding authority to a checked-in Development admin receipt; authorization must be rebuilt from live session/admin authority. |
| Verifier/evidence | 0 | 14 | 19 | 63 | Fixtures, manifests, prompts, receipts, and self-verifiers dominate this slice and cannot prove the product behavior they describe. |
| **Total** | **0** | **155** | **92** | **246** | **493** | |

Slice routing is also exclusive: target/ledger paths first; then admin/auth; then source/import; then accounting/schema; all remaining paths are verifier/evidence. This routing is for recovery triage only and creates no new architecture or data contract.

## Recovery rules

- Start every slice from the then-current GitHub `main`; do not cherry-pick PR #16 commits.
- One PR has one direct product goal, at most five changed files and ordinarily fewer than 500 added lines.
- A `rewrite` decision means re-derive the smallest code from current requirements and canonical documents. It is not approval of the frozen implementation.
- `evidence-only` paths remain visible only in the frozen branch. Do not recreate them in the recovery branch.
- Do not add manifests, receipts, protected-tree digests, generated fixtures, or new evidence directories.
- Product code must have a direct test that runs through the standard entry point before a Draft PR is opened.
- Schema changes require the schema document, metadata catalog, and operations runbook updates mandated by project policy. Schema change and data migration remain separate.
- Replit is required for type/build/runtime or Development Database conclusions. Local Mac `node_modules` output is diagnostic only.
- Production stays `unverified` until a separately authorized Production operation; merge and deploy are not part of recovery PRs.
- If a slice exceeds the file/line budget or needs a second new verifier, receipt, or adapter after a failure, stop and split or discard it.

## Small-PR order and completion gates

| Order | Direct goal | Maximum intended scope | Exit evidence |
| ---: | --- | --- | --- |
| 0 | Establish the recovery authority | This document only | Git state, 493-file reconciliation, `git diff --check` |
| 1 | Admit the first real accounting test to the standard test surface | Only after one product-necessary accounting behavior and its independent test are selected; change the test entry point in that same slice if the accepted test is nested | Focused test and standard `npm test` both execute the same accepted test in Replit Development |
| 2 | Recover the minimum accounting persistence invariant | One coherent schema invariant; no source import, admin route, or runtime target expansion | Schema doc/catalog/runbook alignment plus Development-only schema verification |
| 3 | Recover one source read/import path | One approved source, preview-first, no provider write | Pure mapping tests and Development-only preview/reconciliation |
| 4 | Expose one admin operation | Live session/admin authority only; no checked-in actor receipt | Route authorization, same-origin/error-safety tests, Development smoke |

DB target work is not scheduled ahead of a demonstrated need. If a later migration cannot safely distinguish Development from another target using the current project contract, target selection becomes its own prerequisite PR and contains no accounting schema or API work.

## Next startable slice

Perform a read-only candidate review for the first product-necessary accounting behavior and its direct test. The review must reject any candidate that depends on a manifest, receipt, generated source release, in-memory substitute for persistence, or unapproved policy value. Only after one candidate passes that gate may Order 1 start; the test-entrypoint change is then justified by an actual accepted nested test rather than future code.

Until that gate passes, the correct implementation state is zero recovered code files.
