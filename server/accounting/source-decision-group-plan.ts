import type { CanonicalValue } from "./source-contracts";

type JsonObject = Record<string, CanonicalValue>;
export type GroupApplyItem = { coordinateKey: string; decisionKind: string; decisionPayload: JsonObject };
export type GroupApplySet = { sourceCode: string; batchUid: string; decisionSetUid: string; items: GroupApplyItem[] };
export type GroupMultiBatchApplyPlan = {
  orderedBatchUids: string[];
  orderedDecisionSetUids: string[];
  groups: Array<{ primaryCoordinateKey: string; receiptUid: string; rosterBatchUid: string; duesAmount: string; approvedAllocationAmount: string }>;
};

const BANK_SOURCES = new Set(["BANK_TOSS_2026", "BANK_IBK_2026"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MONEY = /^[1-9][0-9]*$/;
function fail(code: string): never { throw new Error(code); }
function money(value: CanonicalValue | undefined, code: string): bigint {
  if (typeof value !== "string" || !MONEY.test(value)) fail(code);
  return BigInt(value);
}

export function buildGroupMultiBatchApplyPlan(primary: GroupApplySet, companions: GroupApplySet[]): GroupMultiBatchApplyPlan {
  if (primary.sourceCode === "GROUP_FOREIGN_FACULTY_2025") fail("source_decision_direct_companion_apply_forbidden");
  if (!BANK_SOURCES.has(primary.sourceCode)) fail("source_decision_group_primary_source_invalid");
  if (!UUID.test(primary.batchUid) || !UUID.test(primary.decisionSetUid)) fail("source_decision_group_primary_identity_invalid");
  const companionByBatch = new Map<string, GroupApplySet>();
  for (const companion of companions) {
    if (companion.sourceCode !== "GROUP_FOREIGN_FACULTY_2025" || !UUID.test(companion.batchUid) || !UUID.test(companion.decisionSetUid)) fail("source_decision_group_companion_identity_invalid");
    if (companionByBatch.has(companion.batchUid)) fail("source_decision_group_companion_duplicate");
    companionByBatch.set(companion.batchUid, companion);
  }
  const groupItems = primary.items.filter((item) => item.decisionKind === "classification" && item.decisionPayload.outcome === "approve" && item.decisionPayload.group_roster_batch_uid_or_null !== null);
  if (groupItems.length === 0) fail("source_decision_group_primary_item_missing");
  const seenCompanions = new Set<string>();
  const groups = groupItems.map((item) => {
    const payload = item.decisionPayload; const rosterBatchUid = payload.group_roster_batch_uid_or_null; const receiptUid = payload.receipt_uid_or_null;
    if (payload.event_kind !== "bank" || payload.direction !== "credit" || payload.party_kind !== "group" || !["dues", "mixed"].includes(String(payload.classification_kind)) || typeof rosterBatchUid !== "string" || !UUID.test(rosterBatchUid) || typeof receiptUid !== "string" || !UUID.test(receiptUid)) fail("source_decision_group_primary_shape_invalid");
    if (seenCompanions.has(rosterBatchUid)) fail("source_decision_group_companion_reused"); seenCompanions.add(rosterBatchUid);
    const companion = companionByBatch.get(rosterBatchUid); if (!companion) fail("source_decision_group_companion_missing");
    const categorySplits = payload.category_splits; if (!Array.isArray(categorySplits)) fail("source_decision_group_category_splits_invalid");
    const duesAmount = categorySplits.reduce((sum, split) => {
      if (!split || Array.isArray(split) || typeof split !== "object") fail("source_decision_group_category_split_invalid");
      const row = split as JsonObject; return row.category_code === "DUES_INCOME" ? sum + money(row.amount, "source_decision_group_category_amount_invalid") : sum;
    }, 0n);
    if (duesAmount <= 0n) fail("source_decision_group_dues_amount_missing");
    let approvedAllocationAmount = 0n; let approvedCount = 0;
    for (const allocation of companion.items.filter((candidate) => candidate.decisionKind === "group_allocation")) {
      const decision = allocation.decisionPayload;
      if (decision.outcome !== "approve") {
        for (const key of ["allocation_request_uid_or_null", "amount_or_null", "group_member_uid_or_null", "member_uid_or_null", "primary_bank_batch_uid_or_null", "primary_bank_coordinate_key_or_null", "receipt_uid_or_null"]) if (decision[key] !== null) fail("source_decision_group_nonapproved_reference_forbidden");
        continue;
      }
      if (decision.primary_bank_batch_uid_or_null !== primary.batchUid || decision.primary_bank_coordinate_key_or_null !== item.coordinateKey || decision.receipt_uid_or_null !== receiptUid) fail("source_decision_group_primary_binding_mismatch");
      for (const key of ["allocation_request_uid_or_null", "group_member_uid_or_null", "member_uid_or_null"]) if (typeof decision[key] !== "string" || !UUID.test(String(decision[key]))) fail("source_decision_group_allocation_identity_invalid");
      approvedAllocationAmount += money(decision.amount_or_null, "source_decision_group_allocation_amount_invalid"); approvedCount += 1;
    }
    if (approvedCount === 0 || approvedAllocationAmount !== duesAmount) fail("source_decision_group_allocation_total_mismatch");
    return { primaryCoordinateKey: item.coordinateKey, receiptUid, rosterBatchUid, duesAmount: duesAmount.toString(), approvedAllocationAmount: approvedAllocationAmount.toString() };
  });
  if (seenCompanions.size !== companionByBatch.size) fail("source_decision_group_unreferenced_companion");
  const orderedCompanions = [...companions].sort((left, right) => Buffer.compare(Buffer.from(left.batchUid), Buffer.from(right.batchUid)));
  return { orderedBatchUids: [primary.batchUid, ...orderedCompanions.map((value) => value.batchUid)], orderedDecisionSetUids: [primary.decisionSetUid, ...orderedCompanions.map((value) => value.decisionSetUid)], groups };
}
