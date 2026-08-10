import { readFileSync } from "node:fs";
import type { PoolClient } from "pg";
import { createTargetPool, resolveDevelopmentTarget, shutdownPool, verifyDevelopmentTarget } from "../server/db-target";
import { batchPreviewManifest, buildDecisionManifest, contentDigest, validateSourcePreviewInput } from "../server/accounting/source-preview-contract-v2";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";

function fail(code: string): never { throw new Error(code); }
function arg(name: string): string { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) fail(`missing_argument:${name}`); return process.argv[index + 1]; }
function same(left: CanonicalValue, right: CanonicalValue): boolean { return canonicalJson(left) === canonicalJson(right); }

async function verify(client: PoolClient, inputPath: string) {
  const input = validateSourcePreviewInput(JSON.parse(readFileSync(inputPath, "utf8")));
  const expectedBatchManifest = batchPreviewManifest(input.rows);
  const expectedBatchManifestSha = sha256(canonicalJson(expectedBatchManifest));
  const expectedDecision = buildDecisionManifest(input);
  const release = await client.query<{ release_id: string; source_id: string }>(`
    SELECT r.id::text release_id,s.id::text source_id
    FROM public.accounting_source_releases r
    JOIN public.accounting_logical_sources s ON s.id=r.logical_source_id
    WHERE s.source_code=$1 AND s.source_uid=$2::uuid AND r.release_uid=$3::uuid
      AND r.adapter_version='2.0.0' AND r.status='active'
  `, [input.source_code, input.source_uid, input.release_uid]);
  if (release.rowCount !== 1) fail("policy_preview_release_binding_mismatch");

  const batch = await client.query<{ id: string; batch_uid: string; preview_manifest: CanonicalValue; preview_manifest_sha256: string; row_count: number; warning_count: number; error_count: number; status: string }>(`
    SELECT id::text,batch_uid::text,preview_manifest,preview_manifest_sha256,row_count,warning_count,error_count,status
    FROM public.accounting_import_batches
    WHERE source_release_id=$1 AND source_fingerprint=$2
  `, [release.rows[0].release_id, input.source_fingerprint]);
  if (batch.rowCount !== 1) fail("policy_preview_batch_missing");
  const batchRow = batch.rows[0];
  const expectedWarningCount = input.rows.filter((row) => row.issue_status === "warning").length;
  if (batchRow.batch_uid !== input.batch_uid || batchRow.preview_manifest_sha256 !== expectedBatchManifestSha || !same(batchRow.preview_manifest, expectedBatchManifest) || batchRow.row_count !== input.rows.length || batchRow.warning_count !== expectedWarningCount || batchRow.error_count !== 0 || batchRow.status !== "previewed") fail("policy_preview_batch_mismatch");

  const graph = await client.query<{ ordinal: number; coordinate_key: string; coordinate_normalization_version: string; content_digest: string; issue_status: string; normalization_version: string; normalized_payload: CanonicalValue; raw_payload: CanonicalValue; source_display_snapshot: string }>(`
    SELECT br.ordinal,c.coordinate_key,c.coordinate_normalization_version,rv.content_digest,rv.issue_status,
           rv.normalization_version,rv.normalized_payload,rv.raw_payload,rv.source_display_snapshot
    FROM public.accounting_import_batch_rows br
    JOIN public.accounting_import_coordinates c ON c.id=br.coordinate_id
    JOIN public.accounting_import_row_versions rv ON rv.id=br.row_version_id
    WHERE br.batch_id=$1 ORDER BY br.ordinal
  `, [batchRow.id]);
  const expectedRows = [...input.rows].sort((left, right) => Buffer.compare(Buffer.from(left.coordinate_key), Buffer.from(right.coordinate_key)));
  if (graph.rowCount !== expectedRows.length) fail("policy_preview_row_count_mismatch");
  for (let index = 0; index < expectedRows.length; index += 1) {
    const expected = expectedRows[index]; const actual = graph.rows[index];
    if (actual.ordinal !== index + 1 || actual.coordinate_key !== expected.coordinate_key || actual.coordinate_normalization_version !== expected.coordinate_normalization_version || actual.content_digest !== contentDigest(expected.normalized_payload) || actual.issue_status !== expected.issue_status || actual.normalization_version !== expected.normalization_version || actual.source_display_snapshot !== expected.source_display_snapshot || !same(actual.normalized_payload, expected.normalized_payload) || !same(actual.raw_payload, expected.raw_payload)) fail("policy_preview_row_graph_mismatch");
  }

  const decisionSet = await client.query<{ decision_set_uid: string; manifest: CanonicalValue; manifest_sha256: string; status: string }>("SELECT decision_set_uid::text,manifest,manifest_sha256,status FROM public.source_decision_sets WHERE batch_id=$1", [batchRow.id]);
  if (decisionSet.rowCount !== 1 || decisionSet.rows[0].decision_set_uid !== input.decision_set_uid || decisionSet.rows[0].manifest_sha256 !== expectedDecision.manifestSha256 || !same(decisionSet.rows[0].manifest, expectedDecision.manifest) || decisionSet.rows[0].status !== "previewed") fail("policy_preview_decision_set_mismatch");

  const counts = await client.query<{ decision_items: number; operation_receipts: number; result_entities: number; audits: number; source_coordinates: number; source_versions: number; downstream_rows: number; linked_policy_rows: number }>(`
    SELECT
      (SELECT count(*)::int FROM public.source_decision_items WHERE decision_set_id=(SELECT id FROM public.source_decision_sets WHERE batch_id=$1)) decision_items,
      (SELECT count(*)::int FROM public.business_operation_receipts WHERE operation_uid=$2::uuid AND canonical_payload->>'command'='import_batch:preview') operation_receipts,
      (SELECT count(*)::int FROM public.business_operation_entities WHERE operation_uid=$2::uuid) result_entities,
      (SELECT count(*)::int FROM public.accounting_audit_events a JOIN public.business_operation_entities e ON e.action_correlation_uid=a.correlation_uid WHERE e.operation_uid=$2::uuid) audits,
      (SELECT count(*)::int FROM public.accounting_import_coordinates WHERE logical_source_id=$3) source_coordinates,
      (SELECT count(*)::int FROM public.accounting_import_row_versions rv JOIN public.accounting_import_coordinates c ON c.id=rv.coordinate_id WHERE c.logical_source_id=$3) source_versions,
      ((SELECT count(*) FROM public.source_row_classification_decisions)+(SELECT count(*) FROM public.member_match_cases)+(SELECT count(*) FROM public.member_match_candidates)+(SELECT count(*) FROM public.member_position_assignments)+(SELECT count(*) FROM public.economic_events)+(SELECT count(*) FROM public.dues_receipts)+(SELECT count(*) FROM public.dues_allocations))::int downstream_rows,
      ((SELECT count(*) FROM public.dues_policies WHERE source_row_version_id IS NOT NULL)+(SELECT count(*) FROM public.dues_position_tier_mappings WHERE source_row_version_id IS NOT NULL)+(SELECT count(*) FROM public.member_dues_tier_history))::int linked_policy_rows
  `, [batchRow.id, input.operation_uid, release.rows[0].source_id]);
  const c = counts.rows[0];
  const expectedResultCount = 2 + input.rows.length * 3;
  if (c.decision_items !== 0 || c.operation_receipts !== 1 || c.result_entities !== expectedResultCount || c.audits !== expectedResultCount || c.source_coordinates !== input.rows.length || c.source_versions !== input.rows.length || c.downstream_rows !== 0 || c.linked_policy_rows !== 0) fail("policy_preview_persistence_count_mismatch");

  const receipt = await client.query<{ canonical_payload: CanonicalValue; payload_sha256: string }>("SELECT canonical_payload,payload_sha256 FROM public.business_operation_receipts WHERE operation_uid=$1::uuid", [input.operation_uid]);
  if (receipt.rowCount !== 1 || receipt.rows[0].payload_sha256 !== sha256(canonicalJson(receipt.rows[0].canonical_payload)) || canonicalJson(receipt.rows[0].canonical_payload).includes("회비수입")) fail("policy_preview_receipt_mismatch");
  return { batchManifestSha256: expectedBatchManifestSha, decisionManifestSha256: expectedDecision.manifestSha256, counts: c, sourceFingerprint: input.source_fingerprint };
}

