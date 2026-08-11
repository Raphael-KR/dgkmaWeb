import type { PoolClient } from "pg";
import { planAnnualPolicyActivation } from "./refund-activation-contract";

export type AnnualActivationActor = Readonly<{
  userId: number;
  userUid: string;
  name: string;
  authorizationVersion: string;
}>;

type PolicyDraft = {
  id: string;
  tier_code: string;
  priority: number;
  monthly_minimum: string;
  annual_minimum: string;
  due_day: number;
  reminder_day: number;
  source_logical_id: string;
  source_row_version_id: string | null;
  version: number;
};

type MappingDraft = {
  id: string;
  position_code: string;
  tier_code: string | null;
  priority: number;
  adds_obligation: boolean;
  source_logical_id: string;
  source_row_version_id: string | null;
  version: number;
};

export type AnnualActivationWriteResult = Readonly<{
  policyIds: readonly string[];
  mappingIds: readonly string[];
  executionOrder: readonly string[];
}>;

const TIERS = ["president", "senior_vice_president", "vice_president_auditor_chair", "director", "member", "honorary"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function fail(code: string): never { throw new Error(code); }
function compare(left: string, right: string): number { return Buffer.compare(Buffer.from(left), Buffer.from(right)); }

async function reserve(client: Pick<PoolClient, "query">, table: "dues_policies" | "dues_position_tier_mappings"): Promise<string> {
  const result = await client.query<{ id: string }>(
    "SELECT nextval(pg_get_serial_sequence($1,'id'))::text id",
    [`public.${table}`],
  );
  if (result.rowCount !== 1 || !/^[1-9][0-9]*$/.test(result.rows[0].id)) fail("annual_activation_reservation_failed");
  return result.rows[0].id;
}

/**
 * Materializes the annual policy VCHAIN inside an already-open SERIALIZABLE
 * business-operation transaction. The caller owns receipt/audit persistence
 * and commit/rollback; this writer never commits independently.
 */
export async function materializeAnnualPolicyActivation(
  client: Pick<PoolClient, "query">,
  input: Readonly<{ duesYear: number; effectiveAt: string; resolutionRef: string; actor: AnnualActivationActor }>,
): Promise<AnnualActivationWriteResult> {
  if (!Number.isInteger(input.duesYear) || input.duesYear < 2000 || !Number.isFinite(Date.parse(input.effectiveAt)) || input.resolutionRef.trim() === "") fail("annual_activation_input_invalid");
  if (!Number.isSafeInteger(input.actor.userId) || input.actor.userId <= 0 || !UUID.test(input.actor.userUid) || !SHA256.test(input.actor.authorizationVersion) || input.actor.name.trim() === "") fail("annual_activation_actor_invalid");

  const isolation = await client.query<{ transaction_isolation: string }>("SHOW transaction_isolation");
  if (isolation.rowCount !== 1 || isolation.rows[0].transaction_isolation !== "serializable") fail("annual_activation_serializable_required");
  const actor = await client.query<{ id: number; user_uid: string; name: string; is_admin: boolean }>(
    "SELECT id,user_uid::text,name,is_admin FROM public.users WHERE id=$1 FOR UPDATE",
    [input.actor.userId],
  );
  if (actor.rowCount !== 1 || actor.rows[0].user_uid !== input.actor.userUid || actor.rows[0].name !== input.actor.name || actor.rows[0].is_admin !== true) fail("annual_activation_actor_binding_mismatch");

  const policies = await client.query<PolicyDraft>(`SELECT id::text,tier_code,priority,monthly_minimum::text,annual_minimum::text,due_day,reminder_day,
    source_logical_id::text,source_row_version_id::text,version
    FROM public.dues_policies
    WHERE dues_year=$1 AND status='draft' AND version=1
    ORDER BY tier_code FOR UPDATE`, [input.duesYear]);
  const policyRows = [...policies.rows].sort((left, right) => compare(left.tier_code, right.tier_code));
  if (policyRows.length !== TIERS.length || TIERS.some((tier) => !policyRows.some((row) => row.tier_code === tier))) fail("annual_activation_policy_coverage_invalid");

  const mappings = await client.query<MappingDraft>(`SELECT id::text,position_code,tier_code,priority,adds_obligation,source_logical_id::text,
    source_row_version_id::text,version
    FROM public.dues_position_tier_mappings
    WHERE dues_year=$1 AND status='draft' AND version=1
    ORDER BY position_code FOR UPDATE`, [input.duesYear]);
  const mappingRows = [...mappings.rows].sort((left, right) => compare(left.position_code, right.position_code));
  if (mappingRows.length === 0 || mappingRows.some((row) => row.adds_obligation ? !row.tier_code || !TIERS.includes(row.tier_code as typeof TIERS[number]) : row.tier_code !== null)) fail("annual_activation_mapping_coverage_invalid");

  const collisions = await client.query<{ policies: number; mappings: number }>(`SELECT
    (SELECT count(*)::int FROM public.dues_policies WHERE dues_year=$1 AND version<>1) policies,
    (SELECT count(*)::int FROM public.dues_position_tier_mappings WHERE dues_year=$1 AND version<>1) mappings`, [input.duesYear]);
  if (collisions.rowCount !== 1 || collisions.rows[0].policies !== 0 || collisions.rows[0].mappings !== 0) fail("annual_activation_successor_collision");

  const policyReservations = new Map<string, string>();
  for (const row of policyRows) policyReservations.set(row.tier_code, await reserve(client, "dues_policies"));
  const mappingReservations = new Map<string, string>();
  for (const row of mappingRows) mappingReservations.set(row.position_code, await reserve(client, "dues_position_tier_mappings"));
  planAnnualPolicyActivation({
    policySuccessors: policyRows.map((row) => ({ tierCode: row.tier_code, successorUid: policyReservations.get(row.tier_code)! })),
    mappingSuccessors: mappingRows.filter((row) => row.tier_code !== null).map((row) => ({ mappingUid: mappingReservations.get(row.position_code)!, tierCode: row.tier_code!, policySuccessorUid: policyReservations.get(row.tier_code!)! })),
  });

  const executionOrder: string[] = [];
  for (const row of policyRows) {
    const id = policyReservations.get(row.tier_code)!;
    await client.query(`INSERT INTO public.dues_policies
      (id,dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,source_row_version_id,
       resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
       recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version,approved_at,approval_actor_user_id,
       approval_actor_uid_snapshot,approval_actor_name_snapshot,approval_actor_scope,approval_actor_at,approval_actor_correlation_uid,approval_actor_authorization_version)
      OVERRIDING SYSTEM VALUE VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,'approved',$9,$10,$11,$12::timestamptz,$13,$14,$15,$16::uuid,$17,'admin',$12::timestamptz,gen_random_uuid(),$18,
       $12::timestamptz,$15,$16::uuid,$17,'admin',$12::timestamptz,gen_random_uuid(),$18)`,
    [id,input.duesYear,row.tier_code,row.priority,row.monthly_minimum,row.annual_minimum,row.due_day,row.reminder_day,row.source_logical_id,row.source_row_version_id,input.resolutionRef,input.effectiveAt,row.version+1,row.id,input.actor.userId,input.actor.userUid,input.actor.name,input.actor.authorizationVersion]);
    executionOrder.push(`policy:${row.tier_code}:${id}`);
  }

  for (const row of mappingRows) {
    const id = mappingReservations.get(row.position_code)!;
    const policyId = row.tier_code === null ? null : policyReservations.get(row.tier_code)!;
    await client.query(`INSERT INTO public.dues_position_tier_mappings
      (id,dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,effective_at,
       version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
       recorded_actor_correlation_uid,recorded_actor_authorization_version,approved_at,approval_actor_user_id,approval_actor_uid_snapshot,
       approval_actor_name_snapshot,approval_actor_scope,approval_actor_at,approval_actor_correlation_uid,approval_actor_authorization_version)
      OVERRIDING SYSTEM VALUE VALUES
      ($1,$2,$3,$4,$5,$6,$7,'approved',$8,$9,$10::timestamptz,$11,$12,$13,$14::uuid,$15,'admin',$10::timestamptz,gen_random_uuid(),$16,
       $10::timestamptz,$13,$14::uuid,$15,'admin',$10::timestamptz,gen_random_uuid(),$16)`,
    [id,input.duesYear,row.position_code,row.tier_code,policyId,row.priority,row.adds_obligation,row.source_logical_id,row.source_row_version_id,input.effectiveAt,row.version+1,row.id,input.actor.userId,input.actor.userUid,input.actor.name,input.actor.authorizationVersion]);
    executionOrder.push(`mapping:${row.position_code}:${id}`);
  }
  return { policyIds: policyRows.map((row) => policyReservations.get(row.tier_code)!), mappingIds: mappingRows.map((row) => mappingReservations.get(row.position_code)!), executionOrder };
}
