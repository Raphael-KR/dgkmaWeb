import { lstatSync, readFileSync } from "node:fs";
import type { Pool } from "pg";
import { canonicalJson, readManifest, sha256 } from "./schema-ledger";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RFC3339_UTC_MILLISECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const THROUGH_40_SEQUENCES = [1, 10, 15, 20, 30, 40] as const;

export type ActorReceiptRoute =
  | { kind: "development"; targetFingerprint: string; candidateUserId: number }
  | {
      kind: "disposable-test";
      targetFingerprint: string;
      candidateUserId?: number;
      disposableRunUid: string;
      parentTargetFingerprint: string;
    };

export type LedgerProjectionRow = {
  sequence_no: number;
  artifact_id: string;
  artifact_sha256: string;
  manifest_sha256: string;
  artifact_release_uid: string;
  artifact_release_state: "verified" | "failed";
  capability_receipt_sha256: string;
  target_fingerprint: string;
};

export type StrictActorReceipt = {
  schema_version: "dgkma-development-admin-v1" | "dgkma-disposable-admin-v1";
  target_fingerprint: string;
  candidate_user_id: number;
  candidate_user_uid: string;
  is_admin: true;
  authorization_version: string;
  through_40_release_uid: string;
  observed_ledger_sha256: string;
  observed_at: string;
  receipt_sha256: string;
  disposable_run_uid?: string;
  parent_target_fingerprint?: string;
};

export type VerifiedActor = {
  userId: number;
  userUid: string;
  name: string;
  authorizationVersion: string;
};

function fail(code: string): never {
  throw new Error(code);
}

function exactKeys(object: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(object).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) {
    fail("actor_receipt_key_mismatch");
  }
}

function authorizationProjection(
  route: ActorReceiptRoute,
  candidateUserId: number,
  candidateUserUid: string,
  through40ReleaseUid: string,
  observedLedgerSha256: string,
): Record<string, Json> {
  const base: Record<string, Json> = {
    authorization_version: "dgkma-migration-admin-v1",
    target_fingerprint: route.targetFingerprint,
    candidate_user_id: candidateUserId,
    candidate_user_uid: candidateUserUid,
    is_admin: true,
    through_40_release_uid: through40ReleaseUid,
    observed_ledger_sha256: observedLedgerSha256,
  };
  if (route.kind === "disposable-test") {
    base.disposable_run_uid = route.disposableRunUid;
    base.parent_target_fingerprint = route.parentTargetFingerprint;
  }
  return base;
}

export function actorAuthorizationVersion(
  route: ActorReceiptRoute,
  candidateUserId: number,
  candidateUserUid: string,
  through40ReleaseUid: string,
  observedLedgerSha256: string,
): string {
  return sha256(canonicalJson(authorizationProjection(
    route,
    candidateUserId,
    candidateUserUid,
    through40ReleaseUid,
    observedLedgerSha256,
  ) as Json));
}

