import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const STARTUP_MANIFEST_SHA256 = "551d9d672a0cd3689b6c3ac5d1252078f4e53106a7ef143ac954c96239596c14";
export const STARTUP_EXECUTOR_VERSION = "schema-ledger-v1";
export const STARTUP_REQUIRED_SEQUENCES = [1, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;
export const STARTUP_LATEST_REQUIRED = { sequence_no: 100, artifact_id: "legacy-payments-write-fence-v1" } as const;

export const STARTUP_ARTIFACTS = [
  { sequence_no: 1, artifact_id: "schema-ledger-bootstrap-v1", kind: "manual" },
  { sequence_no: 10, artifact_id: "current-schema-baseline-v1", kind: "baseline" },
  { sequence_no: 15, artifact_id: "existing-data-exception-capture-v1", kind: "ordinary" },
  { sequence_no: 20, artifact_id: "existing-integrity-v1", kind: "ordinary" },
  { sequence_no: 30, artifact_id: "accounting-ordinary-v1", kind: "ordinary" },
  { sequence_no: 40, artifact_id: "accounting-temporal-preferred-v1", kind: "manual", capability_variant: "preferred_btree_gist" },
  { sequence_no: 40, artifact_id: "accounting-temporal-fallback-v1", kind: "manual", capability_variant: "deferred_trigger_fallback" },
  { sequence_no: 50, artifact_id: "accounting-reference-seed-v1", kind: "ordinary" },
  { sequence_no: 60, artifact_id: "database-security-v1", kind: "manual" },
  { sequence_no: 70, artifact_id: "event-claim-coordinate-root-v1", kind: "manual" },
  { sequence_no: 80, artifact_id: "group-member-source-root-v1", kind: "manual" },
  { sequence_no: 90, artifact_id: "legacy-cutover-code-root-v1", kind: "manual" },
  { sequence_no: 100, artifact_id: "legacy-payments-write-fence-v1", kind: "manual" },
] as const;

export type StartupDescriptor = {
  artifact_id: string;
  artifact_sha256: string | null;
  kind: string;
  manifest_sha256: string;
  materialization_state: "materialized" | "not_materialized";
  required_for_startup: boolean;
  sequence_no: number;
};

export type StartupLedgerRow = {
  artifact_id: string;
  artifact_sha256: string;
  artifact_kind: string;
  capability_variant: "preferred_btree_gist" | "deferred_trigger_fallback";
  executor_version: string;
  manifest_sha256: string;
  release_state: string;
  sequence_no: number;
  target_fingerprint: string;
};

const SHA = /^[0-9a-f]{64}$/;

function failure(code: string, observedLatestSequence: number | null = null) {
  return {
    ready: false,
    code,
    observed_latest_sequence: observedLatestSequence,
    required_latest_sequence: STARTUP_LATEST_REQUIRED.sequence_no,
    emitted_ddl: [] as string[],
    schema_writes: 0,
  } as const;
}

export function verifyStartupLedger(rows: readonly StartupLedgerRow[], descriptors: readonly StartupDescriptor[]) {
  if (rows.length === 0) return failure("startup_ledger_missing", null);
  const observedLatest = Math.max(...rows.map((row) => row.sequence_no));
  const materialized = descriptors.filter((descriptor) => descriptor.required_for_startup);
  if (materialized.some((descriptor) => descriptor.materialization_state !== "materialized" || !descriptor.artifact_sha256)) {
    return failure("startup_artifacts_not_materialized", observedLatest);
  }
  const selectedForty = rows.find((row) => row.sequence_no === 40);
  if (!selectedForty) return failure("startup_ledger_missing_required_sequence", observedLatest);
  const expected = materialized.filter((descriptor) =>
    descriptor.sequence_no !== 40 || descriptor.artifact_id === selectedForty.artifact_id
  );
  const latestDescriptor = expected.find((descriptor) => descriptor.sequence_no === STARTUP_LATEST_REQUIRED.sequence_no);
  if (latestDescriptor?.manifest_sha256 !== STARTUP_MANIFEST_SHA256) return failure("startup_manifest_lineage_mismatch", observedLatest);
  if (expected.length !== STARTUP_REQUIRED_SEQUENCES.length) return failure("startup_descriptor_contract_mismatch", observedLatest);
  if (new Set(rows.map((row) => row.sequence_no)).size !== rows.length) return failure("startup_ledger_sequence_duplicate", observedLatest);
  if (rows.some((row) => row.sequence_no <= 100 && !STARTUP_REQUIRED_SEQUENCES.includes(row.sequence_no as never))) {
    return failure("startup_ledger_unknown_required_range_sequence", observedLatest);
  }
  const targetFingerprints = new Set(rows.map((row) => row.target_fingerprint));
  const capabilityVariants = new Set(rows.filter((row) => row.sequence_no !== 1).map((row) => row.capability_variant));
  if (targetFingerprints.size !== 1 || ![...targetFingerprints].every((value) => SHA.test(value))) {
    return failure("startup_ledger_target_mismatch", observedLatest);
  }
  if (capabilityVariants.size !== 1) return failure("startup_ledger_capability_variant_mismatch", observedLatest);
  const variant = rows.find((row) => row.sequence_no === 40)!.capability_variant;
  const expectedForty = variant === "preferred_btree_gist"
    ? "accounting-temporal-preferred-v1"
    : "accounting-temporal-fallback-v1";
  if (selectedForty.artifact_id !== expectedForty) return failure("startup_ledger_temporal_variant_mismatch", observedLatest);
  for (const descriptor of expected) {
    const row = rows.find((candidate) => candidate.sequence_no === descriptor.sequence_no);
    if (!row) return failure("startup_ledger_missing_required_sequence", observedLatest);
    if (
      row.artifact_id !== descriptor.artifact_id || row.artifact_sha256 !== descriptor.artifact_sha256 ||
      row.artifact_kind !== descriptor.kind || row.manifest_sha256 !== descriptor.manifest_sha256 ||
      row.release_state !== "verified" ||
      row.executor_version !== STARTUP_EXECUTOR_VERSION || !SHA.test(row.artifact_sha256)
    ) return failure("startup_ledger_exact_version_mismatch", observedLatest);
  }
  const latest = rows.find((row) => row.sequence_no === STARTUP_LATEST_REQUIRED.sequence_no);
  if (!latest || latest.artifact_id !== STARTUP_LATEST_REQUIRED.artifact_id) {
    return failure("startup_ledger_latest_required_mismatch", observedLatest);
  }
  return {
    ready: true,
    code: "startup_ledger_ready",
    observed_latest_sequence: observedLatest,
    required_latest_sequence: STARTUP_LATEST_REQUIRED.sequence_no,
    capability_variant: variant,
    target_fingerprint: rows[0].target_fingerprint,
    emitted_ddl: [] as string[],
    schema_writes: 0,
  } as const;
}

export function startupLedgerInventorySql(): string {
  return [
    "BEGIN TRANSACTION READ ONLY;",
    "SELECT l.sequence_no, l.artifact_id, l.artifact_sha256, l.artifact_kind, l.manifest_sha256,",
    "       l.target_fingerprint, l.capability_variant, l.executor_version, r.state AS release_state",
    "FROM public.schema_change_ledger AS l",
    "JOIN public.schema_release_runs AS r ON r.id = l.release_run_id",
    "WHERE l.sequence_no <= 100 ORDER BY l.sequence_no, l.artifact_id;",
    "ROLLBACK;",
    "",
  ].join("\n");
}

export function resolveTaskTenCommitSha(explicitCommitSha: string | undefined, readHead: () => string): string {
  if (explicitCommitSha !== undefined) {
    if (!/^[0-9a-f]{40}$/.test(explicitCommitSha)) throw new Error("task_10_commit_sha_invalid");
    return explicitCommitSha;
  }
  const localHead = readHead();
  if (!/^[0-9a-f]{40}$/.test(localHead)) throw new Error("task_10_commit_sha_invalid");
  return localHead;
}

export const RETENTION_METRIC_FIELDS = ["table", "cutoff", "count", "duration", "outcome"] as const;
export const RETENTION_CONTRACT = {
  schedule: "hourly",
  lock_scope: "single_advisory_lock",
  lock_namespace: "dgkma-retention-v1",
  rows_per_batch: 500,
  batch_time_limit_ms: 5_000,
  max_batches: 10,
  pending_hmac_secret: "ACCOUNTING_PII_HMAC_KEY_V1",
  metric_fields: RETENTION_METRIC_FIELDS,
} as const;

export const RETENTION_JOBS = [
  { job_id: "sessions", table: "session", cursor: ["expire", "sid"], cutoff: "now()", predicate: "expire < now()", effect: "delete", requires_hmac: false },
  { job_id: "oauth_states", table: "kakao_oauth_states", cursor: ["expires_at", "state_hash"], cutoff: "now()-24 hours", predicate: "expires_at < now()-24 hours", effect: "delete", requires_hmac: false },
  { job_id: "termination_markers", table: "kakao_identity_terminations", cursor: ["terminated_at", "identity_hash"], cutoff: "now()-30 days", predicate: "terminated_at < now()-30 days", effect: "delete", requires_hmac: false },
  { job_id: "rejected_pending", table: "pending_registrations", cursor: ["created_at", "id"], cutoff: "now()-30 days", predicate: "status='rejected' AND created_at < now()-30 days AND pii_redacted_at IS NULL", effect: "redact", requires_hmac: true },
] as const;

export type RetentionJobId = typeof RETENTION_JOBS[number]["job_id"];
export type RetentionFixtureRow = {
  id?: number;
  sid?: string;
  state_hash?: string;
  identity_hash?: string;
  expire?: string;
  expires_at?: string;
  terminated_at?: string;
  created_at?: string;
  status?: string;
  pii_redacted_at?: string | null;
};

function cutoff(now: Date, hoursOrDays: { hours?: number; days?: number }): number {
  return now.getTime() - ((hoursOrDays.hours ?? 0) * 3_600_000) - ((hoursOrDays.days ?? 0) * 86_400_000);
}

function eligible(jobId: RetentionJobId, row: RetentionFixtureRow, now: Date): boolean {
  if (jobId === "sessions") return Date.parse(row.expire ?? "") < now.getTime();
  if (jobId === "oauth_states") return Date.parse(row.expires_at ?? "") < cutoff(now, { hours: 24 });
  if (jobId === "termination_markers") return Date.parse(row.terminated_at ?? "") < cutoff(now, { days: 30 });
  return row.status === "rejected" && row.pii_redacted_at == null &&
    Date.parse(row.created_at ?? "") < cutoff(now, { days: 30 });
}

function rowKey(jobId: RetentionJobId, row: RetentionFixtureRow): string {
  if (jobId === "sessions") return `${row.expire}\n${row.sid}`;
  if (jobId === "oauth_states") return `${row.expires_at}\n${row.state_hash}`;
  if (jobId === "termination_markers") return `${row.terminated_at}\n${row.identity_hash}`;
  return `${row.created_at}\n${String(row.id).padStart(20, "0")}`;
}

export function retentionAdvisoryLockKey(namespace = RETENTION_CONTRACT.lock_namespace): bigint {
  const hex = createHash("sha256").update(namespace).digest("hex").slice(0, 16);
  const unsigned = BigInt(`0x${hex}`);
  return unsigned >= 0x8000000000000000n ? unsigned - 0x10000000000000000n : unsigned;
}

export function planRetentionRun(
  jobId: RetentionJobId,
  rows: readonly RetentionFixtureRow[],
  nowIso: string,
  options: { hmacKeyPresent: boolean },
) {
  const job = RETENTION_JOBS.find((entry) => entry.job_id === jobId);
  if (!job) throw new Error("retention_job_unknown");
  if (job.requires_hmac && !options.hmacKeyPresent) {
    return { job_id: jobId, outcome: "blocked_missing_hmac", batches: [], selected_keys: [], planned_effects: 0, emitted_sql: [], writes_executed: 0 } as const;
  }
  const now = new Date(nowIso);
  if (!Number.isFinite(now.getTime())) throw new Error("retention_now_invalid");
  const selected = rows.filter((row) => eligible(jobId, row, now)).sort((a, b) => rowKey(jobId, a).localeCompare(rowKey(jobId, b)))
    .slice(0, RETENTION_CONTRACT.rows_per_batch * RETENTION_CONTRACT.max_batches);
  const batches: string[][] = [];
  for (let index = 0; index < selected.length; index += RETENTION_CONTRACT.rows_per_batch) {
    batches.push(selected.slice(index, index + RETENTION_CONTRACT.rows_per_batch).map((row) => rowKey(jobId, row)));
  }
  return {
    job_id: jobId,
    outcome: selected.length === 0 ? "no_eligible_rows" : "planned",
    effect: job.effect,
    batches,
    selected_keys: selected.map((row) => rowKey(jobId, row)),
    planned_effects: selected.length,
    emitted_sql: [] as string[],
    writes_executed: 0,
  } as const;
}

export function validateRetentionMetric(metric: Record<string, unknown>): void {
  const keys = Object.keys(metric).sort();
  const expected = [...RETENTION_METRIC_FIELDS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error("retention_metric_field_not_allowed");
  }
  if (!RETENTION_JOBS.some((job) => job.table === metric.table)) throw new Error("retention_metric_table_not_allowed");
  if (typeof metric.cutoff !== "string" || typeof metric.count !== "number" || typeof metric.duration !== "number" || typeof metric.outcome !== "string") {
    throw new Error("retention_metric_value_invalid");
  }
}

export function verifyRuntimeBoundary(indexPath = "server/index.ts"): void {
  const source = readFileSync(indexPath, "utf8");
  if (source.includes('CREATE TABLE IF NOT EXISTS "session"') || source.includes("CREATE INDEX IF NOT EXISTS session_expire_idx")) {
    throw new Error("runtime_schema_ddl_forbidden");
  }
  if (!source.includes("verifyStartupSchema") || !source.includes("createTableIfMissing: false")) {
    throw new Error("startup_ledger_verifier_not_wired");
  }
}
