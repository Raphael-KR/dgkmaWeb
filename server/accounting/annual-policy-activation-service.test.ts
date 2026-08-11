import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { executeAnnualPolicyActivationOperation } from "./annual-policy-activation-service";

const actor = { userId: 7, userUid: "11111111-1111-4111-8111-111111111111", name: "synthetic admin", authorizationVersion: "a".repeat(64), targetFingerprint: "b".repeat(64) };
const command = { schemaVersion: "annual-policy-activation-command-v1" as const, operationUid: "22222222-2222-4222-8222-222222222222", duesYear: 2026, effectiveAt: "2026-01-01T00:00:00+09:00", resolutionRef: "owner-approved" };
const tiers = ["president", "senior_vice_president", "vice_president_auditor_chair", "director", "member", "honorary"];

class Fixture {
  calls: Array<{ sql: string; params?: unknown[] }> = [];
  nextId = 100;
  insertedReceipt: { payload: Record<string, unknown>; payloadSha: string; results: unknown } | null = null;
  client = { query: async (rawSql: string, params?: unknown[]) => {
    const sql = rawSql.replace(/\s+/g, " ").trim();
    this.calls.push({ sql, params });
    if (sql.startsWith("BEGIN") || sql === "COMMIT" || sql === "ROLLBACK") return { rowCount: null, rows: [] };
    if (sql === "SELECT current_setting('transaction_isolation') transaction_isolation") return { rowCount: 1, rows: [{ transaction_isolation: "serializable" }] };
    if (sql.includes("FROM public.users")) return { rowCount: 1, rows: [{ id: actor.userId, user_uid: actor.userUid, name: actor.name, is_admin: true }] };
    if (sql.includes("FROM public.business_operation_receipts WHERE operation_uid")) {
      if (this.insertedReceipt === null) return { rowCount: 0, rows: [] };
      return {
        rowCount: 1,
        rows: [{
          canonical_payload: this.insertedReceipt.payload,
          payload_sha256: this.insertedReceipt.payloadSha,
          result_entity_keys: this.insertedReceipt.results,
          target_fingerprint: actor.targetFingerprint,
        }],
      };
    }
    if (sql.includes("FROM public.dues_policies") && sql.includes("status='draft'")) return { rowCount: 6, rows: tiers.map((tier, index) => ({ id: String(index + 1), tier_code: tier, priority: 600 - index, monthly_minimum: "1000", annual_minimum: "12000", due_day: 10, reminder_day: 11, source_logical_id: "9", source_row_version_id: null, version: 1 })) };
    if (sql.includes("FROM public.dues_position_tier_mappings") && sql.includes("status='draft'")) return { rowCount: 2, rows: [{ id: "20", position_code: "member", tier_code: "member", priority: 100, adds_obligation: true, source_logical_id: "9", source_row_version_id: null, version: 1 }, { id: "21", position_code: "secondary", tier_code: null, priority: 0, adds_obligation: false, source_logical_id: "9", source_row_version_id: null, version: 1 }] };
    if (sql.includes("version<>1")) return { rowCount: 1, rows: [{ policies: 0, mappings: 0 }] };
    if (sql.startsWith("SELECT nextval")) return { rowCount: 1, rows: [{ id: String(this.nextId++) }] };
    if (sql.startsWith("INSERT INTO public.business_operation_receipts")) { this.insertedReceipt = { payload: JSON.parse(String(params?.[5])), payloadSha: String(params?.[7]), results: JSON.parse(String(params?.[9])) }; return { rowCount: 1, rows: [] }; }
    if (sql.startsWith("INSERT INTO public.business_operation_entities") || sql.startsWith("INSERT INTO public.dues_policies") || sql.startsWith("INSERT INTO public.dues_position_tier_mappings") || sql.startsWith("INSERT INTO public.accounting_audit_events")) return { rowCount: 1, rows: [] };
    throw new Error(`unexpected_query:${sql}`);
  }, release: () => undefined } as unknown as PoolClient;
  pool = { connect: async () => this.client };
}

test("annual activation service locks before every reservation and persists receipt before policy/mapping rows", async () => {
  const fixture = new Fixture();
  const result = await executeAnnualPolicyActivationOperation(fixture.pool, command, actor);
  assert.deepEqual(result, { executionOutcome: "created", payloadSha256: fixture.insertedReceipt!.payloadSha, resultCount: 8 });
  const firstReservation = fixture.calls.findIndex((call) => call.sql.startsWith("SELECT nextval"));
  const lastGraphLock = fixture.calls.findLastIndex((call) => call.sql.includes("ORDER BY position_code FOR UPDATE"));
  const receiptInsert = fixture.calls.findIndex((call) => call.sql.startsWith("INSERT INTO public.business_operation_receipts"));
  const policyInsert = fixture.calls.findIndex((call) => call.sql.startsWith("INSERT INTO public.dues_policies"));
  assert.ok(firstReservation > lastGraphLock && receiptInsert > firstReservation && policyInsert > receiptInsert);
  assert.equal((fixture.insertedReceipt!.payload.expected_results as unknown[]).length, 8);
});

test("invalid operation UID fails before opening a transaction", async () => {
  const fixture = new Fixture();
  await assert.rejects(() => executeAnnualPolicyActivationOperation(fixture.pool, { ...command, operationUid: "bad" }, actor), /annual_activation_command_invalid/);
  assert.equal(fixture.calls.length, 0);
});

test("an exact replay verifies the immutable receipt without reserving or writing again", async () => {
  const fixture = new Fixture();
  assert.equal((await executeAnnualPolicyActivationOperation(fixture.pool, command, actor)).executionOutcome, "created");
  const reservationsAfterCreate = fixture.calls.filter((call) => call.sql.startsWith("SELECT nextval")).length;
  const writesAfterCreate = fixture.calls.filter((call) => call.sql.startsWith("INSERT INTO")).length;
  const replay = await executeAnnualPolicyActivationOperation(fixture.pool, command, actor);
  assert.deepEqual(replay, { executionOutcome: "verified_noop", payloadSha256: fixture.insertedReceipt!.payloadSha, resultCount: 8 });
  assert.equal(fixture.calls.filter((call) => call.sql.startsWith("SELECT nextval")).length, reservationsAfterCreate);
  assert.equal(fixture.calls.filter((call) => call.sql.startsWith("INSERT INTO")).length, writesAfterCreate);
});

test("operation UID reuse with different command content fails closed", async () => {
  const fixture = new Fixture();
  await executeAnnualPolicyActivationOperation(fixture.pool, command, actor);
  await assert.rejects(
    () => executeAnnualPolicyActivationOperation(fixture.pool, { ...command, resolutionRef: "different-resolution" }, actor),
    /annual_activation_operation_uid_reuse/,
  );
  assert.equal(fixture.calls.at(-1)?.sql, "ROLLBACK");
});