export async function observeLedgerThrough40(
  pool: Pool,
  targetFingerprint: string,
): Promise<{ coveringReleaseUid: string; rows: LedgerProjectionRow[]; digest: string }> {
  const manifest = readManifest();
  const lineage = manifest.value.manifest_lineage as { parent_manifest_sha256?: unknown } | undefined;
  if (typeof lineage?.parent_manifest_sha256 !== "string" || !SHA256.test(lineage.parent_manifest_sha256)) fail("actor_receipt_manifest_lineage_mismatch");
  const through40ManifestSha = lineage.parent_manifest_sha256;
  const covering = await pool.query<{ release_uid: string }>(`
    SELECT release_uid::text
    FROM public.schema_release_runs
    WHERE target_fingerprint=$1 AND manifest_sha256=$2
      AND requested_through_sequence_no=40 AND state='verified'
    ORDER BY started_at DESC, id DESC
    LIMIT 1
  `, [targetFingerprint, through40ManifestSha]);
  if (covering.rowCount !== 1) fail("actor_receipt_verified_through_40_required");
  const coveringReleaseUid = covering.rows[0].release_uid;
  const ledger = await pool.query<LedgerProjectionRow>(`
    SELECT l.sequence_no,
           l.artifact_id,
           l.artifact_sha256,
           l.manifest_sha256,
           r.release_uid::text AS artifact_release_uid,
           r.state AS artifact_release_state,
           c.receipt_sha256 AS capability_receipt_sha256,
           l.target_fingerprint
    FROM public.schema_change_ledger l
    JOIN public.schema_release_runs r ON r.id=l.release_run_id
    JOIN public.schema_capability_receipts c ON c.id=l.capability_receipt_id
    WHERE l.target_fingerprint=$1 AND l.sequence_no = ANY($2::integer[])
    ORDER BY l.sequence_no
  `, [targetFingerprint, [...THROUGH_40_SEQUENCES]]);
  if (
    ledger.rows.length !== THROUGH_40_SEQUENCES.length ||
    ledger.rows.some((row, index) => row.sequence_no !== THROUGH_40_SEQUENCES[index])
  ) {
    fail("actor_receipt_ledger_sequence_mismatch");
  }
  for (const row of ledger.rows) {
    exactKeys(row as unknown as Record<string, unknown>, [
      "sequence_no", "artifact_id", "artifact_sha256", "manifest_sha256",
      "artifact_release_uid", "artifact_release_state", "capability_receipt_sha256", "target_fingerprint",
    ]);
    if (
      row.manifest_sha256 !== through40ManifestSha || row.target_fingerprint !== targetFingerprint ||
      !SHA256.test(row.artifact_sha256) || !SHA256.test(row.capability_receipt_sha256) ||
      !UUID.test(row.artifact_release_uid) || !["verified", "failed"].includes(row.artifact_release_state)
    ) {
      fail("actor_receipt_ledger_projection_mismatch");
    }
  }
  const digest = sha256(canonicalJson({
    digest_version: "development-ledger-through-40-v1",
    target_fingerprint: targetFingerprint,
    covering_release_uid: coveringReleaseUid,
    rows: ledger.rows,
  } as Json));
  return { coveringReleaseUid, rows: ledger.rows, digest };
}

export async function buildActorReceipt(
  pool: Pool,
  route: ActorReceiptRoute,
): Promise<StrictActorReceipt> {
  const userId = route.candidateUserId ?? fail("actor_receipt_candidate_user_required");
  const actor = await pool.query<{ id: number; user_uid: string; is_admin: boolean }>(`
    SELECT id,user_uid::text,is_admin FROM public.users WHERE id=$1
  `, [userId]);
  if (actor.rowCount !== 1 || actor.rows[0].is_admin !== true || !UUID.test(actor.rows[0].user_uid)) {
    fail("blocked_actor");
  }
  const observed = await observeLedgerThrough40(pool, route.targetFingerprint);
  const body: Omit<StrictActorReceipt, "receipt_sha256"> = {
    schema_version: route.kind === "development" ? "dgkma-development-admin-v1" : "dgkma-disposable-admin-v1",
    target_fingerprint: route.targetFingerprint,
    candidate_user_id: actor.rows[0].id,
    candidate_user_uid: actor.rows[0].user_uid,
    is_admin: true,
    authorization_version: actorAuthorizationVersion(
      route,
      actor.rows[0].id,
      actor.rows[0].user_uid,
      observed.coveringReleaseUid,
      observed.digest,
    ),
    through_40_release_uid: observed.coveringReleaseUid,
    observed_ledger_sha256: observed.digest,
    observed_at: new Date().toISOString(),
    ...(route.kind === "disposable-test" ? {
      disposable_run_uid: route.disposableRunUid,
      parent_target_fingerprint: route.parentTargetFingerprint,
    } : {}),
  };
  return { ...body, receipt_sha256: sha256(canonicalJson(body as unknown as Json)) };
}

