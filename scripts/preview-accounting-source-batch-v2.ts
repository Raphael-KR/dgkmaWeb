import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool, PoolClient } from "pg";
import { createTargetPool, resolveDevelopmentTarget, shutdownPool, verifyDevelopmentTarget } from "../server/db-target";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";
import { batchPreviewManifest, buildDecisionManifest, contentDigest, validateSourcePreviewInput, type SourcePreviewInput, type SourcePreviewRow } from "../server/accounting/source-preview-contract-v2";
import { verifyActorReceipt } from "./admin-actor-receipt";

type JsonObject = Record<string, CanonicalValue>;
type Actor = Awaited<ReturnType<typeof verifyActorReceipt>>;
type ResultPlan = {
  action: "preview" | "create" | "supersede";
  entityKey: string;
  entityType: "import_batch" | "source_coordinate" | "source_row" | "source_batch_row" | "source_decision_set" | "source_decision_item";
  table: string;
  rank: number;
  businessId?: string;
  correlationUid?: string;
  auditId?: string;
  auditEventUid?: string;
  after: JsonObject;
};
type RowPlan = {
  input: SourcePreviewRow;
  coordinateId?: string;
  coordinateNew: boolean;
  rowVersionId?: string;
  rowVersionNew: boolean;
  rowVersionAction: "create" | "supersede";
  version: number;
  supersedesId: string | null;
  contentDigest: string;
  batchRowId?: string;
  ordinal: number;
};

const ACTOR_RECEIPT = "docs/database-targets/development-admin-approved.json";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SOURCE_SLUG: Record<string, string> = {
  AGM36_PERIOD_BOUNDARY: "agm36-period-boundary", BANK_IBK_2026: "bank-ibk-2026", BANK_TOSS_2026: "bank-toss-2026",
  GROUP_FOREIGN_FACULTY_2025: "group-foreign-faculty-2025", LEDGER_DUES_POLICY_2024_2025: "ledger-dues-policy-2024-2025",
  LEDGER_FINAL_2022_2025: "ledger-final-2022-2025", MEMBERSHIP_INTEGRATED_ADDRESS_BOOK: "membership-integrated-address-book",
  NOTION_DUES_REGULATION_DRAFT: "notion-dues-regulation-draft", NOTION_ORGANIZATION_ROLE_HISTORY: "notion-organization-role-history",
};

function fail(code: string): never { throw new Error(code); }
function utf8Compare(left: string, right: string): number { return Buffer.compare(Buffer.from(left), Buffer.from(right)); }
function arg(name: string): string { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) fail(`missing_argument:${name}`); return process.argv[index + 1]; }
function readJson(path: string): unknown { return JSON.parse(readFileSync(path, "utf8")); }
function deterministicUuidV4(seed: string): string {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16); bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex"); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function reserve(client: PoolClient, table: string): Promise<string> {
  const result = await client.query<{ id: string }>("SELECT nextval(pg_get_serial_sequence($1,'id'))::text AS id", [`public.${table}`]); return result.rows[0].id;
}
function resultIdentity(plan: ResultPlan): string { return `${plan.entityType}\u0000${plan.entityKey}\u0000${plan.action}`; }
function canonicalResult(plan: ResultPlan, ordinal: number) {
  return { ordinal, entity_type: plan.entityType, entity_key: plan.entityKey, entity_action: plan.action, action_correlation_uid: plan.correlationUid! };
}

function descriptorFor(input: SourcePreviewInput): JsonObject {
  const slug = SOURCE_SLUG[input.source_code]; if (!slug) fail("source_preview_descriptor_source_unknown");
  const path = `docs/source-contracts/releases/${slug}-v2.json`; const descriptor = readJson(path) as JsonObject;
  if (descriptor.source_code !== input.source_code || descriptor.adapter_version !== "2.0.0" || typeof descriptor.mapping_table_sha256 !== "string") fail("source_preview_descriptor_invalid");
  return descriptor;
}

