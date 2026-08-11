import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { executeReceiptRefundOperation } from "./receipt-refund-service";

const actor = { userId: 7, userUid: "11111111-1111-4111-8111-111111111111", name: "synthetic admin", authorizationVersion: "a".repeat(64), targetFingerprint: "b".repeat(64) };
const command = {
  schemaVersion: "receipt-refund-command-v1" as const,
  operationUid: "22222222-2222-4222-8222-222222222222",
  refundEventUid: "33333333-3333-4333-8333-333333333333",
  receiptUid: "44444444-4444-4444-8444-444444444444",
  originalAllocationRequestUids: ["55555555-5555-4555-8555-555555555555"],
  newAllocationRequestUids: ["66666666-6666-4666-8666-666666666666"],
  correctionReasonCode: null,
  correctionEvidenceSha256: null,
  correctionEvidenceVerified: false,
} as const;

class Fixture {
  calls: Array<{ sql: string; params?: unknown[] }> = [];
  nextId = 100;
  insertedReceipt: { payload: Record<string, unknown>; payloadSha: string; results: unknown } | null = null;
  constructor(private readonly failAllocation = false) {}
  client = { query: async (rawSql: string, params?: unknown[]) => {
    const sql = rawSql.replace(/\s+/g, " ").trim();
    this.calls.push({ sql, params });
    if (sql.startsWith("BEGIN") || sql === "COMMIT" || sql === "ROLLBACK") return { rowCount: null, rows: [] };
    if (sql === "SELECT current_setting('transaction_isolation') transaction_isolation") return { rowCount: 1, rows: [{ transaction_isolation: "serializable" }] };
    if (sql.includes("FROM public.users")) return { rowCount: 1, rows: [{ id: actor.userId, user_uid: actor.userUid, name: actor.name, is_admin: true }] };
    if (sql.includes("FROM public.business_operation_receipts WHERE operation_uid")) {
      if (this.insertedReceipt === null) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ canonical_payload: this.insertedReceipt.payload, payload_sha256: this.insertedReceipt.payloadSha, result_entity_keys: this.insertedReceipt.results, target_fingerprint: actor.targetFingerprint }] };
    }
    if (sql.includes("FROM public.dues_receipts")) return { rowCount: 1, rows: [{ id: "10", event_id: "20", gross_amount: "50000", status: "approved" }] };
    if (sql.includes("FROM public.dues_allocations") && sql.includes("request_uid=ANY")) return { rowCount: 1, rows: [{ id: "30", request_uid: command.originalAllocationRequestUids[0], amount: "50000", allocation_kind: "dues", assessment_id: null, dues_year: 2026, effective_at: "2026-01-01T00:00:00+09:00", group_member_id: null, member_id: "40", receipt_id: "10", status: "approved" }] };
    if (sql.includes("FROM public.economic_events")) return { rowCount: 1, rows: [{ id: "50", event_uid: command.refundEventUid, amount: "50000", occurred_at: "2026-01-15T12:00:00+09:00", direction: "debit", status: "proposed", reverses_event_id: "20", bound_claims: 1, bank_transactions: 1 }] };
    if (sql.startsWith("SELECT nextval")) return { rowCount: 1, rows: [{ id: String(this.nextId++) }] };
    if (sql.startsWith("INSERT INTO public.business_operation_receipts")) {
      this.insertedReceipt = { payload: JSON.parse(String(params?.[5])), payloadSha: String(params?.[7]), results: JSON.parse(String(params?.[9])) };
      return { rowCount: 1, rows: [] };
    }
    if (this.failAllocation && sql.startsWith("INSERT INTO public.dues_allocations")) throw new Error("synthetic_refund_allocation_failure");
    if (sql.startsWith("INSERT") || sql.startsWith("UPDATE")) return { rowCount: 1, rows: [] };
    throw new Error(`unexpected_query:${sql}`);
  }, release: () => undefined } as unknown as PoolClient;
  pool = { connect: async () => this.client };
}

test("refund service locks evidence before reservations and writes receipt before reversal/allocation/audits", async () => {
  const fixture = new Fixture();
  const result = await executeReceiptRefundOperation(fixture.pool, command, actor);
  assert.deepEqual(result, { executionOutcome: "created", payloadSha256: fixture.insertedReceipt!.payloadSha, resultCount: 2 });
  const eventLock = fixture.calls.findIndex((call) => call.sql.includes("FROM public.economic_events"));
  const firstReservation = fixture.calls.findIndex((call) => call.sql.startsWith("SELECT nextval"));
  const receiptInsert = fixture.calls.findIndex((call) => call.sql.startsWith("INSERT INTO public.business_operation_receipts"));
  const reversalInsert = fixture.calls.findIndex((call) => call.sql.startsWith("INSERT INTO public.dues_receipt_reversals"));
  const auditInsert = fixture.calls.findIndex((call) => call.sql.startsWith("INSERT INTO public.accounting_audit_events"));
  assert.ok(firstReservation > eventLock && receiptInsert > firstReservation && reversalInsert > receiptInsert && auditInsert > reversalInsert);
});

test("exact replay is a verified no-op with no new reservation or write", async () => {
  const fixture = new Fixture();
  await executeReceiptRefundOperation(fixture.pool, command, actor);
  const reservations = fixture.calls.filter((call) => call.sql.startsWith("SELECT nextval")).length;
  const writes = fixture.calls.filter((call) => call.sql.startsWith("INSERT INTO") || call.sql.startsWith("UPDATE")).length;
  const replay = await executeReceiptRefundOperation(fixture.pool, command, actor);
  assert.deepEqual(replay, { executionOutcome: "verified_noop", payloadSha256: fixture.insertedReceipt!.payloadSha, resultCount: 2 });
  assert.equal(fixture.calls.filter((call) => call.sql.startsWith("SELECT nextval")).length, reservations);
  assert.equal(fixture.calls.filter((call) => call.sql.startsWith("INSERT INTO") || call.sql.startsWith("UPDATE")).length, writes);
});

test("tail failure rolls back and a changed command cannot reuse the operation UID", async () => {
  const failed = new Fixture(true);
  await assert.rejects(() => executeReceiptRefundOperation(failed.pool, command, actor), /synthetic_refund_allocation_failure/);
  assert.equal(failed.calls.at(-1)?.sql, "ROLLBACK");
  const fixture = new Fixture();
  await executeReceiptRefundOperation(fixture.pool, command, actor);
  await assert.rejects(() => executeReceiptRefundOperation(fixture.pool, { ...command, correctionReasonCode: "source_error", correctionEvidenceSha256: "c".repeat(64), correctionEvidenceVerified: true }, actor), /receipt_refund_operation_uid_reuse/);
  assert.equal(fixture.calls.at(-1)?.sql, "ROLLBACK");
});
