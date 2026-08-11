import { readFileSync } from "node:fs";

export type LockTraceStep =
  | Readonly<{ kind: "lock"; lockClass: string }>
  | Readonly<{ kind: "reserve"; label: "identity_sequences" }>;

type LockClass = Readonly<{ lock_class: string; rank: number }>;

export const EXPECTED_GLOBAL_LOCK_REGISTRY: readonly (readonly [rank: number, lockClass: string])[] = [
  [10,"actor_user"],[15,"kakao_identity"],[20,"business_operation"],[23,"event_parse_rate_limit"],[24,"kakao_identity_termination"],[25,"session"],[26,"community_event"],[27,"post"],[28,"comment"],[29,"obituary"],[30,"schema_exception"],[35,"alumni_database"],[40,"pending_registration"],[50,"legacy_cutover"],[60,"legacy_payment"],[70,"legacy_decision"],[80,"logical_source"],[90,"source_account_mapping"],[100,"source_release"],[110,"import_batch"],[120,"import_coordinate"],[130,"import_row"],[135,"source_decision_set"],[136,"source_decision_item"],[140,"source_classification"],[145,"event_party"],[146,"event_party_alias"],[150,"association_member"],[160,"event_claim"],[170,"identity_link"],[180,"match_case"],[190,"match_candidate"],[200,"position_assignment"],[210,"dues_policy"],[220,"dues_mapping"],[230,"dues_tier"],[240,"pledge"],[250,"assessment"],[260,"rights_snapshot"],[270,"accounting_period"],[280,"bank_account"],[290,"bank_anchor"],[300,"candidate_day"],[310,"economic_event"],[320,"event_provenance"],[330,"authority_decision"],[340,"event_collision"],[350,"event_canonicalization"],[360,"bank_transaction"],[370,"transfer_match"],[380,"reconciliation"],[390,"reconciliation_item"],[400,"reconciliation_carryforward"],[410,"accounting_category"],[420,"cashbook_entry"],[430,"receipt"],[440,"receipt_reversal"],[450,"payment_group"],[460,"group_member"],[470,"original_allocation"],[480,"new_allocation"],[490,"audit_event"],
];

function fail(code: string): never { throw new Error(code); }

export function readGlobalLockRegistry(manifestPath = "docs/database-manifest.yaml"): readonly LockClass[] {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  if (!Array.isArray(manifest.lock_class_registry)) fail("lock_registry_missing");
  const registry = manifest.lock_class_registry.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail("lock_registry_shape_invalid");
    const value = entry as Record<string, unknown>;
    if (Object.keys(value).sort().join(",") !== "lock_class,rank" || typeof value.lock_class !== "string" || !Number.isSafeInteger(value.rank)) fail("lock_registry_shape_invalid");
    return { lock_class: value.lock_class, rank: value.rank as number };
  });
  if (JSON.stringify(registry.map((entry) => [entry.rank, entry.lock_class])) !== JSON.stringify(EXPECTED_GLOBAL_LOCK_REGISTRY)) fail("lock_registry_closure_invalid");
  for (let index = 1; index < registry.length; index += 1) if (registry[index - 1].rank >= registry[index].rank) fail("lock_registry_order_invalid");
  if (registry[0].lock_class !== "actor_user" || registry[0].rank !== 10 || registry.at(-1)?.lock_class !== "audit_event" || registry.at(-1)?.rank !== 490) fail("lock_registry_boundary_invalid");
  return registry;
}

