import type { PoolClient } from "pg";
import { normalizeLegacyPaymentV3 } from "./adapters/legacy-payments-v3";
import type { FrozenLegacyPayment } from "./legacy-payment-contract";
import { batchPreviewManifest, sourceFingerprint, type SourcePreviewInput, type SourcePreviewRow } from "./source-preview-contract-v2";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";

export type LegacyPaymentPreviewRow = {
  paymentId: number;
  sourceRow: SourcePreviewRow;
  frozenRow: FrozenLegacyPayment;
};

function fail(code: string): never { throw new Error(code); }

export function buildLegacyPaymentPreviewRows(rows: Array<{
  id: number;
  user_id: number | null;
  amount_raw: string;
  year: number;
  type: string;
  status: string;
  created_at_local: string | null;
  has_open_data_exception: boolean;
}>): LegacyPaymentPreviewRow[] {
  const sorted = [...rows].sort((left, right) => left.id - right.id);
  if (new Set(sorted.map((row) => row.id)).size !== sorted.length) fail("legacy_preview_duplicate_payment");
  return sorted.map((row) => {
    const normalized = normalizeLegacyPaymentV3({
      paymentId: row.id,
      userId: row.user_id,
      amountRaw: row.amount_raw,
      year: row.year,
      type: row.type,
      status: row.status,
      createdAt: row.created_at_local,
      sourceTimezone: "Asia/Seoul",
    });
    const payload = normalized.envelope.normalized_payload;
    const sourceRow: SourcePreviewRow = {
      coordinate_key: normalized.envelope.coordinate_key,
      coordinate_normalization_version: "coordinate-v1",
      issue_status: "accepted",
      normalization_version: "legacy-payments-v3@3.0.0",
      normalized_payload: payload,
      raw_payload: payload,
      source_display_snapshot: `payments:${row.id}`,
      decisions: [],
    };
    return {
      paymentId: row.id,
      sourceRow,
      frozenRow: {
        paymentId: row.id,
        sourceContentDigest: normalized.contentDigest,
        userId: row.user_id,
        amountParse: {
          status: payload.amount_parse.status,
          rawDigest: payload.amount_parse.raw_digest,
          sourceAmountSignedOrNull: payload.amount_parse.source_amount_signed_or_null,
        },
        year: row.year,
        type: payload.type,
        status: payload.status,
        createdAt: row.created_at_local,
        hasOpenDataException: row.has_open_data_exception,
      },
    };
  });
}

export function buildLegacyPaymentPreviewIdentity(input: {
  sourceUid: string;
  releaseUid: string;
  sourceRevision: string;
  coverageFrom: string;
  coverageThrough: string;
  rows: LegacyPaymentPreviewRow[];
}) {
  const projection: Pick<SourcePreviewInput, "source_uid" | "release_uid" | "source_revision" | "captured_timezone" | "coverage_from" | "coverage_through" | "rows"> = {
    source_uid: input.sourceUid,
    release_uid: input.releaseUid,
    source_revision: input.sourceRevision,
    captured_timezone: "Asia/Seoul",
    coverage_from: input.coverageFrom,
    coverage_through: input.coverageThrough,
    rows: input.rows.map((row) => row.sourceRow),
  };
  const previewManifest = batchPreviewManifest(projection.rows);
  return {
    sourceFingerprint: sourceFingerprint(projection),
    previewManifest,
    previewManifestSha256: sha256(canonicalJson(previewManifest as unknown as CanonicalValue)),
  };
}

export async function readLockedLegacyPayments(client: Pick<PoolClient, "query">): Promise<LegacyPaymentPreviewRow[]> {
  const result = await client.query<{
    id: number;
    user_id: number | null;
    amount_raw: string;
    year: number;
    type: string;
    status: string;
    created_at_local: string | null;
    has_open_data_exception: boolean;
  }>(`SELECT p.id,p.user_id,p.amount::text amount_raw,p.year,p.type,p.status,
      CASE WHEN p.created_at IS NULL THEN NULL ELSE to_char(p.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US')||'+09:00' END created_at_local,
      EXISTS (
        SELECT 1 FROM public.schema_data_exceptions e
        WHERE e.table_name='payments' AND e.row_key IN (p.id::text,'payments:'||p.id::text)
          AND e.status='open' AND NOT EXISTS (SELECT 1 FROM public.schema_data_exceptions child WHERE child.supersedes_id=e.id)
      ) has_open_data_exception
    FROM public.payments p ORDER BY p.id FOR UPDATE OF p`);
  return buildLegacyPaymentPreviewRows(result.rows);
}
