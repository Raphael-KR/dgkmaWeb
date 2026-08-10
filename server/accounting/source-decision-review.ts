import type { Pool } from "pg";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";
import { ACTIVE_V2_SOURCES, reviewDisplay, type ActiveV2Source } from "./source-preview-contract-v2";

export type SourceDecisionReview = {
  schemaVersion: "source-decision-review-v2";
  decisionSetUid: string;
  batchUid: string;
  manifestSha256: string;
  sourceFingerprint: string;
  status: "previewed" | "approved" | "rejected" | "superseded";
  items: Array<{ ordinal: number; coordinateKey: string; sourceContentDigest: string; reviewDisplay: Record<string, CanonicalValue>; decisionKind: string; decisionPayload: Record<string, CanonicalValue>; decisionPayloadSha256: string }>;
};

function fail(code: string): never { throw new Error(code); }
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function readSourceDecisionReview(pool: Pick<Pool, "connect">, decisionSetUid: string): Promise<SourceDecisionReview | undefined> {
  if (!UUID_V4.test(decisionSetUid)) fail("source_decision_review_uid_invalid");
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const set = await client.query<{ id: string; decision_set_uid: string; batch_uid: string; manifest: CanonicalValue; manifest_sha256: string; source_fingerprint: string; status: SourceDecisionReview["status"]; source_code: string }>(`
      SELECT ds.id::text,ds.decision_set_uid::text,b.batch_uid::text,ds.manifest,ds.manifest_sha256,b.source_fingerprint,ds.status,s.source_code
      FROM public.source_decision_sets ds
      JOIN public.accounting_import_batches b ON b.id=ds.batch_id
      JOIN public.accounting_source_releases r ON r.id=b.source_release_id
      JOIN public.accounting_logical_sources s ON s.id=r.logical_source_id
      WHERE ds.decision_set_uid=$1::uuid
    `, [decisionSetUid]);
    if (set.rowCount === 0) { await client.query("ROLLBACK"); return undefined; }
    if (set.rowCount !== 1 || !ACTIVE_V2_SOURCES.includes(set.rows[0].source_code as ActiveV2Source)) fail("source_decision_review_set_invalid");
    const sourceCode = set.rows[0].source_code as ActiveV2Source;
    const itemRows = await client.query<{ ordinal: number; coordinate_key: string; content_digest: string; normalized_payload: Record<string, CanonicalValue>; decision_kind: string; decision_payload: Record<string, CanonicalValue>; decision_payload_sha256: string }>(`
      SELECT i.ordinal,c.coordinate_key,rv.content_digest,rv.normalized_payload,i.decision_kind,i.decision_payload,i.decision_payload_sha256
      FROM public.source_decision_items i
      JOIN public.accounting_import_coordinates c ON c.id=i.coordinate_id
      JOIN public.accounting_import_row_versions rv ON rv.id=i.source_row_version_id
      WHERE i.decision_set_id=$1 ORDER BY i.ordinal
    `, [set.rows[0].id]);
    const items = itemRows.rows.map((row, index) => {
      if (row.ordinal !== index + 1 || row.decision_payload_sha256 !== sha256(canonicalJson(row.decision_payload))) fail("source_decision_review_item_drift");
      return { ordinal: row.ordinal, coordinateKey: row.coordinate_key, sourceContentDigest: row.content_digest, reviewDisplay: reviewDisplay(sourceCode, row.normalized_payload), decisionKind: row.decision_kind, decisionPayload: row.decision_payload, decisionPayloadSha256: row.decision_payload_sha256 };
    });
    const expectedManifest = { schema_version: "source-decision-preview-v1", batch_uid: set.rows[0].batch_uid, source_fingerprint: set.rows[0].source_fingerprint, items: items.map((item) => ({ ordinal: item.ordinal, coordinate_key: item.coordinateKey, source_content_digest: item.sourceContentDigest, decision_kind: item.decisionKind, decision_payload_sha256: item.decisionPayloadSha256 })) };
    if (set.rows[0].manifest_sha256 !== sha256(canonicalJson(expectedManifest)) || canonicalJson(set.rows[0].manifest) !== canonicalJson(expectedManifest)) fail("source_decision_review_manifest_drift");
    const result: SourceDecisionReview = { schemaVersion: "source-decision-review-v2", decisionSetUid: set.rows[0].decision_set_uid, batchUid: set.rows[0].batch_uid, manifestSha256: set.rows[0].manifest_sha256, sourceFingerprint: set.rows[0].source_fingerprint, status: set.rows[0].status, items };
    await client.query("ROLLBACK"); return result;
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}
