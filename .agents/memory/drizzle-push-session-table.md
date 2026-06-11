---
name: Drizzle push vs connect-pg-simple session table
description: Why `npm run db:push` prompts interactively in this repl and how to apply additive schema changes safely.
---

`npm run db:push` (drizzle-kit) runs its prompt in raw TTY mode and ignores piped stdin (`yes ''`, `printf '\n'`), so it cannot be auto-answered from the agent shell.

It always prompts "Is <X> table created or renamed from another table?" because the `session` table (managed by connect-pg-simple, intentionally NOT in `shared/schema.ts`) looks like a rename candidate whenever a new table is added to the schema.

**Why:** connect-pg-simple owns the `session` table; adding it to the Drizzle schema would be wrong. The diff between schema and live DB therefore always shows `session` as an "extra" table, triggering the create-vs-rename resolution prompt.

**How to apply additive schema changes:** Apply the exact DDL Drizzle would generate directly via the `executeSql` callback (development env targets the same DB as `DATABASE_URL`). Match Drizzle's FK naming convention `<table>_<col>_<reftable>_<refcol>_fk` so a later `db:push` sees no diff. Do NOT re-run `db:push` afterward — it would offer to DROP the session table.

Note: in this dev environment the DB reachable via `executeSql`/drizzle is the same one the running server uses, but it is typically empty (no seed rows).
