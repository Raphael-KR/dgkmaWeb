import type { Pool, PoolClient } from "pg";
import {
  executePreparedAnnualPolicyActivation,
  prepareAnnualPolicyActivation,
  reserveAnnualPolicyActivation,
  type AnnualActivationActor,
  type AnnualActivationWriteInput,
} from "./annual-policy-activation-write";
import { validateBusinessOperationPayloadV2 } from "./business-operation-payload";
import { projectAnnualPolicyActivationOperation } from "./operation-tail-contract";
import { deterministicRoleUuid } from "./source-decision-role-plan";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";

export type AnnualActivationServiceActor = AnnualActivationActor & Readonly<{ targetFingerprint: string }>;

export type AnnualActivationCommand = Readonly<{
  schemaVersion: "annual-policy-activation-command-v1";
  operationUid: string;
  duesYear: number;
  effectiveAt: string;
  resolutionRef: string;
}>;

export type AnnualActivationExecution = Readonly<{
  executionOutcome: "created" | "verified_noop";
  payloadSha256: string;
  resultCount: number;
}>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function fail(code: string): never {
  throw new Error(code);
}

function validateCommand(value: AnnualActivationCommand): void {
  if (
    value.schemaVersion !== "annual-policy-activation-command-v1" ||
    !UUID_V4.test(value.operationUid) ||
    !Number.isInteger(value.duesYear) ||
    value.duesYear < 2000 ||
    !Number.isFinite(Date.parse(value.effectiveAt)) ||
    value.resolutionRef.trim() === ""
  ) {
    fail("annual_activation_command_invalid");
  }
}

async function reserve(client: Pick<PoolClient, "query">, table: "business_operation_receipts" | "accounting_audit_events"): Promise<string> {
  const result = await client.query<{ id: string }>(
    "SELECT nextval(pg_get_serial_sequence($1,'id'))::text id",
    [`public.${table}`],
  );
  if (result.rowCount !== 1 || !/^[1-9][0-9]*$/.test(result.rows[0].id)) fail("annual_activation_operation_reservation_failed");
  return result.rows[0].id;
}

async function verifyReplay(
  client: Pick<PoolClient, "query">,
  command: AnnualActivationCommand,
  commandSha256: string,
  actor: AnnualActivationServiceActor,
): Promise<AnnualActivationExecution | undefined> {
  const existing = await client.query<{ canonical_payload: CanonicalValue; payload_sha256: string; result_entity_keys: CanonicalValue; target_fingerprint: string }>(
    "SELECT canonical_payload,payload_sha256,result_entity_keys,target_fingerprint FROM public.business_operation_receipts WHERE operation_uid=$1::uuid FOR UPDATE",
    [command.operationUid],
  );
  if (existing.rowCount === 0) return undefined;
  if (existing.rowCount !== 1 || existing.rows[0].target_fingerprint !== actor.targetFingerprint) fail("annual_activation_operation_uid_reuse");
  const payload = existing.rows[0].canonical_payload as Record<string, CanonicalValue>;
  const inputs = payload.inputs as Record<string, CanonicalValue> | undefined;
  const validated = validateBusinessOperationPayloadV2(existing.rows[0].canonical_payload);
  if (
    payload.command !== "annual_policy_activation:approve" ||
    inputs?.command_sha256 !== commandSha256 ||
    validated.sha256 !== existing.rows[0].payload_sha256 ||
    canonicalJson(payload.expected_results!) !== canonicalJson(existing.rows[0].result_entity_keys)
  ) {
    fail("annual_activation_operation_uid_reuse");
  }
  return { executionOutcome: "verified_noop", payloadSha256: validated.sha256, resultCount: (payload.expected_results as CanonicalValue[]).length };
}