async function main() {
  if (arg("--target") !== "development") fail("policy_preview_verifier_scope_mismatch");
  const inputPath = arg("--input"); if (!(inputPath.startsWith("/tmp/") || inputPath.startsWith("/private/tmp/"))) fail("policy_preview_verifier_input_must_be_ephemeral");
  const resolved = resolveDevelopmentTarget(process.env, "migration"); const pool = createTargetPool(resolved);
  try {
    const target = await verifyDevelopmentTarget(pool, resolved); const client = await pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"); const result = await verify(client, inputPath); await client.query("ROLLBACK");
      console.log(JSON.stringify({ schema_version: "policy-source-preview-verification-v2", target: "development", target_fingerprint: target.targetFingerprint, source_fingerprint: result.sourceFingerprint, batch_manifest_sha256: result.batchManifestSha256, decision_manifest_sha256: result.decisionManifestSha256, row_count: result.counts.source_versions, decision_item_count: result.counts.decision_items, operation_receipt_count: result.counts.operation_receipts, result_entity_count: result.counts.result_entities, audit_count: result.counts.audits, downstream_business_row_count: result.counts.downstream_rows, linked_policy_row_count: result.counts.linked_policy_rows, terminal_transaction: "ROLLBACK", result: "verified" }));
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  } finally { await shutdownPool(pool); }
}
main().catch((error) => { console.error(JSON.stringify({ schema_version: "ledger-dues-policy-preview-verification-error-v2", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
