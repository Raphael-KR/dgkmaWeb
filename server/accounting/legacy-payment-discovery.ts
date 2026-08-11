import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { firstLegacyIneligibility, legacyCandidateLockKeys, type LegacyDecisionEvidence } from "./legacy-payment-contract";
import { assertLegacyMaterializationReady, buildLegacyMaterializationRows, type LegacyMaterializationRow } from "./legacy-payment-materialization";
import type { LegacyPaymentPreviewRow } from "./legacy-payment-preview";
import { canonicalJson, type CanonicalValue } from "./source-contracts";

export type ResolvedLegacyMaterializationRow = LegacyMaterializationRow & {
  coordinateId: string;
  rowVersionId: string;
  memberId: string | null;
  candidateEventId: string | null;
  candidateKey: string | null;
  createdEventUid: string | null;
  categoryId: string | null;
  categoryLabel: string | null;
  periodId: string | null;
};

function fail(code: string): never { throw new Error(code); }

export async function discoverLegacyMaterializationRows(
  client: Pick<PoolClient, "query">,
  batchId: string,
  previewRows: LegacyPaymentPreviewRow[],
): Promise<ResolvedLegacyMaterializationRow[]> {
  const persisted = await client.query<{ ordinal: number; coordinate_id: string; row_version_id: string; content_digest: string; normalized_payload: CanonicalValue }>(`
    SELECT br.ordinal,br.coordinate_id::text,br.row_version_id::text,rv.content_digest,rv.normalized_payload
    FROM public.accounting_import_batch_rows br
    JOIN public.accounting_import_row_versions rv ON rv.id=br.row_version_id
    WHERE br.batch_id=$1 ORDER BY br.ordinal FOR UPDATE OF br,rv
  `, [batchId]);
  if (persisted.rowCount !== previewRows.length) fail("legacy_materialization_preview_coverage_mismatch");

  const resolved: ResolvedLegacyMaterializationRow[] = [];
  for (let index = 0; index < previewRows.length; index += 1) {
    const preview = previewRows[index]; const frozen = preview.frozenRow; const stored = persisted.rows[index];
    if (stored.ordinal !== index + 1 || stored.content_digest !== frozen.sourceContentDigest || canonicalJson(stored.normalized_payload) !== canonicalJson(preview.sourceRow.normalized_payload)) fail("legacy_materialization_frozen_row_drift");
    let evidence: LegacyDecisionEvidence = { timezoneSnapshot: "Asia/Seoul", memberUid: null, candidateEventUids: [], uniqueCandidateHasExactApprovedDuesTopology: false };
    let memberId: string | null = null; let candidateEventId: string | null = null; let candidateKey: string | null = null; let createdEventUid: string | null = null; let categoryId: string | null = null; let categoryLabel: string | null = null; let periodId: string | null = null;
    if (firstLegacyIneligibility(frozen) === null) {
      const members = await client.query<{ id: string; member_uid: string }>("SELECT id::text,member_uid::text FROM public.association_members WHERE user_id=$1 AND status='active' ORDER BY member_uid FOR UPDATE", [frozen.userId]);
      if (members.rowCount === 1) {
        memberId = members.rows[0].id;
        const memberUid = members.rows[0].member_uid;
        const amount = frozen.amountParse.sourceAmountSignedOrNull!;
        const occurredKstDate = frozen.createdAt!.slice(0, 10);
        const candidateKeys = legacyCandidateLockKeys({ memberUid, duesYear: frozen.year!, amount, occurredKstDate });
        for (const key of candidateKeys) await client.query("SELECT pg_advisory_xact_lock(('x'||substr($1,1,16))::bit(64)::bigint)", [key.advisoryKey]);
        const candidates = await client.query<{ id: string; event_uid: string; candidate_key: string; exact_topology: boolean }>(`
          SELECT e.id::text,e.event_uid::text,c.candidate_key,
            (e.status='approved' AND e.direction='credit' AND e.amount=$2::bigint AND e.dues_year=$3
             AND (SELECT count(*) FROM public.dues_receipts r WHERE r.event_id=e.id AND r.status='approved')=1
             AND COALESCE((SELECT sum(a.amount) FROM public.dues_allocations a JOIN public.dues_receipts r ON r.id=a.receipt_id WHERE r.event_id=e.id AND a.status='approved' AND a.member_id=$4 AND a.dues_year=$3),0)=$2::bigint) exact_topology
          FROM public.economic_event_claims c
          JOIN public.economic_events e ON e.id=c.event_id
          WHERE c.candidate_key=ANY($1::char(64)[]) AND c.state='bound'
            AND NOT EXISTS (SELECT 1 FROM public.economic_event_claims child WHERE child.supersedes_id=c.id)
          ORDER BY e.event_uid FOR UPDATE OF c,e
        `, [candidateKeys.map((key) => key.candidateKey), amount, frozen.year, memberId]);
        const unique = [...new Map(candidates.rows.map((candidate) => [candidate.event_uid, candidate])).values()];
        evidence = { timezoneSnapshot: "Asia/Seoul", memberUid, candidateEventUids: unique.map((candidate) => candidate.event_uid), uniqueCandidateHasExactApprovedDuesTopology: unique.length === 1 && unique[0].exact_topology };
        if (unique.length === 1) { candidateEventId = unique[0].id; candidateKey = unique[0].candidate_key; }
        if (unique.length === 0) {
          createdEventUid = randomUUID();
          candidateKey = candidateKeys.find((key) => key.occurredKstDate === occurredKstDate)?.candidateKey ?? fail("legacy_materialization_same_day_candidate_missing");
          const category = await client.query<{ id: string; label: string }>(`SELECT c.id::text,c.display_name label FROM public.accounting_categories c WHERE c.category_code='DUES_INCOME' AND c.status='approved' AND NOT EXISTS (SELECT 1 FROM public.accounting_categories child WHERE child.supersedes_id=c.id) FOR UPDATE`);
          if (category.rowCount !== 1) fail("legacy_materialization_dues_category_missing");
          categoryId = category.rows[0].id; categoryLabel = category.rows[0].label;
          const period = await client.query<{ id: string }>(`SELECT id::text FROM public.accounting_periods WHERE starts_at <= $1::timestamptz AND (ends_at IS NULL OR $1::timestamptz < ends_at) AND status IN ('open','reconciliation') ORDER BY starts_at DESC FOR UPDATE`, [frozen.createdAt]);
          if (period.rowCount !== 1) fail("legacy_materialization_period_missing");
          periodId = period.rows[0].id;
        }
      }
    }
    const materialization = buildLegacyMaterializationRows([{ row: frozen, evidence, createdEventUid }])[0];
    resolved.push({ ...materialization, coordinateId: stored.coordinate_id, rowVersionId: stored.row_version_id, memberId, candidateEventId, candidateKey, createdEventUid, categoryId, categoryLabel, periodId });
  }
  for (let index = 0, ordinal = 1; index < resolved.length; index += 1) for (const step of resolved[index].steps) step.ordinal = ordinal++;
  assertLegacyMaterializationReady(resolved);
  return resolved;
}