async function verifyNoop(client: PoolClient, input: SourcePreviewInput, releaseId: string, batchManifest: CanonicalValue, batchManifestSha256: string, decisionManifest: CanonicalValue, decisionManifestSha256: string): Promise<boolean> {
  const batch = await client.query<{ id: string; batch_uid: string; row_count: number; warning_count: number; error_count: number; preview_manifest: CanonicalValue; preview_manifest_sha256: string; source_revision: string; captured_timezone: string; coverage_from: string; coverage_through: string; status: string }>("SELECT id::text,batch_uid::text,row_count,warning_count,error_count,preview_manifest,preview_manifest_sha256,source_revision,captured_timezone,coverage_from::text,coverage_through::text,status FROM public.accounting_import_batches WHERE source_release_id=$1 AND source_fingerprint=$2", [releaseId, input.source_fingerprint]);
  if (batch.rowCount === 0) return false;
  const row = batch.rows[0];
  const warningCount = input.rows.filter((candidate) => candidate.issue_status === "warning").length;
  if (row.batch_uid !== input.batch_uid || row.row_count !== input.rows.length || row.warning_count !== warningCount || row.error_count !== 0 || row.preview_manifest_sha256 !== batchManifestSha256 || canonicalJson(row.preview_manifest) !== canonicalJson(batchManifest) || row.source_revision !== input.source_revision || row.captured_timezone !== input.captured_timezone || Date.parse(row.coverage_from) !== Date.parse(input.coverage_from) || Date.parse(row.coverage_through) !== Date.parse(input.coverage_through) || row.status !== "previewed") fail("source_preview_existing_batch_mismatch");
  const set = await client.query<{ decision_set_uid: string; manifest: CanonicalValue; manifest_sha256: string; status: string }>("SELECT decision_set_uid::text,manifest,manifest_sha256,status FROM public.source_decision_sets WHERE batch_id=$1", [row.id]);
  if (set.rowCount !== 1 || set.rows[0].decision_set_uid !== input.decision_set_uid || set.rows[0].manifest_sha256 !== decisionManifestSha256 || canonicalJson(set.rows[0].manifest) !== canonicalJson(decisionManifest) || set.rows[0].status !== "previewed") fail("source_preview_existing_set_mismatch");
  const counts = await client.query<{ links: number; items: number; receipts: number }>("SELECT (SELECT count(*)::int FROM public.accounting_import_batch_rows WHERE batch_id=$1) links,(SELECT count(*)::int FROM public.source_decision_items i JOIN public.source_decision_sets s ON s.id=i.decision_set_id WHERE s.batch_id=$1) items,(SELECT count(*)::int FROM public.business_operation_receipts WHERE operation_uid=$2::uuid) receipts", [row.id, input.operation_uid]);
  const expectedItems = input.rows.reduce((count, sourceRow) => count + sourceRow.decisions.length, 0);
  if (counts.rows[0].links !== input.rows.length || counts.rows[0].items !== expectedItems || counts.rows[0].receipts !== 1) fail("source_preview_existing_graph_mismatch");
  return true;
}

async function resolveRows(client: PoolClient, input: SourcePreviewInput, logicalSourceId: string): Promise<RowPlan[]> {
  const rows = [...input.rows].sort((left, right) => utf8Compare(left.coordinate_key, right.coordinate_key));
  const plans: RowPlan[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]; const digest = contentDigest(row.normalized_payload);
    const coordinate = await client.query<{ id: string; coordinate_normalization_version: string }>("SELECT id::text,coordinate_normalization_version FROM public.accounting_import_coordinates WHERE logical_source_id=$1 AND coordinate_key=$2 FOR UPDATE", [logicalSourceId, row.coordinate_key]);
    if (coordinate.rowCount > 1) fail("source_preview_coordinate_ambiguous");
    if (coordinate.rowCount === 1 && coordinate.rows[0].coordinate_normalization_version !== row.coordinate_normalization_version) fail("source_preview_coordinate_normalization_drift");
    let exact: { id: string } | undefined; let tip: { id: string; version: number } | undefined;
    if (coordinate.rowCount === 1) {
      const exactResult = await client.query<{ id: string }>("SELECT id::text FROM public.accounting_import_row_versions WHERE coordinate_id=$1 AND content_digest=$2", [coordinate.rows[0].id, digest]); exact = exactResult.rows[0];
      const tipResult = await client.query<{ id: string; version: number }>("SELECT id::text,version FROM public.accounting_import_row_versions WHERE coordinate_id=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE", [coordinate.rows[0].id]); tip = tipResult.rows[0];
    }
    plans.push({ input: row, coordinateId: coordinate.rows[0]?.id, coordinateNew: coordinate.rowCount === 0, rowVersionId: exact?.id, rowVersionNew: !exact, rowVersionAction: tip ? "supersede" : "create", version: exact ? 0 : (tip?.version ?? 0) + 1, supersedesId: exact ? null : tip?.id ?? null, contentDigest: digest, ordinal: index + 1 });
  }
  return plans;
}