export async function executeAnnualPolicyActivationOperation(
  pool: Pick<Pool, "connect">,
  command: AnnualActivationCommand,
  actor: AnnualActivationServiceActor,
): Promise<AnnualActivationExecution> {
  validateCommand(command);
  if (!SHA256.test(actor.targetFingerprint)) fail("annual_activation_target_invalid");
  const commandSha256 = sha256(canonicalJson(command as unknown as CanonicalValue));
  const input: AnnualActivationWriteInput = {
    duesYear: command.duesYear,
    effectiveAt: command.effectiveAt,
    resolutionRef: command.resolutionRef,
    actor,
  };
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    const liveActor = await client.query<{ id: number; user_uid: string; name: string; is_admin: boolean }>(
      "SELECT id,user_uid::text,name,is_admin FROM public.users WHERE id=$1 FOR UPDATE",
      [actor.userId],
    );
    if (liveActor.rowCount !== 1 || liveActor.rows[0].user_uid !== actor.userUid || liveActor.rows[0].name !== actor.name || liveActor.rows[0].is_admin !== true) fail("annual_activation_actor_binding_mismatch");
    const replay = await verifyReplay(client, command, commandSha256, actor);
    if (replay) {
      await client.query("COMMIT");
      return replay;
    }

    const prepared = await prepareAnnualPolicyActivation(client, input);
    const receiptId = await reserve(client, "business_operation_receipts");
    const reservation = await reserveAnnualPolicyActivation(client, prepared);
    const auditIds: string[] = [];
    for (let index = 0; index < prepared.policies.length + prepared.mappings.length; index += 1) {
      auditIds.push(await reserve(client, "accounting_audit_events"));
    }
    const projection = projectAnnualPolicyActivationOperation({
      operationUid: command.operationUid,
      commandSha256,
      duesYear: command.duesYear,
      resolutionRef: command.resolutionRef,
      receiptId,
      policyReservations: prepared.policies.map((row) => ({ tierCode: row.tier_code, id: reservation.policyIds.get(row.tier_code)! })),
      mappingReservations: prepared.mappings.map((row) => ({ positionCode: row.position_code, id: reservation.mappingIds.get(row.position_code)! })),
      auditIds,
    });
    const rootCorrelationUid = deterministicRoleUuid(`${command.operationUid}\nannual-activation\nroot`);
    await client.query(`INSERT INTO public.business_operation_receipts
      (id,action,actor_name_snapshot,actor_scope,actor_target_user_id,actor_target_user_id_snapshot,actor_uid_snapshot,actor_user_id,
       actor_user_id_snapshot,authorization_version,canonical_payload,entity_type,operation_uid,payload_sha256,recorded_at,result_entity_keys,
       root_correlation_uid,target_fingerprint)
      OVERRIDING SYSTEM VALUE VALUES
      ($1,'approve',$2,'admin',NULL,NULL,$3::uuid,$4,$4,$5,$6::jsonb,'annual_policy_activation',$7::uuid,$8,$9::timestamptz,$10::jsonb,$11::uuid,$12)`,
    [receiptId,actor.name,actor.userUid,actor.userId,actor.authorizationVersion,projection.canonical,command.operationUid,projection.payloadSha256,command.effectiveAt,canonicalJson(projection.results as unknown as CanonicalValue),rootCorrelationUid,actor.targetFingerprint]);
    for (const result of projection.results) {
      await client.query(
        "INSERT INTO public.business_operation_entities (operation_uid,ordinal,entity_type,entity_key,entity_action,action_correlation_uid) VALUES ($1::uuid,$2,$3,$4,$5,$6::uuid)",
        [command.operationUid,result.ordinal,result.entity_type,result.entity_key,result.entity_action,result.action_correlation_uid],
      );
    }
    const correlations = new Map<string, string>();
    prepared.policies.forEach((row, index) => correlations.set(`policy:${row.tier_code}`, projection.results[index].action_correlation_uid));
    prepared.mappings.forEach((row, index) => correlations.set(`mapping:${row.position_code}`, projection.results[prepared.policies.length + index].action_correlation_uid));
    await executePreparedAnnualPolicyActivation(client, input, prepared, reservation, correlations);
    for (let index = 0; index < projection.results.length; index += 1) {
      const result = projection.results[index];
      await client.query(`INSERT INTO public.accounting_audit_events
        (id,event_uid,entity_type,entity_key,action,before_json,after_json,effective_at,recorded_at,reason_code,actor_user_id,
         actor_uid_snapshot,actor_name_snapshot,actor_scope,actor_at,correlation_uid,actor_authorization_version)
        OVERRIDING SYSTEM VALUE VALUES
        ($1,$2::uuid,$3,$4,$5,NULL,$6::jsonb,$7::timestamptz,$7::timestamptz,$8,$9,$10::uuid,$11,'admin',$7::timestamptz,$12::uuid,$13)`,
      [auditIds[index],deterministicRoleUuid(`${command.operationUid}\nannual-activation\naudit\n${result.ordinal}`),result.entity_type,result.entity_key,result.entity_action,canonicalJson({ status: "approved", version: 2 }),command.effectiveAt,`audit/${result.entity_type}/approve`,actor.userId,actor.userUid,actor.name,result.action_correlation_uid,actor.authorizationVersion]);
    }
    await client.query("COMMIT");
    return { executionOutcome: "created", payloadSha256: projection.payloadSha256, resultCount: projection.results.length };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