export function serializeActorReceipt(receipt: StrictActorReceipt): string {
  return `${canonicalJson(receipt as unknown as Json)}\n`;
}

export async function verifyActorReceipt(
  pool: Pool,
  receiptPath: string,
  route: ActorReceiptRoute,
): Promise<VerifiedActor> {
  const stat = lstatSync(receiptPath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("actor_receipt_not_regular_file");
  const raw = readFileSync(receiptPath, "utf8");
  if (!raw.endsWith("\n") || raw.endsWith("\n\n") || raw.includes("\r")) fail("actor_receipt_byte_contract_mismatch");
  const receipt = JSON.parse(raw) as StrictActorReceipt;
  const routeKeys = route.kind === "development" ? [] : ["disposable_run_uid", "parent_target_fingerprint"];
  exactKeys(receipt as unknown as Record<string, unknown>, [
    "schema_version", "target_fingerprint", "candidate_user_id", "candidate_user_uid", "is_admin",
    "authorization_version", "through_40_release_uid", "observed_ledger_sha256", "observed_at",
    "receipt_sha256", ...routeKeys,
  ]);
  if (raw !== serializeActorReceipt(receipt)) fail("actor_receipt_not_canonical_json_lf");
  const withoutHash = { ...receipt } as Record<string, unknown>;
  delete withoutHash.receipt_sha256;
  if (receipt.receipt_sha256 !== sha256(canonicalJson(withoutHash as Json))) fail("actor_receipt_self_hash_mismatch");
  if (
    receipt.schema_version !== (route.kind === "development" ? "dgkma-development-admin-v1" : "dgkma-disposable-admin-v1") ||
    receipt.target_fingerprint !== route.targetFingerprint || receipt.is_admin !== true ||
    !Number.isSafeInteger(receipt.candidate_user_id) || receipt.candidate_user_id < 1 ||
    !UUID.test(receipt.candidate_user_uid) || !UUID.test(receipt.through_40_release_uid) ||
    !SHA256.test(receipt.authorization_version) || !SHA256.test(receipt.observed_ledger_sha256) ||
    !RFC3339_UTC_MILLISECONDS.test(receipt.observed_at) || Number.isNaN(Date.parse(receipt.observed_at))
  ) {
    fail("actor_receipt_target_mismatch");
  }
  if (route.candidateUserId !== undefined && receipt.candidate_user_id !== route.candidateUserId) fail("blocked_actor");
  if (route.kind === "disposable-test" && (
    receipt.disposable_run_uid !== route.disposableRunUid ||
    receipt.parent_target_fingerprint !== route.parentTargetFingerprint
  )) {
    fail("actor_receipt_target_mismatch");
  }
  const observed = await observeLedgerThrough40(pool, route.targetFingerprint);
  if (
    receipt.through_40_release_uid !== observed.coveringReleaseUid ||
    receipt.observed_ledger_sha256 !== observed.digest ||
    receipt.authorization_version !== actorAuthorizationVersion(
      route,
      receipt.candidate_user_id,
      receipt.candidate_user_uid,
      receipt.through_40_release_uid,
      receipt.observed_ledger_sha256,
    )
  ) {
    fail("actor_receipt_ledger_drift");
  }
  const actor = await pool.query<{ id: number; user_uid: string; name: string; is_admin: boolean }>(`
    SELECT id,user_uid::text,name,is_admin FROM public.users WHERE id=$1 AND user_uid=$2::uuid
  `, [receipt.candidate_user_id, receipt.candidate_user_uid]);
  if (actor.rowCount !== 1 || actor.rows[0].is_admin !== true) fail("blocked_actor");
  return {
    userId: actor.rows[0].id,
    userUid: actor.rows[0].user_uid,
    name: actor.rows[0].name,
    authorizationVersion: receipt.authorization_version,
  };
}