function buildResultPlans(input: SourcePreviewInput, rows: RowPlan[], manifestItems: ReturnType<typeof buildDecisionManifest>["items"]): ResultPlan[] {
  const plans: ResultPlan[] = [{ entityType: "import_batch", action: "preview", entityKey: `batch:${input.batch_uid}`, table: "accounting_import_batches", rank: 110, after: { batch_uid: input.batch_uid, source_fingerprint: input.source_fingerprint, row_count: input.rows.length, warning_count: input.rows.filter((row) => row.issue_status === "warning").length, error_count: 0, status: "previewed" } }];
  for (const row of rows) {
    if (row.coordinateNew) plans.push({ entityType: "source_coordinate", action: "create", entityKey: `coordinate:${input.source_code}:${row.input.coordinate_key}`, table: "accounting_import_coordinates", rank: 120, after: {} });
    if (row.rowVersionNew) plans.push({ entityType: "source_row", action: row.rowVersionAction, entityKey: `source-row:${input.source_code}:${row.input.coordinate_key}:${row.contentDigest}`, table: "accounting_import_row_versions", rank: 130, after: { content_digest: row.contentDigest, coordinate_key: row.input.coordinate_key, issue_status: row.input.issue_status } });
    plans.push({ entityType: "source_batch_row", action: "create", entityKey: `batch-row:${input.batch_uid}:${row.ordinal}`, table: "accounting_import_batch_rows", rank: 130, after: {} });
  }
  plans.push({ entityType: "source_decision_set", action: "preview", entityKey: `decision-set:${input.decision_set_uid}`, table: "source_decision_sets", rank: 135, after: { decision_set_uid: input.decision_set_uid, source_fingerprint: input.source_fingerprint, status: "previewed" } });
  for (const item of manifestItems) plans.push({ entityType: "source_decision_item", action: "create", entityKey: `decision-item:${input.decision_set_uid}:${item.ordinal}`, table: "source_decision_items", rank: 136, after: { coordinate_key: item.coordinate_key, decision_kind: item.decision_kind, decision_payload_sha256: item.decision_payload_sha256, ordinal: item.ordinal, source_content_digest: item.source_content_digest } });
  return plans.sort((left, right) => left.rank - right.rank || utf8Compare(left.entityType, right.entityType) || utf8Compare(left.entityKey, right.entityKey) || utf8Compare(left.action, right.action));
}

async function assignReservations(client: PoolClient, input: SourcePreviewInput, plans: ResultPlan[]) {
  const receiptId = await reserve(client, "business_operation_receipts");
  for (const plan of plans) {
    plan.correlationUid = deterministicUuidV4(`${input.operation_uid}\ncorrelation\n${resultIdentity(plan)}`);
    plan.auditEventUid = deterministicUuidV4(`${input.operation_uid}\naudit-event\n${resultIdentity(plan)}`);
    plan.businessId = await reserve(client, plan.table);
  }
  for (const plan of plans) plan.auditId = await reserve(client, "accounting_audit_events");
  const results = plans.map((plan, index) => canonicalResult(plan, index + 1));
  const slots: JsonObject[] = [{ phase: 0, result_ordinal: 0, slot_kind: "operation_receipt", slot_kind_order: 0, qualified_table_name: "public.business_operation_receipts", local_ordinal: 1, reserved_id: receiptId }];
  for (let index = 0; index < plans.length; index += 1) {
    const resultOrdinal = index + 1; const plan = plans[index];
    slots.push({ phase: 1, result_ordinal: resultOrdinal, slot_kind: "business_row", slot_kind_order: 1, qualified_table_name: `public.${plan.table}`, local_ordinal: 1, reserved_id: plan.businessId! });
  }
  for (let index = 0; index < plans.length; index += 1) slots.push({ phase: 2, result_ordinal: index + 1, slot_kind: "audit_row", slot_kind_order: 2, qualified_table_name: "public.accounting_audit_events", local_ordinal: 1, reserved_id: plans[index].auditId! });
  return { receiptId, results, slots };
}

