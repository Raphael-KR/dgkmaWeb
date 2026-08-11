import { validateBusinessOperationPayloadV2 } from "./business-operation-payload";
import { deterministicRoleUuid } from "./source-decision-role-plan";
import type { CanonicalValue } from "./source-contracts";
import type { RefundCorrectionReason } from "./refund-activation-contract";

type Result = Readonly<{
  ordinal: number;
  entity_type: string;
  entity_key: string;
  entity_action: string;
  action_correlation_uid: string;
}>;

type ReservationSlot = Readonly<{
  local_ordinal: number;
  phase: 0 | 1 | 2;
  qualified_table_name: string;
  reserved_id: string;
  result_ordinal: number;
  slot_kind: "operation_receipt" | "business_row" | "audit_row";
  slot_kind_order: 0 | 1 | 2;
}>;

export type OperationTailProjection = Readonly<{
  payload: CanonicalValue;
  canonical: string;
  payloadSha256: string;
  results: readonly Result[];
  reservationSlots: readonly ReservationSlot[];
}>;

const ID = /^[1-9][0-9]*$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function fail(code: string): never {
  throw new Error(code);
}

function assertIds(ids: readonly string[], expected: number): void {
  if (ids.length !== expected || ids.some((id) => !ID.test(id)) || new Set(ids).size !== ids.length) {
    fail("operation_tail_reservation_invalid");
  }
}

function project(
  command: string,
  inputs: CanonicalValue,
  receiptId: string,
  results: readonly Result[],
  business: readonly Readonly<{ table: string; id: string }>[],
  auditIds: readonly string[],
): OperationTailProjection {
  assertIds([receiptId], 1);
  assertIds(business.map((entry) => entry.id), results.length);
  assertIds(auditIds, results.length);
  if (results.length === 0 || business.length !== results.length) fail("operation_tail_result_coverage_invalid");
  const reservationSlots: ReservationSlot[] = [
    { local_ordinal: 1, phase: 0, qualified_table_name: "public.business_operation_receipts", reserved_id: receiptId, result_ordinal: 0, slot_kind: "operation_receipt", slot_kind_order: 0 },
    ...business.map((entry, index) => ({ local_ordinal: 1, phase: 1 as const, qualified_table_name: `public.${entry.table}`, reserved_id: entry.id, result_ordinal: index + 1, slot_kind: "business_row" as const, slot_kind_order: 1 as const })),
    ...auditIds.map((id, index) => ({ local_ordinal: 1, phase: 2 as const, qualified_table_name: "public.accounting_audit_events", reserved_id: id, result_ordinal: index + 1, slot_kind: "audit_row" as const, slot_kind_order: 2 as const })),
  ];
  const payload = { command, expected_results: results, inputs, reservation_slots: reservationSlots, schema_version: "business-operation-payload-v2" } as unknown as CanonicalValue;
  const validated = validateBusinessOperationPayloadV2(payload);
  return { payload, canonical: validated.canonical, payloadSha256: validated.sha256, results, reservationSlots };
}

export function projectAnnualPolicyActivationOperation(input: Readonly<{
  operationUid: string;
  commandSha256: string;
  duesYear: number;
  resolutionRef: string;
  receiptId: string;
  policyReservations: readonly Readonly<{ tierCode: string; id: string }>[];
  mappingReservations: readonly Readonly<{ positionCode: string; id: string }>[];
  auditIds: readonly string[];
}>): OperationTailProjection {
  if (!UUID_V4.test(input.operationUid) || !SHA256.test(input.commandSha256) || !Number.isInteger(input.duesYear) || input.resolutionRef.trim() === "") fail("annual_activation_operation_input_invalid");
  if (input.policyReservations.length !== 6 || input.mappingReservations.length === 0) fail("annual_activation_operation_coverage_invalid");
  const definitions = [
    ...input.policyReservations.map((entry) => ({ entityType: "dues_policy", entityKey: `dues-policy:${input.duesYear}:${entry.tierCode}:v2`, table: "dues_policies", id: entry.id })),
    ...input.mappingReservations.map((entry) => ({ entityType: "dues_position_tier_mapping", entityKey: `dues-position-tier-mapping:${input.duesYear}:${entry.positionCode}:v2`, table: "dues_position_tier_mappings", id: entry.id })),
  ];
  const results = definitions.map((entry, index) => ({
    ordinal: index + 1,
    entity_type: entry.entityType,
    entity_key: entry.entityKey,
    entity_action: "approve",
    action_correlation_uid: deterministicRoleUuid(`${input.operationUid}\nannual-activation\n${entry.entityKey}`),
  }));
  return project(
    "annual_policy_activation:approve",
    { command_sha256: input.commandSha256, dues_year: input.duesYear, resolution_ref: input.resolutionRef },
    input.receiptId,
    results,
    definitions.map((entry) => ({ table: entry.table, id: entry.id })),
    input.auditIds,
  );
}

export function projectReceiptRefundOperation(input: Readonly<{
  operationUid: string;
  commandSha256: string;
  receiptUid: string;
  refundEventUid: string;
  correctionReasonCode: RefundCorrectionReason;
  correctionEvidenceSha256: string | null;
  operationReceiptId: string;
  reversalId: string;
  allocationIds: readonly string[];
  allocationRequestUids: readonly string[];
  auditIds: readonly string[];
}>): OperationTailProjection {
  if (!UUID_V4.test(input.operationUid) || !UUID_V4.test(input.receiptUid) || !UUID_V4.test(input.refundEventUid) || !SHA256.test(input.commandSha256)) fail("receipt_refund_operation_input_invalid");
  if (input.correctionReasonCode === null ? input.correctionEvidenceSha256 !== null : input.correctionEvidenceSha256 === null || !SHA256.test(input.correctionEvidenceSha256)) fail("receipt_refund_operation_correction_pair_invalid");
  if (input.allocationIds.length === 0 || input.allocationIds.length !== input.allocationRequestUids.length || input.allocationRequestUids.some((uid) => !UUID_V4.test(uid))) fail("receipt_refund_operation_allocation_coverage_invalid");
  const definitions = [
    { entityType: "dues_receipt_reversal", entityKey: `dues-receipt-reversal:${input.receiptUid}:${input.refundEventUid}`, table: "dues_receipt_reversals", id: input.reversalId },
    ...input.allocationIds.map((id, index) => ({ entityType: "dues_allocation", entityKey: `dues-allocation:${input.allocationRequestUids[index]}`, table: "dues_allocations", id })),
  ];
  const results = definitions.map((entry, index) => ({
    ordinal: index + 1,
    entity_type: entry.entityType,
    entity_key: entry.entityKey,
    entity_action: "approve",
    action_correlation_uid: deterministicRoleUuid(`${input.operationUid}\nreceipt-refund\n${entry.entityKey}`),
  }));
  return project(
    "receipt:refund",
    { command_sha256: input.commandSha256, correction_evidence_sha256_or_null: input.correctionEvidenceSha256, correction_reason_code_or_null: input.correctionReasonCode, receipt_uid: input.receiptUid, refund_event_uid: input.refundEventUid },
    input.operationReceiptId,
    results,
    definitions.map((entry) => ({ table: entry.table, id: entry.id })),
    input.auditIds,
  );
}
