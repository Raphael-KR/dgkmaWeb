import assert from "node:assert/strict";
import test from "node:test";
import { validateBusinessOperationPayloadV2 } from "./business-operation-payload";
import { projectAnnualPolicyActivationOperation, projectReceiptRefundOperation } from "./operation-tail-contract";

const operationUid = "11111111-1111-4111-8111-111111111111";
const receiptUid = "22222222-2222-4222-8222-222222222222";
const refundEventUid = "33333333-3333-4333-8333-333333333333";
const requestUids = ["44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"];

test("annual activation projection orders receipt, all policy/mapping rows, then one audit per result", () => {
  const projection = projectAnnualPolicyActivationOperation({
    operationUid,
    commandSha256: "a".repeat(64),
    duesYear: 2026,
    resolutionRef: "owner-approved-annual-activation",
    receiptId: "1",
    policyReservations: ["president", "senior_vice_president", "vice_president_auditor_chair", "director", "member", "honorary"].map((tierCode, index) => ({ tierCode, id: String(index + 2) })),
    mappingReservations: [{ positionCode: "member", id: "8" }, { positionCode: "secondary", id: "9" }],
    auditIds: Array.from({ length: 8 }, (_, index) => String(index + 10)),
  });
  assert.equal(projection.results.length, 8);
  assert.equal(projection.reservationSlots.length, 17);
  assert.deepEqual(projection.reservationSlots.map((slot) => slot.phase), [0, ...Array(8).fill(1), ...Array(8).fill(2)]);
  assert.equal(validateBusinessOperationPayloadV2(projection.payload).sha256, projection.payloadSha256);
});

test("refund projection binds nullable correction pair and complete reversal/allocation audit slots", () => {
  const ordinary = projectReceiptRefundOperation({ operationUid, commandSha256: "b".repeat(64), receiptUid, refundEventUid, correctionReasonCode: null, correctionEvidenceSha256: null, operationReceiptId: "1", reversalId: "2", allocationIds: ["3", "4"], allocationRequestUids: requestUids, auditIds: ["5", "6", "7"] });
  assert.equal(ordinary.results.length, 3);
  assert.equal(ordinary.reservationSlots.length, 7);
  const correction = projectReceiptRefundOperation({ operationUid, commandSha256: "c".repeat(64), receiptUid, refundEventUid, correctionReasonCode: "source_error", correctionEvidenceSha256: "d".repeat(64), operationReceiptId: "8", reversalId: "9", allocationIds: ["10", "11"], allocationRequestUids: requestUids, auditIds: ["12", "13", "14"] });
  assert.notEqual(ordinary.payloadSha256, correction.payloadSha256);
  assert.throws(() => projectReceiptRefundOperation({ operationUid, commandSha256: "c".repeat(64), receiptUid, refundEventUid, correctionReasonCode: null, correctionEvidenceSha256: "d".repeat(64), operationReceiptId: "8", reversalId: "9", allocationIds: ["10", "11"], allocationRequestUids: requestUids, auditIds: ["12", "13", "14"] }), /receipt_refund_operation_correction_pair_invalid/);
});

test("missing, duplicate or miscounted reservations fail before payload acceptance", () => {
  assert.throws(() => projectAnnualPolicyActivationOperation({ operationUid, commandSha256: "a".repeat(64), duesYear: 2026, resolutionRef: "approved", receiptId: "1", policyReservations: [], mappingReservations: [], auditIds: [] }), /annual_activation_operation_coverage_invalid/);
  assert.throws(() => projectReceiptRefundOperation({ operationUid, commandSha256: "b".repeat(64), receiptUid, refundEventUid, correctionReasonCode: null, correctionEvidenceSha256: null, operationReceiptId: "1", reversalId: "2", allocationIds: ["2", "2"], allocationRequestUids: requestUids, auditIds: ["5", "6", "7"] }), /operation_tail_reservation_invalid/);
});

test("business reservation identity is qualified by table", () => {
  const projection = projectReceiptRefundOperation({
    operationUid,
    commandSha256: "e".repeat(64),
    receiptUid,
    refundEventUid,
    correctionReasonCode: null,
    correctionEvidenceSha256: null,
    operationReceiptId: "1",
    reversalId: "2",
    allocationIds: ["2", "3"],
    allocationRequestUids: requestUids,
    auditIds: ["4", "5", "6"],
  });
  assert.deepEqual(
    projection.reservationSlots.filter((slot) => slot.phase === 1).map((slot) => [slot.qualified_table_name, slot.reserved_id]),
    [["public.dues_receipt_reversals", "2"], ["public.dues_allocations", "2"], ["public.dues_allocations", "3"]],
  );
});