async function insertReceipt(client: PoolClient, input: SourcePreviewInput, actor: Actor, targetFingerprint: string, effectiveAt: string, receiptId: string, results: ReturnType<typeof canonicalResult>[], slots: JsonObject[], manifestSha256: string) {
  const payload = { command: "import_batch:preview", expected_results: results, inputs: { batch_uid: input.batch_uid, decision_set_uid: input.decision_set_uid, manifest_sha256: manifestSha256, source_code: input.source_code, source_fingerprint: input.source_fingerprint, source_revision_sha256: sha256(input.source_revision) }, reservation_slots: slots, schema_version: "business-operation-payload-v2" };
  const payloadSha = sha256(canonicalJson(payload)); const rootCorrelation = deterministicUuidV4(`${input.operation_uid}\nroot-correlation`);
  await client.query(`INSERT INTO public.business_operation_receipts (id,action,actor_name_snapshot,actor_scope,actor_target_user_id,actor_target_user_id_snapshot,actor_uid_snapshot,actor_user_id,actor_user_id_snapshot,authorization_version,canonical_payload,entity_type,operation_uid,payload_sha256,recorded_at,result_entity_keys,root_correlation_uid,target_fingerprint) OVERRIDING SYSTEM VALUE VALUES ($1,'preview',$2,'admin',NULL,NULL,$3::uuid,$4,$4,$5,$6::jsonb,'import_batch',$7::uuid,$8,$9::timestamptz,$10::jsonb,$11::uuid,$12)`, [receiptId, actor.name, actor.userUid, actor.userId, actor.authorizationVersion, canonicalJson(payload), input.operation_uid, payloadSha, effectiveAt, canonicalJson(results), rootCorrelation, targetFingerprint]);
  for (const result of results) await client.query("INSERT INTO public.business_operation_entities (operation_uid,ordinal,entity_type,entity_key,entity_action,action_correlation_uid) VALUES ($1::uuid,$2,$3,$4,$5,$6::uuid)", [input.operation_uid, result.ordinal, result.entity_type, result.entity_key, result.entity_action, result.action_correlation_uid]);
}

