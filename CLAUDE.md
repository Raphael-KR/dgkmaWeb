# CLAUDE.md

Project-specific instructions for Claude Code working in this repository.

## Environment

This repository is primarily developed and deployed on **Replit**. Do not assume local `npm` scripts work on this Mac — `tsc`, build, and dev scripts may be missing from `node_modules` here. If a script needs to run, prefer asking the user to run it on Replit (or via `! <command>` if interactive) rather than reaching for a local install.

## Use Graphify as the project map

Before doing any of the following, read `graphify-out/GRAPH_REPORT.md` and consult `graphify-out/graph.json`:

- Architecture analysis or design discussion
- Refactoring across multiple files
- Dependency tracing or flow debugging
- Answering "where does X happen?" / "what calls Y?" questions

Prefer Graphify queries over reading many source files:

- `/graphify query "<question>"` — broad context (BFS)
- `/graphify query "<question>" --dfs` — trace a specific chain
- `/graphify path "<NodeA>" "<NodeB>"` — shortest path between two concepts
- `/graphify explain "<NodeName>"` — plain-language node explanation

When the graph lacks enough information, say so — don't hallucinate edges.

## Sensitive flows: trace through Graphify first

When modifying any of the following, trace the relevant dependencies through Graphify before editing:

- Authentication (Supabase, session handling)
- Onboarding flow
- Kakao login / OAuth callback
- Region selection
- Alumni member flows (directory, member classification, dues)

These areas have non-obvious cross-community couplings (e.g. `LoginModal` bridges three communities). Reading files in isolation will miss the seams.

## Code changes

Prefer small, behavior-preserving edits. Don't add features, refactor, or introduce abstractions beyond what the task requires. If a change is larger than expected, surface that to the user before proceeding.

After meaningful code changes (new files, removed files, restructured modules), suggest running `/graphify --update` to keep the graph in sync. Code-only changes skip the LLM step and update in seconds.

## Files to leave alone

- **`graphify-out/`** — gitignored generated artifacts. Do not commit.
- **`attached_assets/`** — Korean filenames (Hangul + NFC/NFD normalization) may collide on macOS. Do not clean, rename, or delete files in this directory unless explicitly instructed.
