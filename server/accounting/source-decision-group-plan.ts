import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";
import type { PoolClient } from "pg";

type JsonObject = Record<string, CanonicalValue>;
export type GroupApplyEvidence = { decisionItemId: string; coordinateId: string; sourceRowVersionId: string; contentDigest: string; normalizationVersion?: string; normalizedPayload: JsonObject };
export type GroupApplyItem = { coordinateKey: string; decisionKind: string; decisionPayload: JsonObject; evidence?: GroupApplyEvidence };
export type GroupApplySet = { sourceCode: string; batchUid: string; decisionSetUid: string; batchId?: string; decisionSetId?: string; items: GroupApplyItem[] };
export type GroupMultiBatchApplyPlan = {
  orderedBatchUids: string[];
  orderedDecisionSetUids: string[];
  groups: Array<{
    primaryCoordinateKey: string;
    eventPartyUid: string;
    receiptUid: string;
    rosterBatchUid: string;
    classificationKind: string;
    classificationDecisionPayloadSha256: string;
    duesYear: number;
    duesAmount: string;
    approvedAllocationAmount: string;
    categorySplits: Array<{ categoryCode: string; amount: string }>;
    eventAmount: string;
    occurredAt?: string;
    postedDate?: string;
    primaryEvidence?: GroupApplyEvidence;
    allocations: Array<{ coordinateKey: string; allocationRequestUid: string; groupMemberUid: string; memberUid: string; caseUid: string; amount: string; duesYear: number; allocationKind: string; evidenceKind: string; evidenceDigest: string; scoreBasis: string; evidence?: { allocationDecisionItemId: string; memberMatchDecisionItemId: string; coordinateId: string; sourceRowVersionId: string; contentDigest: string; normalizationVersion?: string; normalizedPayload: JsonObject } }>;
  }>;
  resolvedBindings?: { bankAccountId: string; bankAccountCode: string; batchIdsByUid?: Record<string, string>; decisionSetIdsByUid?: Record<string, string>; rosterBatchIdsByUid: Record<string, string>; eventPartyIdsByUid: Record<string, string | null>; memberIdsByUid: Record<string, string>; categoriesByCoordinate: Record<string, Record<string, { id: string; displayName: string }>>; periodIdsByCoordinate: Record<string, string>; financialDigestsByCoordinate: Record<string, { rowFingerprint: string; snapshotDigest: string; payerDigest: string; descriptionDigest: string }> };
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
    const payload = item.decisionPayload; const rosterBatchUid = payload.group_roster_batch_uid_or_null; const receiptUid = payload.receipt_uid_or_null; const eventPartyUid = payload.event_party_uid_or_null;
    if (payload.event_kind !== "bank" || payload.direction !== "credit" || payload.party_kind !== "group" || !["dues", "mixed"].includes(String(payload.classification_kind)) || typeof rosterBatchUid !== "string" || !UUID.test(rosterBatchUid) || typeof receiptUid !== "string" || !UUID.test(receiptUid) || typeof eventPartyUid !== "string" || !UUID.test(eventPartyUid)) fail("source_decision_group_primary_shape_invalid");
    if (seenCompanions.has(rosterBatchUid)) fail("source_decision_group_companion_reused"); seenCompanions.add(rosterBatchUid);
    const companion = companionByBatch.get(rosterBatchUid); if (!companion) fail("source_decision_group_companion_missing");
    const rawCategorySplits = payload.category_splits; if (!Array.isArray(rawCategorySplits)) fail("source_decision_group_category_splits_invalid");
    const categorySplits = rawCategorySplits.map((split) => {
      if (!split || Array.isArray(split) || typeof split !== "object") fail("source_decision_group_category_split_invalid");
      const row = split as JsonObject; if (typeof row.category_code !== "string" || !row.category_code) fail("source_decision_group_category_split_invalid");
      return { categoryCode: row.category_code, amount: money(row.amount, "source_decision_group_category_amount_invalid").toString() };
    });
    if (new Set(categorySplits.map((split) => split.categoryCode)).size !== categorySplits.length) fail("source_decision_group_category_duplicate");
    const duesAmount = categorySplits.filter((split) => split.categoryCode === "DUES_INCOME").reduce((sum, split) => sum + BigInt(split.amount), 0n);
    const eventAmount = categorySplits.reduce((sum, split) => sum + BigInt(split.amount), 0n);
    let occurredAt: string | undefined; let postedDate: string | undefined;
    if (item.evidence) {
      const normalized = item.evidence.normalizedPayload; occurredAt = typeof normalized.occurred_at === "string" ? normalized.occurred_at : undefined; postedDate = typeof normalized.posted_date === "string" ? normalized.posted_date : undefined;
      if (normalized.amount !== eventAmount.toString() || normalized.direction !== payload.direction || !occurredAt || !Number.isFinite(Date.parse(occurredAt)) || !postedDate || !/^\d{4}-\d{2}-\d{2}$/.test(postedDate) || new Date(Date.parse(occurredAt) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) !== postedDate) fail("source_decision_group_event_amount_mismatch");
    }
    if (duesAmount <= 0n) fail("source_decision_group_dues_amount_missing");
    let approvedAllocationAmount = 0n; let approvedCount = 0; const allocations: GroupMultiBatchApplyPlan["groups"][number]["allocations"] = [];
    for (const allocation of companion.items.filter((candidate) => candidate.decisionKind === "group_allocation")) {
      const decision = allocation.decisionPayload;
      if (decision.outcome !== "approve") {
        for (const key of ["allocation_request_uid_or_null", "amount_or_null", "group_member_uid_or_null", "member_uid_or_null", "primary_bank_batch_uid_or_null", "primary_bank_coordinate_key_or_null", "receipt_uid_or_null"]) if (decision[key] !== null) fail("source_decision_group_nonapproved_reference_forbidden");
        continue;
      }
      if (decision.primary_bank_batch_uid_or_null !== primary.batchUid || decision.primary_bank_coordinate_key_or_null !== item.coordinateKey || decision.receipt_uid_or_null !== receiptUid) fail("source_decision_group_primary_binding_mismatch");
      for (const key of ["allocation_request_uid_or_null", "group_member_uid_or_null", "member_uid_or_null"]) if (typeof decision[key] !== "string" || !UUID.test(String(decision[key]))) fail("source_decision_group_allocation_identity_invalid");
      const match = companion.items.find((candidate) => candidate.coordinateKey === allocation.coordinateKey && candidate.decisionKind === "member_match");
      if (!match || match.decisionPayload.outcome !== "approve" || match.decisionPayload.candidate_member_uid_or_null !== decision.member_uid_or_null || typeof match.decisionPayload.case_uid !== "string" || !UUID.test(match.decisionPayload.case_uid) || typeof match.decisionPayload.evidence_kind !== "string" || match.decisionPayload.evidence_kind === "name_only" || typeof match.decisionPayload.evidence_digest !== "string" || !/^[0-9a-f]{64}$/.test(match.decisionPayload.evidence_digest) || typeof match.decisionPayload.score_basis !== "string" || !match.decisionPayload.score_basis) fail("source_decision_group_member_match_binding_mismatch");
      let evidence: GroupMultiBatchApplyPlan["groups"][number]["allocations"][number]["evidence"];
      if (allocation.evidence || match.evidence) {
        if (!allocation.evidence || !match.evidence || allocation.evidence.coordinateId !== match.evidence.coordinateId || allocation.evidence.sourceRowVersionId !== match.evidence.sourceRowVersionId || allocation.evidence.contentDigest !== match.evidence.contentDigest || canonicalJson(allocation.evidence.normalizedPayload) !== canonicalJson(match.evidence.normalizedPayload)) fail("source_decision_group_companion_evidence_mismatch");
        evidence = { allocationDecisionItemId: allocation.evidence.decisionItemId, memberMatchDecisionItemId: match.evidence.decisionItemId, coordinateId: allocation.evidence.coordinateId, sourceRowVersionId: allocation.evidence.sourceRowVersionId, contentDigest: allocation.evidence.contentDigest, normalizationVersion:allocation.evidence.normalizationVersion, normalizedPayload: allocation.evidence.normalizedPayload };
      }
      const amount = money(decision.amount_or_null, "source_decision_group_allocation_amount_invalid");
      if (!Number.isInteger(decision.dues_year_or_null) || typeof decision.allocation_kind_or_null !== "string" || !decision.allocation_kind_or_null) fail("source_decision_group_allocation_shape_invalid");
      allocations.push({ coordinateKey: allocation.coordinateKey, allocationRequestUid: String(decision.allocation_request_uid_or_null), groupMemberUid: String(decision.group_member_uid_or_null), memberUid: String(decision.member_uid_or_null), caseUid: String(match.decisionPayload.case_uid), amount: amount.toString(), duesYear: Number(decision.dues_year_or_null), allocationKind: decision.allocation_kind_or_null, evidenceKind: String(match.decisionPayload.evidence_kind), evidenceDigest: String(match.decisionPayload.evidence_digest), scoreBasis: String(match.decisionPayload.score_basis), evidence });
      approvedAllocationAmount += amount; approvedCount += 1;
    }
    if (approvedCount === 0 || approvedAllocationAmount !== duesAmount) fail("source_decision_group_allocation_total_mismatch");
    if(!Number.isInteger(payload.dues_year_or_null)||Number(payload.dues_year_or_null)<=0)fail("source_decision_group_primary_shape_invalid");
    return { primaryCoordinateKey: item.coordinateKey, eventPartyUid, receiptUid, rosterBatchUid, classificationKind:String(payload.classification_kind), classificationDecisionPayloadSha256:sha256(canonicalJson(payload)), duesYear:Number(payload.dues_year_or_null), duesAmount: duesAmount.toString(), approvedAllocationAmount: approvedAllocationAmount.toString(), categorySplits, eventAmount: eventAmount.toString(), occurredAt, postedDate, primaryEvidence: item.evidence, allocations };
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
    const items = await client.query<{ id: string; ordinal: number; coordinate_id: string; coordinate_key: string; source_row_version_id: string; content_digest: string; normalization_version: string; normalized_payload: JsonObject; decision_kind: string; decision_payload: JsonObject; decision_payload_sha256: string }>(`SELECT i.id::text,i.ordinal,i.coordinate_id::text,c.coordinate_key,i.source_row_version_id::text,rv.content_digest,rv.normalization_version,rv.normalized_payload,i.decision_kind,i.decision_payload,i.decision_payload_sha256
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
    companions.push({ sourceCode: row.source_code, batchUid: row.batch_uid, decisionSetUid: row.decision_set_uid, batchId:row.batch_id, decisionSetId:row.decision_set_id, items: items.rows.map((item) => ({ coordinateKey: item.coordinate_key, decisionKind: item.decision_kind, decisionPayload: item.decision_payload, evidence: { decisionItemId: item.id, coordinateId: item.coordinate_id, sourceRowVersionId: item.source_row_version_id, contentDigest: item.content_digest, normalizationVersion: item.normalization_version, normalizedPayload: item.normalized_payload } })) });
  }
  const plan = buildGroupMultiBatchApplyPlan(primary, companions);
  if (plan.groups.some((group) => !group.primaryEvidence || !group.occurredAt || !group.postedDate || group.allocations.some((allocation) => !allocation.evidence))) fail("source_decision_group_materialization_evidence_missing");
  const memberUids = [...new Set(plan.groups.flatMap((group) => group.allocations.map((allocation) => allocation.memberUid)))].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  const members = await client.query<{ id: string; member_uid: string; status: string }>("SELECT id::text,member_uid::text,status FROM public.association_members WHERE member_uid=ANY($1::uuid[]) ORDER BY member_uid FOR UPDATE", [memberUids]);
  if (members.rowCount !== memberUids.length || members.rows.some((member, index) => member.member_uid !== memberUids[index] || member.status !== "active")) fail("source_decision_group_member_binding_missing");
  const eventPartyUids = [...new Set(plan.groups.map((group) => group.eventPartyUid))].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  const parties = await client.query<{ id: string; party_uid: string; party_kind: string; status: string }>("SELECT id::text,party_uid::text,party_kind,status FROM public.economic_event_parties WHERE party_uid=ANY($1::uuid[]) ORDER BY party_uid FOR UPDATE", [eventPartyUids]);
  if (parties.rows.some((party) => party.party_kind !== "group" || party.status !== "active")) fail("source_decision_group_event_party_binding_mismatch");
  const mapping = await client.query<{ account_id: string; account_code: string; source_code_snapshot: string; account_code_snapshot: string }>(`SELECT a.id::text account_id,a.account_code,m.source_code_snapshot,m.account_code_snapshot FROM public.accounting_logical_sources s JOIN public.bank_source_account_mappings m ON m.logical_source_id=s.id JOIN public.bank_accounts a ON a.id=m.account_id WHERE s.source_code=$1 FOR UPDATE OF s,m,a`, [primary.sourceCode]);
  if (mapping.rowCount !== 1 || mapping.rows[0].source_code_snapshot !== primary.sourceCode || mapping.rows[0].account_code_snapshot !== mapping.rows[0].account_code) fail("source_decision_group_bank_account_binding_mismatch");
  const receiptUids = plan.groups.map((group) => group.receiptUid); const caseUids = plan.groups.flatMap((group) => group.allocations.map((allocation) => allocation.caseUid)); const groupMemberUids = plan.groups.flatMap((group) => group.allocations.map((allocation) => allocation.groupMemberUid)); const allocationRequestUids = plan.groups.flatMap((group) => group.allocations.map((allocation) => allocation.allocationRequestUid));
  for (const values of [receiptUids, caseUids, groupMemberUids, allocationRequestUids]) if (new Set(values).size !== values.length) fail("source_decision_group_materialization_identity_collision");
  const collisions = [
    await client.query("SELECT receipt_uid FROM public.dues_receipts WHERE receipt_uid=ANY($1::uuid[]) FOR UPDATE", [receiptUids]),
    await client.query("SELECT case_uid FROM public.member_match_cases WHERE case_uid=ANY($1::uuid[]) FOR UPDATE", [caseUids]),
    await client.query("SELECT group_member_uid FROM public.dues_group_members WHERE group_member_uid=ANY($1::uuid[]) FOR UPDATE", [groupMemberUids]),
    await client.query("SELECT request_uid FROM public.dues_allocations WHERE request_uid=ANY($1::uuid[]) FOR UPDATE", [allocationRequestUids]),
  ];
  if (collisions.some((collision) => collision.rowCount !== 0)) fail("source_decision_group_materialization_identity_collision");
  const categoryCodes = [...new Set(plan.groups.flatMap((group) => group.categorySplits.map((split) => split.categoryCode)))].sort(compareUtf8);
  const categories = await client.query<{ id: string; category_code: string; display_name: string; active_from: string; active_to: string | null; dues_effect: string }>("SELECT id::text,category_code,display_name,active_from::text,active_to::text,dues_effect FROM public.accounting_categories WHERE status='approved' AND category_code=ANY($1::text[]) ORDER BY category_code,active_from FOR UPDATE", [categoryCodes]);
  const directionByCode: Record<string, string> = { DUES_INCOME: "credit", OTHER_INCOME: "credit", DUES_REFUND: "debit", GENERAL_EXPENSE: "debit", INTERNAL_TRANSFER_IN: "credit", INTERNAL_TRANSFER_OUT: "debit" };
  const categoriesByCoordinate: Record<string, Record<string, { id: string; displayName: string }>> = {};
  for (const group of plan.groups) {
    const bindings: Record<string, { id: string; displayName: string }> = {};
    for (const split of group.categorySplits) { const matches = categories.rows.filter((category) => category.category_code === split.categoryCode && category.active_from <= group.postedDate! && (category.active_to === null || group.postedDate! < category.active_to)); if (matches.length !== 1 || directionByCode[split.categoryCode] !== "credit" || split.categoryCode === "DUES_INCOME" && matches[0].dues_effect !== "dues_credit") fail("source_decision_group_category_binding_mismatch"); bindings[split.categoryCode] = { id: matches[0].id, displayName: matches[0].display_name }; }
    categoriesByCoordinate[group.primaryCoordinateKey] = bindings;
  }
  const periods = await client.query<{ id: string; starts_at: string; ends_at: string | null }>("SELECT id::text,starts_at::text,ends_at::text FROM public.accounting_periods WHERE status='open' ORDER BY starts_at FOR UPDATE");
  const periodIdsByCoordinate: Record<string, string> = {};
  for (const group of plan.groups) { const occurredAt = Date.parse(group.occurredAt!); const matches = periods.rows.filter((period) => Date.parse(period.starts_at) <= occurredAt && (period.ends_at === null || occurredAt < Date.parse(period.ends_at))); if (matches.length !== 1) fail("source_decision_group_period_binding_mismatch"); periodIdsByCoordinate[group.primaryCoordinateKey] = matches[0].id; }
  const financialDigestsByCoordinate: Record<string, { rowFingerprint: string; snapshotDigest: string; payerDigest: string; descriptionDigest: string }> = {};
  for (const group of plan.groups) {
    const normalized = group.primaryEvidence!.normalizedPayload; const payerDigest = normalized.payer_name_key_digest; const descriptionDigest = normalized.transaction_description_digest; const providerRowId = normalized.provider_row_id; const balanceAfter = normalized.balance_after;
    if (typeof payerDigest !== "string" || !/^[0-9a-f]{64}$/.test(payerDigest) || typeof descriptionDigest !== "string" || !/^[0-9a-f]{64}$/.test(descriptionDigest) || typeof providerRowId !== "string" || !providerRowId || balanceAfter !== null && (typeof balanceAfter !== "string" || !/^-?[0-9]+$/.test(balanceAfter))) fail("source_decision_group_financial_evidence_invalid");
    const rowFingerprint = sha256(canonicalJson({ digest_version: "bank-row-v1", account_code: mapping.rows[0].account_code, provider_row_id: providerRowId, source_content_digest: group.primaryEvidence!.contentDigest, posted_date: group.postedDate!, occurred_at: group.occurredAt!, direction: "credit", amount: group.eventAmount, balance_after: balanceAfter }));
    const children = [...group.allocations].sort((left, right) => compareUtf8(`${left.evidence!.contentDigest}\u0000${left.memberUid}\u0000${left.amount}`, `${right.evidence!.contentDigest}\u0000${right.memberUid}\u0000${right.amount}`)).map((allocation, index) => ({ ordinal: index + 1, source_content_digest: allocation.evidence!.contentDigest, member_uid_or_null: allocation.memberUid, match_case_uid_or_null: allocation.caseUid, proposed_amount: allocation.amount }));
    const snapshotDigest = sha256(canonicalJson({ digest_version: "group-snapshot-v1", receipt_uid: group.receiptUid, roster_batch_uid: group.rosterBatchUid, children }));
    financialDigestsByCoordinate[group.primaryCoordinateKey] = { rowFingerprint, snapshotDigest, payerDigest, descriptionDigest };
  }
  if(!primary.batchId||!primary.decisionSetId)fail("source_decision_group_primary_identity_invalid");
  plan.resolvedBindings = { bankAccountId: mapping.rows[0].account_id, bankAccountCode: mapping.rows[0].account_code, batchIdsByUid:Object.fromEntries([[primary.batchUid,primary.batchId],...stored.rows.map((row)=>[row.batch_uid,row.batch_id])]), decisionSetIdsByUid:Object.fromEntries([[primary.decisionSetUid,primary.decisionSetId],...stored.rows.map((row)=>[row.decision_set_uid,row.decision_set_id])]), rosterBatchIdsByUid: Object.fromEntries(stored.rows.map((row) => [row.batch_uid, row.batch_id])), eventPartyIdsByUid: Object.fromEntries(eventPartyUids.map((uid) => [uid, parties.rows.find((party) => party.party_uid === uid)?.id ?? null])), memberIdsByUid: Object.fromEntries(members.rows.map((member) => [member.member_uid, member.id])), categoriesByCoordinate, periodIdsByCoordinate, financialDigestsByCoordinate };
  return plan;
}

function compareUtf8(left: string, right: string): number { return Buffer.compare(Buffer.from(left), Buffer.from(right)); }