async function insertBusinessGraph(client: PoolClient, input: SourcePreviewInput, actor: Actor, releaseId: string, logicalSourceId: string, rows: RowPlan[], plans: ResultPlan[], batchManifest: CanonicalValue, batchManifestSha256: string, decisionManifest: JsonObject, decisionManifestSha256: string, manifestItems: ReturnType<typeof buildDecisionManifest>["items"], effectiveAt: string) {
  const byIdentity = new Map(plans.map((plan) => [resultIdentity(plan), plan]));
  const batchPlan = plans.find((plan) => plan.entityType === "import_batch")!; const batchId = batchPlan.businessId!;
  const warningCount = rows.filter((row) => row.input.issue_status === "warning").length;
  await client.query(`INSERT INTO public.accounting_import_batches (id,batch_uid,captured_timezone,coverage_from,coverage_through,error_count,preview_actor_at,preview_actor_authorization_version,preview_actor_correlation_uid,preview_actor_name_snapshot,preview_actor_scope,preview_actor_uid_snapshot,preview_actor_user_id,preview_manifest,preview_manifest_sha256,previewed_at,row_count,source_fingerprint,source_release_id,source_revision,status,warning_count) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,$3,$4::timestamptz,$5::timestamptz,0,$6::timestamptz,$7,$8::uuid,$9,'admin',$10::uuid,$11,$12::jsonb,$13,$6::timestamptz,$14,$15,$16,$17,'previewed',$18)`, [batchId, input.batch_uid, input.captured_timezone, input.coverage_from, input.coverage_through, effectiveAt, actor.authorizationVersion, batchPlan.correlationUid, actor.name, actor.userUid, actor.userId, canonicalJson(batchManifest), batchManifestSha256, rows.length, input.source_fingerprint, releaseId, input.source_revision, warningCount]);
  for (const row of rows) {
    if (row.coordinateNew) {
      const plan = plans.find((candidate) => candidate.entityType === "source_coordinate" && candidate.entityKey === `coordinate:${input.source_code}:${row.input.coordinate_key}`)!; row.coordinateId = plan.businessId;
      await client.query(`INSERT INTO public.accounting_import_coordinates (id,coordinate_key,coordinate_normalization_version,logical_source_id,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,$5::timestamptz,$6,$7::uuid,$8,'admin',$9::uuid,$10)`, [row.coordinateId, row.input.coordinate_key, row.input.coordinate_normalization_version, logicalSourceId, effectiveAt, actor.authorizationVersion, plan.correlationUid, actor.name, actor.userUid, actor.userId]);
    }
    if (row.rowVersionNew) {
      const entityKey = `source-row:${input.source_code}:${row.input.coordinate_key}:${row.contentDigest}`; const plan = plans.find((candidate) => candidate.entityType === "source_row" && candidate.entityKey === entityKey)!; row.rowVersionId = plan.businessId;
      await client.query(`INSERT INTO public.accounting_import_row_versions (id,batch_id,content_digest,coordinate_id,issue_status,normalization_version,normalized_payload,raw_payload,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,recorded_at,source_display_snapshot,supersedes_id,version) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::timestamptz,$10,$11::uuid,$12,'admin',$13::uuid,$14,$9::timestamptz,$15,$16,$17)`, [row.rowVersionId, batchId, row.contentDigest, row.coordinateId, row.input.issue_status, row.input.normalization_version, canonicalJson(row.input.normalized_payload), canonicalJson(row.input.raw_payload), effectiveAt, actor.authorizationVersion, plan.correlationUid, actor.name, actor.userUid, actor.userId, row.input.source_display_snapshot, row.supersedesId, row.version]);
    }
    const linkPlan = plans.find((candidate) => candidate.entityType === "source_batch_row" && candidate.entityKey === `batch-row:${input.batch_uid}:${row.ordinal}`)!; row.batchRowId = linkPlan.businessId;
    await client.query(`INSERT INTO public.accounting_import_batch_rows (id,batch_id,coordinate_id,ordinal,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,row_version_id) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,$5::timestamptz,$6,$7::uuid,$8,'admin',$9::uuid,$10,$11)`, [row.batchRowId, batchId, row.coordinateId, row.ordinal, effectiveAt, actor.authorizationVersion, linkPlan.correlationUid, actor.name, actor.userUid, actor.userId, row.rowVersionId]);
  }
  const setPlan = plans.find((plan) => plan.entityType === "source_decision_set")!; const setId = setPlan.businessId!;
  await client.query(`INSERT INTO public.source_decision_sets (id,batch_id,decision_set_uid,manifest,manifest_sha256,preview_actor_at,preview_actor_authorization_version,preview_actor_correlation_uid,preview_actor_name_snapshot,preview_actor_scope,preview_actor_uid_snapshot,preview_actor_user_id,status) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3::uuid,$4::jsonb,$5,$6::timestamptz,$7,$8::uuid,$9,'admin',$10::uuid,$11,'previewed')`, [setId, batchId, input.decision_set_uid, canonicalJson(decisionManifest), decisionManifestSha256, effectiveAt, actor.authorizationVersion, setPlan.correlationUid, actor.name, actor.userUid, actor.userId]);
  const rowByCoordinate = new Map(rows.map((row) => [row.input.coordinate_key, row]));
  for (const item of manifestItems) {
    const row = rowByCoordinate.get(item.coordinate_key)!; const itemPlan = plans.find((plan) => plan.entityType === "source_decision_item" && plan.entityKey === `decision-item:${input.decision_set_uid}:${item.ordinal}`)!;
    await client.query(`INSERT INTO public.source_decision_items (id,coordinate_id,decision_kind,decision_payload,decision_payload_sha256,decision_set_id,ordinal,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,source_row_version_id) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8::timestamptz,$9,$10::uuid,$11,'admin',$12::uuid,$13,$14)`, [itemPlan.businessId, row.coordinateId, item.decision_kind, canonicalJson(item.decision_payload), item.decision_payload_sha256, setId, item.ordinal, effectiveAt, actor.authorizationVersion, itemPlan.correlationUid, actor.name, actor.userUid, actor.userId, row.rowVersionId]);
  }
  if (byIdentity.size !== plans.length) fail("source_preview_result_identity_collision");
}

