# Development Plan Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the current product vision and executable roadmap into one accurate `planning_proposal.md` without breaking historical links.

**Architecture:** `planning_proposal.md` becomes the only current product and development source of truth. `roadmap.md` remains a compatibility pointer, while `walkthrough.md`, `CHANGELOG.md`, Replit operations, and historical specs retain their focused roles.

**Tech Stack:** Markdown, Node.js documentation contract tests, Git, Replit SSH validation

## Global Constraints

- Preserve untracked user files and historical change records.
- Derive current status from production evidence, current `main`, Replit verification, and the latest approved policy in that order.
- Do not claim production completion from code-only verification.
- Do not retain duplicate status tables in `roadmap.md`.
- Do not expose Secrets, database URLs, tokens, or personal data.

---

### Task 1: Consolidate the current plan

**Files:**
- Modify: `planning_proposal.md`
- Modify: `roadmap.md`

**Interfaces:**
- Consumes: current roadmap states, planning vision, walkthrough evidence, changelog history, current routes and schema
- Produces: one current planning source and one compatibility pointer

- [ ] **Step 1: Rewrite `planning_proposal.md` with one status system**

Include product principles, approved policies, verified foundations, P0/P1 work, active implementation, next work, deferred work, and changed directions. Every active row must include evidence, completion conditions, and dependencies where relevant.

- [ ] **Step 2: Remove stale or overcommitted direction**

Record Supabase client auth, Kakao JavaScript SDK/Sync, CI collection, public obituary data APIs, immediate Sheets retirement, legacy obituary navigation, unrestricted URL parsing, and monthly rights-member rules as changed directions. Treat Aligo and KakaoPay as candidates rather than selected providers.

- [ ] **Step 3: Replace `roadmap.md` with a compatibility notice**

The notice must link to `planning_proposal.md` for current goals and `walkthrough.md` for verification, and must not contain independent status tables.

### Task 2: Align navigation and contract tests

**Files:**
- Modify: `README.md`
- Modify: `replit.md`
- Modify: `walkthrough.md`
- Modify: `CHANGELOG.md`
- Modify: `server/final-recheck-documentation-contract.test.ts`

**Interfaces:**
- Consumes: the consolidated document paths and status vocabulary
- Produces: one active planning link and automated drift protection

- [ ] **Step 1: Update current documentation links**

Describe `planning_proposal.md` as the integrated product and development plan, and record the consolidation in `CHANGELOG.md`. Keep `roadmap.md` listed only as a compatibility pointer if it remains in the README table.

- [ ] **Step 2: Strengthen the documentation contract**

Assert that the integrated plan contains the managed-source/runtime-copy distinction, verified/active/deferred states, and changed directions. Assert that `roadmap.md` points to the integrated plan and no longer contains the old `## 긴급`, `## 다음`, or `## 이후` sections.

- [ ] **Step 3: Run the focused contract test**

Run:

```bash
npx tsx --test server/final-recheck-documentation-contract.test.ts
```

Expected: all documentation contract tests pass.

### Task 3: Verify and publish

**Files:**
- Verify all modified Markdown and tests

**Interfaces:**
- Consumes: Tasks 1 and 2
- Produces: a verified GitHub and Replit-aligned documentation baseline

- [ ] **Step 1: Verify Markdown and repository changes**

Run `git diff --check` and a relative Markdown link existence check. Expected: no whitespace errors or missing linked files.

- [ ] **Step 2: Verify in Replit**

Run `npm run check` and `npm run build` in `/home/runner/workspace`. Expected: both exit `0`; existing bundle-size and Browserslist notices are warnings only.

- [ ] **Step 3: Commit and push**

Stage only the documentation consolidation files and contract test. Commit with `Consolidate product development plan`, push `main`, then fast-forward the Replit workspace and verify matching HEAD.
