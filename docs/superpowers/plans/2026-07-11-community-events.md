> **상태: 이력 보관.** 2026-07-11의 구현 계획 원문이며 현행 실행 지시는 아래 기준서를 따릅니다. 이력 표시일: 2026-11-09.
>
> 현행 기준: [제품·개발 계획](../../product/planning-proposal.md), [Replit 기준](../../../replit.md), [DB 기준](../../reference/database-schema.md). 당시 결정의 유지·변경 여부는 현재 기준서에서 확인합니다.
> 아래 원문·체크박스·명령·도구 지시는 과거 기록이며 새 작업·승인·필수 검사를 만들지 않습니다. 남은 체크박스를 현재 미구현 목록으로 해석하지 않습니다.

# Community Events Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the isolated obituary workflow with a member-only community events system for obituaries, weddings, clinic openings, and other notices without losing existing obituary data or URLs.

**Architecture:** Deliver the approved design in three independently testable plans. The foundation introduces contracts, storage, migration, and authenticated APIs; the UI plan adds one-screen composition, server drafts, templates, and entry points; the parsing plan adds a production-safe public-page reader and mixed text/URL enrichment.

**Tech Stack:** TypeScript 5.6, Express 4, React 18, TanStack Query, Wouter, Zod, Drizzle ORM, PostgreSQL, Node `node:test`, Replit

## Global Constraints

- Execute the plans in the order listed below.
- Work on a `codex/` feature branch in an isolated worktree.
- Do not modify or commit `KIKcd_B.20250701.txt` or `KIKcd_B.20250701.xlsx`.
- Keep every event API member-only with `req.session.userId` as the authentication source.
- Never accept another user's author ID, membership tier, or private profile data from a request body.
- Keep `/about/condolence` public.
- Preserve `/o`, `/o/new`, and existing obituary detail links until production migration is verified.
- Do not execute schema or data SQL automatically in application startup or tests.
- Apply development and production database changes separately using the documented SQL-console procedure.
- Validate each plan in Replit with `npm test`, `npm run check`, and `npm run build`.

---

## Execution Order

1. [Foundation and migration](2026-07-11-community-events-foundation.md)
2. [One-screen UI, drafts, and obituary template](2026-07-11-community-events-ui-drafts.md)
3. [Safe mixed text and URL parsing](2026-07-11-community-events-link-parsing.md)

Each plan ends with its own review, Replit verification, merge, Republish, and production checks. Do not start the next plan while the prior plan's migration or production checks remain unresolved.