async function insertAudits(client: PoolClient, actor: Actor, plans: ResultPlan[], effectiveAt: string) {
  for (const plan of plans) await client.query(`INSERT INTO public.accounting_audit_events (id,event_uid,entity_type,entity_key,action,before_json,after_json,effective_at,recorded_at,reason_code,actor_user_id,actor_uid_snapshot,actor_name_snapshot,actor_scope,actor_at,correlation_uid,actor_authorization_version) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,$3,$4,$5,NULL,$6::jsonb,$7::timestamptz,$7::timestamptz,$8,$9,$10::uuid,$11,'admin',$7::timestamptz,$12::uuid,$13)`, [plan.auditId, plan.auditEventUid, plan.entityType, plan.entityKey, plan.action, canonicalJson(plan.after), effectiveAt, `audit/${plan.entityType}/${plan.action}`, actor.userId, actor.userUid, actor.name, plan.correlationUid, actor.authorizationVersion]);
}

async function downstreamBusinessCount(client: PoolClient): Promise<number> {
  const result = await client.query<{ count: number }>("SELECT ((SELECT count(*) FROM public.source_row_classification_decisions)+(SELECT count(*) FROM public.member_match_cases)+(SELECT count(*) FROM public.member_match_candidates)+(SELECT count(*) FROM public.member_position_assignments)+(SELECT count(*) FROM public.economic_events)+(SELECT count(*) FROM public.dues_receipts)+(SELECT count(*) FROM public.dues_allocations))::int count");
  return result.rows[0].count;
}