export function validateGlobalLockTrace(input: Readonly<{
  commandKind: "non_kakao" | "kakao_identity";
  steps: readonly LockTraceStep[];
  requiredAdjacentPairs?: readonly (readonly [string, string])[];
}>): Readonly<{ lockCount: number; reservationOrdinal: number; adjacentPairs: readonly string[] }> {
  const registry = readGlobalLockRegistry();
  const rankByClass = new Map(registry.map((entry) => [entry.lock_class, entry.rank]));
  const reservations = input.steps.flatMap((step, index) => step.kind === "reserve" ? [index] : []);
  if (reservations.length !== 1) fail("lock_trace_reservation_count_invalid");
  const reservationIndex = reservations[0];
  const locks = input.steps.flatMap((step, index) => step.kind === "lock" ? [{ ...step, index, rank: rankByClass.get(step.lockClass) }] : []);
  if (locks.some((lock) => lock.rank === undefined)) fail("lock_trace_class_unknown");
  for (let index = 1; index < locks.length; index += 1) if (locks[index - 1].rank! >= locks[index].rank!) fail("lock_trace_rank_regression");
  const requiredPrefix = input.commandKind === "kakao_identity"
    ? ["actor_user", "kakao_identity", "business_operation"]
    : ["actor_user", "business_operation"];
  if (locks.slice(0, requiredPrefix.length).map((lock) => lock.lockClass).join(",") !== requiredPrefix.join(",")) fail("lock_trace_prefix_invalid");
  const operationIndex = locks.find((lock) => lock.lockClass === "business_operation")?.index;
  if (operationIndex === undefined || reservationIndex <= operationIndex) fail("lock_trace_reservation_before_operation");
  const firstPostOperation = locks.find((lock) => lock.rank! >= 23)?.index;
  if (firstPostOperation !== undefined && reservationIndex >= firstPostOperation) fail("lock_trace_reservation_after_business_lock");
  if (locks.some((lock) => lock.index < reservationIndex && lock.rank! > 20) || locks.some((lock) => lock.index > reservationIndex && lock.rank! <= 20)) fail("lock_trace_reservation_boundary_invalid");

  const adjacentPairs = locks.slice(1).map((lock, index) => `${locks[index].lockClass}->${lock.lockClass}`);
  for (const [left, right] of input.requiredAdjacentPairs ?? []) if (!adjacentPairs.includes(`${left}->${right}`)) fail("lock_trace_required_pair_missing");
  return { lockCount: locks.length, reservationOrdinal: reservationIndex + 1, adjacentPairs };
}

export const SOURCE_WORKFLOW_LOCK_TRACE: readonly LockTraceStep[] = [
  { kind: "lock", lockClass: "actor_user" },
  { kind: "lock", lockClass: "business_operation" },
  { kind: "reserve", label: "identity_sequences" },
  { kind: "lock", lockClass: "logical_source" },
  { kind: "lock", lockClass: "source_account_mapping" },
  { kind: "lock", lockClass: "source_release" },
  { kind: "lock", lockClass: "import_batch" },
  { kind: "lock", lockClass: "import_coordinate" },
  { kind: "lock", lockClass: "import_row" },
  { kind: "lock", lockClass: "source_decision_set" },
  { kind: "lock", lockClass: "source_decision_item" },
  { kind: "lock", lockClass: "source_classification" },
  { kind: "lock", lockClass: "association_member" },
  { kind: "lock", lockClass: "event_claim" },
  { kind: "lock", lockClass: "match_case" },
  { kind: "lock", lockClass: "match_candidate" },
  { kind: "lock", lockClass: "candidate_day" },
  { kind: "lock", lockClass: "economic_event" },
  { kind: "lock", lockClass: "event_provenance" },
  { kind: "lock", lockClass: "authority_decision" },
  { kind: "lock", lockClass: "bank_transaction" },
  { kind: "lock", lockClass: "cashbook_entry" },
  { kind: "lock", lockClass: "receipt" },
  { kind: "lock", lockClass: "new_allocation" },
  { kind: "lock", lockClass: "audit_event" },
];

export const REFUND_WORKFLOW_LOCK_TRACE: readonly LockTraceStep[] = [
  { kind: "lock", lockClass: "actor_user" },
  { kind: "lock", lockClass: "business_operation" },
  { kind: "reserve", label: "identity_sequences" },
  { kind: "lock", lockClass: "bank_account" },
  { kind: "lock", lockClass: "bank_anchor" },
  { kind: "lock", lockClass: "candidate_day" },
  { kind: "lock", lockClass: "economic_event" },
  { kind: "lock", lockClass: "event_provenance" },
  { kind: "lock", lockClass: "authority_decision" },
  { kind: "lock", lockClass: "bank_transaction" },
  { kind: "lock", lockClass: "receipt" },
  { kind: "lock", lockClass: "receipt_reversal" },
  { kind: "lock", lockClass: "original_allocation" },
  { kind: "lock", lockClass: "new_allocation" },
  { kind: "lock", lockClass: "audit_event" },
];
