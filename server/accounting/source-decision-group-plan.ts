import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";
import type { PoolClient } from "pg";

type JsonObject = Record<string, CanonicalValue>;
export type GroupApplyItem = { coordinateKey: string; decisionKind: string; decisionPayload: JsonObject };
export type GroupApplySet = { sourceCode: string; batchUid: string; decisionSetUid: string; items: GroupApplyItem[] };
export type GroupMultiBatchApplyPlan = {
  orderedBatchUids: string[];
  orderedDecisionSetUids: string[];
  groups: Array<{ primaryCoordinateKey: string; receiptUid: string; rosterBatchUid: string; duesAmount: string; approvedAllocationAmount: string }>;
};
type StoredCompanion = { batch_id: string; batch_uid: string; batch_status: string; preview_manifest: CanonicalValue; preview_manifest_sha256: string; row_count: number; decision_set_id: string; decision_set_uid: string; decision_set_status: string; manifest: CanonicalValue; manifest_sha256: string; source_code: string; source_fingerprint: string };

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

export async function loadGroupMultiBatchApplyPlan(
  client: Pick<PoolClient, "query">,
  primary: GroupApplySet,
): Promise<GroupMultiBatchApplyPlan | undefined> {
  const approvedRosterAllocations = primary.items.filter((item) => item.decisionKind === "group_allocation" && item.decisionPayload.outcome === "approve");
  if (primary.sourceCode === "GROUP_FOREIGN_FACULTY_2025" && approvedRosterAllocations.length > 0) fail("source_decision_direct_companion_apply_forbidden");
  const rosterBatchUids = primary.items.flatMap((item) => item.decisionKind === "classification" && item.decisionPayload.outcome === "approve" && typeof item.decisionPayload.group_roster_batch_uid_or_null === "string" ? [item.decisionPayload.group_roster_batch_uid_or_null] : []);
  if (rosterBatchUids.length === 0) return undefined;
  const orderedRosterBatchUids = [...new Set(rosterBatchUids)].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  if (orderedRosterBatchUids.length !== rosterBatchUids.length) fail("source_decision_group_companion_reused");
  const stored = await client.query<StoredCompanion>(`SELECT b.id::text batch_id,b.batch_uid::text,b.status batch_status,b.preview_manifest,b.preview_manifest_sha256,b.row_count,b.source_fingerprint,ds.id::text decision_set_id,ds.decision_set_uid::text,ds.status decision_set_status,ds.manifest,ds.manifest_sha256,ls.source_code
    FROM public.accounting_import_batches b
    JOIN public.accounting_source_releases r ON r.id=b.source_release_id
    JOIN public.accounting_logical_sources ls ON ls.id=r.logical_source_id
    JOIN public.source_decision_sets ds ON ds.batch_id=b.id AND ds.status='previewed'
    WHERE b.batch_uid=ANY($1::uuid[])
    ORDER BY b.batch_uid
    FOR UPDATE OF b,r,ls,ds`, [orderedRosterBatchUids]);
  if (stored.rowCount !== orderedRosterBatchUids.length || stored.rows.some((row, index) => row.batch_uid !== orderedRosterBatchUids[index] || row.batch_status !== "previewed" || row.decision_set_status !== "previewed" || row.source_code !== "GROUP_FOREIGN_FACULTY_2025")) fail("source_decision_group_companion_graph_mismatch");
  const companions: GroupApplySet[] = [];
  for (const row of stored.rows) {
    const batchRows = await client.query<{ ordinal: number; coordinate_key: string; content_digest: string; issue_status: string }>(`SELECT br.ordinal,c.coordinate_key,rv.content_digest,rv.issue_status FROM public.accounting_import_batch_rows br JOIN public.accounting_import_coordinates c ON c.id=br.coordinate_id JOIN public.accounting_import_row_versions rv ON rv.id=br.row_version_id WHERE br.batch_id=$1 ORDER BY br.ordinal FOR UPDATE OF br,c,rv`, [row.batch_id]);
    const expectedBatchManifest = batchRows.rows.map((item, index) => {
      if (item.ordinal !== index + 1 || !["accepted", "warning", "blocked"].includes(item.issue_status)) fail("source_decision_group_companion_batch_row_drift");
      if (index > 0 && Buffer.compare(Buffer.from(batchRows.rows[index - 1].coordinate_key), Buffer.from(item.coordinate_key)) >= 0) fail("source_decision_group_companion_batch_row_order_mismatch");
      return { coordinate_key: item.coordinate_key, content_digest: item.content_digest, issue_status: item.issue_status };
    });
    if (row.row_count !== batchRows.rowCount || row.preview_manifest_sha256 !== sha256(canonicalJson(expectedBatchManifest)) || canonicalJson(row.preview_manifest) !== canonicalJson(expectedBatchManifest)) fail("source_decision_group_companion_batch_manifest_drift");
    const items = await client.query<{ ordinal: number; coordinate_key: string; content_digest: string; decision_kind: string; decision_payload: JsonObject; decision_payload_sha256: string }>(`SELECT i.ordinal,c.coordinate_key,rv.content_digest,i.decision_kind,i.decision_payload,i.decision_payload_sha256
      FROM public.source_decision_items i
      JOIN public.accounting_import_coordinates c ON c.id=i.coordinate_id
      JOIN public.accounting_import_row_versions rv ON rv.id=i.source_row_version_id
      WHERE i.decision_set_id=$1
      ORDER BY i.ordinal
      FOR UPDATE OF i,c,rv`, [row.decision_set_id]);
    const manifestItems = items.rows.map((item, index) => {
      if (item.ordinal !== index + 1 || item.decision_payload_sha256 !== sha256(canonicalJson(item.decision_payload))) fail("source_decision_group_companion_item_drift");
      if (index > 0 && Buffer.compare(Buffer.from(`${items.rows[index - 1].coordinate_key}\u0000${items.rows[index - 1].decision_kind}`), Buffer.from(`${item.coordinate_key}\u0000${item.decision_kind}`)) >= 0) fail("source_decision_group_companion_item_order_mismatch");
      return { ordinal: item.ordinal, coordinate_key: item.coordinate_key, source_content_digest: item.content_digest, decision_kind: item.decision_kind, decision_payload_sha256: item.decision_payload_sha256 };
    });
    const expectedManifest = { schema_version: "source-decision-preview-v1", batch_uid: row.batch_uid, source_fingerprint: row.source_fingerprint, items: manifestItems };
    if (row.manifest_sha256 !== sha256(canonicalJson(expectedManifest)) || canonicalJson(row.manifest) !== canonicalJson(expectedManifest)) fail("source_decision_group_companion_manifest_drift");
    const coverage = new Map<string, string[]>(); for (const item of items.rows) coverage.set(item.coordinate_key, [...(coverage.get(item.coordinate_key) ?? []), item.decision_kind]);
    if ([...coverage.values()].some((kinds) => canonicalJson([...kinds].sort()) !== canonicalJson(["group_allocation", "member_match"]))) fail("source_decision_group_companion_coverage_mismatch");
    companions.push({ sourceCode: row.source_code, batchUid: row.batch_uid, decisionSetUid: row.decision_set_uid, items: items.rows.map((item) => ({ coordinateKey: item.coordinate_key, decisionKind: item.decision_kind, decisionPayload: item.decision_payload })) });
  }
  return buildGroupMultiBatchApplyPlan(primary, companions);
}