async function preview(pool: Pool, targetFingerprint: string, input: SourcePreviewInput) {
  const descriptor = descriptorFor(input); const batchManifest = batchPreviewManifest(input.rows); const batchManifestSha256 = sha256(canonicalJson(batchManifest)); const manifestBuilt = buildDecisionManifest(input); const manifest = manifestBuilt.manifest as unknown as JsonObject;
  const actorReceipt = readJson(ACTOR_RECEIPT) as JsonObject; const candidateUserId = Number(actorReceipt.candidate_user_id);
  if (!Number.isSafeInteger(candidateUserId) || candidateUserId <= 0) fail("source_preview_actor_receipt_invalid");
  const actor = await verifyActorReceipt(pool, ACTOR_RECEIPT, { kind: "development", targetFingerprint, candidateUserId }); const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    const locked = await client.query("SELECT 1 FROM public.users WHERE id=$1 AND user_uid=$2::uuid AND is_admin=true FOR UPDATE", [actor.userId, actor.userUid]); if (locked.rowCount !== 1) fail("blocked_actor");
    const release = await client.query<{ release_id: string; release_uid: string; logical_source_id: string; source_uid: string; adapter_code: string; mapping_table_sha256: string; mapping_approval_receipt_sha256: string; normalized_schema_sha256: string; normalization_implementation_sha256: string }>(`SELECT r.id::text release_id,r.release_uid::text,r.logical_source_id::text,s.source_uid::text,r.adapter_code,r.mapping_table_sha256,r.mapping_approval_receipt_sha256,r.normalized_schema_sha256,r.normalization_implementation_sha256 FROM public.accounting_source_releases r JOIN public.accounting_logical_sources s ON s.id=r.logical_source_id WHERE s.source_code=$1 AND r.adapter_version='2.0.0' AND r.status='active' FOR UPDATE OF r,s`, [input.source_code]);
    if (release.rowCount !== 1) fail("source_preview_exact_v2_release_missing"); const releaseRow = release.rows[0];
    if (releaseRow.release_uid !== input.release_uid || releaseRow.source_uid !== input.source_uid) fail("source_preview_source_release_uid_drift");
    for (const key of ["adapter_code", "mapping_table_sha256", "mapping_approval_receipt_sha256", "normalized_schema_sha256", "normalization_implementation_sha256"] as const) if (releaseRow[key] !== descriptor[key]) fail(`source_preview_release_descriptor_drift:${key}`);
    if (await verifyNoop(client, input, releaseRow.release_id, batchManifest, batchManifestSha256, manifest, manifestBuilt.manifestSha256)) { await client.query("COMMIT"); return { outcome: "verified_noop", rowCount: input.rows.length, itemCount: manifestBuilt.items.length, manifestSha256: manifestBuilt.manifestSha256 }; }
    const uidCollision = await client.query<{ count: number }>("SELECT ((SELECT count(*) FROM public.business_operation_receipts WHERE operation_uid=$1::uuid)+(SELECT count(*) FROM public.accounting_import_batches WHERE batch_uid=$2::uuid)+(SELECT count(*) FROM public.source_decision_sets WHERE decision_set_uid=$3::uuid))::int count", [input.operation_uid, input.batch_uid, input.decision_set_uid]); if (uidCollision.rows[0].count !== 0) fail("source_preview_uid_collision");
    const downstreamBefore = await downstreamBusinessCount(client); const rows = await resolveRows(client, input, releaseRow.logical_source_id); const plans = buildResultPlans(input, rows, manifestBuilt.items); const effectiveAt = new Date().toISOString();
    const reservations = await assignReservations(client, input, plans); await insertReceipt(client, input, actor, targetFingerprint, effectiveAt, reservations.receiptId, reservations.results, reservations.slots, manifestBuilt.manifestSha256);
    await insertBusinessGraph(client, input, actor, releaseRow.release_id, releaseRow.logical_source_id, rows, plans, batchManifest, batchManifestSha256, manifest, manifestBuilt.manifestSha256, manifestBuilt.items, effectiveAt); await insertAudits(client, actor, plans, effectiveAt);
    if (await downstreamBusinessCount(client) !== downstreamBefore) fail("source_preview_downstream_business_row_detected");
    await client.query("COMMIT"); return { outcome: "created", rowCount: rows.length, itemCount: manifestBuilt.items.length, manifestSha256: manifestBuilt.manifestSha256 };
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}

async function main() {
  if (arg("--target") !== "development" || arg("--actor-receipt") !== ACTOR_RECEIPT) fail("source_preview_command_scope_mismatch");
  const inputPath = arg("--input"); if (!(inputPath.startsWith("/tmp/") || inputPath.startsWith("/private/tmp/"))) fail("source_preview_input_must_be_ephemeral");
  const input = validateSourcePreviewInput(readJson(inputPath)); if (!UUID_V4.test(input.operation_uid)) fail("source_preview_operation_uid_invalid");
  const resolved = resolveDevelopmentTarget(process.env, "migration"); const pool = createTargetPool(resolved);
  try { const target = await verifyDevelopmentTarget(pool, resolved); const result = await preview(pool, target.targetFingerprint, input); console.log(JSON.stringify({ schema_version: "accounting-source-preview-result-v2", target: "development", source_code: input.source_code, batch_uid: input.batch_uid, decision_set_uid: input.decision_set_uid, source_fingerprint: input.source_fingerprint, manifest_sha256: result.manifestSha256, row_count: result.rowCount, decision_item_count: result.itemCount, downstream_business_rows_created: 0, outcome: result.outcome, result: "verified" })); } finally { await shutdownPool(pool); }
}
main().catch((error) => { console.error(JSON.stringify({ schema_version: "accounting-source-preview-error-v2", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
