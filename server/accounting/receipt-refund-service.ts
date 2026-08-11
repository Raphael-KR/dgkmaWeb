import type { Pool, PoolClient } from "pg";
import type { RefundCorrectionReason } from "./refund-activation-contract";
import {
  executePreparedReceiptRefund,
  prepareReceiptRefund,
  reserveReceiptRefund,
  type ReceiptRefundWriteInput,
} from "./receipt-refund-write";
import { validateBusinessOperationPayloadV2 } from "./business-operation-payload";
import { projectReceiptRefundOperation } from "./operation-tail-contract";
import { deterministicRoleUuid } from "./source-decision-role-plan";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";
import type { AnnualActivationActor } from "./annual-policy-activation-write";

export type ReceiptRefundServiceActor = AnnualActivationActor & Readonly<{ targetFingerprint: string }>;

export type ReceiptRefundCommand = Readonly<{
  schemaVersion: "receipt-refund-command-v1";
  operationUid: string;
  refundEventUid: string;
  receiptUid: string;
  originalAllocationRequestUids: readonly string[];
  newAllocationRequestUids: readonly string[];
  correctionReasonCode: RefundCorrectionReason;
  correctionEvidenceSha256: string | null;
  correctionEvidenceVerified: boolean;
}>;

export type ReceiptRefundExecution = Readonly<{
  executionOutcome: "created" | "verified_noop";
  payloadSha256: string;
  resultCount: number;
}>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function fail(code: string): never { throw new Error(code); }

function validateCommand(command: ReceiptRefundCommand): void {
  if (
    command.schemaVersion !== "receipt-refund-command-v1" ||
    !UUID_V4.test(command.operationUid) ||
    !UUID_V4.test(command.refundEventUid) ||
    !UUID_V4.test(command.receiptUid) ||
    command.originalAllocationRequestUids.length === 0 ||
    command.originalAllocationRequestUids.length !== command.newAllocationRequestUids.length ||
    [...command.originalAllocationRequestUids, ...command.newAllocationRequestUids].some((uid) => !UUID_V4.test(uid)) ||
    (command.correctionReasonCode === null
      ? command.correctionEvidenceSha256 !== null || command.correctionEvidenceVerified
      : command.correctionEvidenceSha256 === null || !SHA256.test(command.correctionEvidenceSha256) || !command.correctionEvidenceVerified)
  ) fail("receipt_refund_command_invalid");
}

async function reserve(
  client: Pick<PoolClient, "query">,
  table: "business_operation_receipts" | "accounting_audit_events",
): Promise<string> {
  const result = await client.query<{ id: string }>(
    "SELECT nextval(pg_get_serial_sequence($1,'id'))::text id",
    [`public.${table}`],
  );
  if (result.rowCount !== 1 || !/^[1-9][0-9]*$/.test(result.rows[0].id)) fail("receipt_refund_operation_reservation_failed");
  return result.rows[0].id;
}

async function verifyReplay(
  client: Pick<PoolClient, "query">,
  command: ReceiptRefundCommand,
  commandSha256: string,
  actor: ReceiptRefundServiceActor,
): Promise<ReceiptRefundExecution | undefined> {
  const existing = await client.query<{
    canonical_payload: CanonicalValue;
    payload_sha256: string;
    result_entity_keys: CanonicalValue;
    target_fingerprint: string;
  }>(
    "SELECT canonical_payload,payload_sha256,result_entity_keys,target_fingerprint FROM public.business_operation_receipts WHERE operation_uid=$1::uuid FOR UPDATE",
    [command.operationUid],
  );
  if (existing.rowCount === 0) return undefined;
  if (existing.rowCount !== 1 || existing.rows[0].target_fingerprint !== actor.targetFingerprint) fail("receipt_refund_operation_uid_reuse");
  const payload = existing.rows[0].canonical_payload as Record<string, CanonicalValue>;
  const inputs = payload.inputs as Record<string, CanonicalValue> | undefined;
  const validated = validateBusinessOperationPayloadV2(existing.rows[0].canonical_payload);
  if (
    payload.command !== "receipt:refund" ||
    inputs?.command_sha256 !== commandSha256 ||
    validated.sha256 !== existing.rows[0].payload_sha256 ||
    !Array.isArray(payload.expected_results) ||
    canonicalJson(payload.expected_results) !== canonicalJson(existing.rows[0].result_entity_keys)
  ) fail("receipt_refund_operation_uid_reuse");
  return { executionOutcome: "verified_noop", payloadSha256: validated.sha256, resultCount: payload.expected_results.length };
}

export async function executeReceiptRefundOperation(
  pool: Pick<Pool, "connect">,
  command: ReceiptRefundCommand,
  actor: ReceiptRefundServiceActor,
): Promise<ReceiptRefundExecution> {
  validateCommand(command);
  if (!SHA256.test(actor.targetFingerprint)) fail("receipt_refund_target_invalid");
  const commandSha256 = sha256(canonicalJson(command as unknown as CanonicalValue));
  const input: ReceiptRefundWriteInput = {
    refundEventUid: command.refundEventUid,
    receiptUid: command.receiptUid,
    originalAllocationRequestUids: command.originalAllocationRequestUids,
    newAllocationRequestUids: command.newAllocationRequestUids,
    correctionReasonCode: command.correctionReasonCode,
    correctionEvidenceSha256: command.correctionEvidenceSha256,
    correctionEvidenceVerified: command.correctionEvidenceVerified,
    actor,
  };
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    const liveActor = await client.query<{ id: number; user_uid: string; name: string; is_admin: boolean }>(
      "SELECT id,user_uid::text,name,is_admin FROM public.users WHERE id=$1 FOR UPDATE",
      [actor.userId],
    );
    if (liveActor.rowCount !== 1 || liveActor.rows[0].user_uid !== actor.userUid || liveActor.rows[0].name !== actor.name || liveActor.rows[0].is_admin !== true) fail("receipt_refund_actor_binding_mismatch");
    const replay = await verifyReplay(client, command, commandSha256, actor);
    if (replay) {
      await client.query("COMMIT");
      return replay;
    }

    const prepared = await prepareReceiptRefund(client, input);
    const operationReceiptId = await reserve(client, "business_operation_receipts");
    const reservation = await reserveReceiptRefund(client, prepared, command.newAllocationRequestUids);
    const auditIds: string[] = [];
    for (let index = 0; index < prepared.allocations.length + 1; index += 1) auditIds.push(await reserve(client, "accounting_audit_events"));
    const projection = projectReceiptRefundOperation({
      operationUid: command.operationUid,
      commandSha256,
      receiptUid: command.receiptUid,
      refundEventUid: command.refundEventUid,
      correctionReasonCode: command.correctionReasonCode,
      correctionEvidenceSha256: command.correctionEvidenceSha256,
      operationReceiptId,
      reversalId: reservation.reversalId,
      allocationIds: command.newAllocationRequestUids.map((uid) => reservation.allocationIds.get(uid)!),
      allocationRequestUids: command.newAllocationRequestUids,
      auditIds,
    });
    const rootCorrelationUid = deterministicRoleUuid(`${command.operationUid}\nreceipt-refund\nroot`);
    await client.query(`INSERT INTO public.business_operation_receipts
      (id,action,actor_name_snapshot,actor_scope,actor_target_user_id,actor_target_user_id_snapshot,actor_uid_snapshot,actor_user_id,
       actor_user_id_snapshot,authorization_version,canonical_payload,entity_type,operation_uid,payload_sha256,recorded_at,result_entity_keys,
       root_correlation_uid,target_fingerprint)
      OVERRIDING SYSTEM VALUE VALUES
      ($1,'refund',$2,'admin',NULL,NULL,$3::uuid,$4,$4,$5,$6::jsonb,'receipt_refund',$7::uuid,$8,$9::timestamptz,$10::jsonb,$11::uuid,$12)`,
    [operationReceiptId, actor.name, actor.userUid, actor.userId, actor.authorizationVersion, projection.canonical,
      command.operationUid, projection.payloadSha256, prepared.refund.occurred_at,
      canonicalJson(projection.results as unknown as CanonicalValue), rootCorrelationUid, actor.targetFingerprint]);
    for (const result of projection.results) {
      await client.query(
        "INSERT INTO public.business_operation_entities (operation_uid,ordinal,entity_type,entity_key,entity_action,action_correlation_uid) VALUES ($1::uuid,$2,$3,$4,$5,$6::uuid)",
        [command.operationUid, result.ordinal, result.entity_type, result.entity_key, result.entity_action, result.action_correlation_uid],
      );
    }
    const correlations = new Map<string, string>([["reversal", projection.results[0].action_correlation_uid]]);
    command.newAllocationRequestUids.forEach((uid, index) => correlations.set(`allocation:${uid}`, projection.results[index + 1].action_correlation_uid));
    await executePreparedReceiptRefund(client, input, prepared, reservation, correlations);
    for (let index = 0; index < projection.results.length; index += 1) {
      const result = projection.results[index];
      const allocationIndex = index - 1;
      const after = index === 0
        ? { amount: prepared.refund.amount, status: "approved" }
        : {
            amount: prepared.allocations[allocationIndex].amount,
            correction_reason_code_or_null: prepared.plans[allocationIndex].correctionReasonCode,
            effective_at: prepared.plans[allocationIndex].effectiveAt,
            rights_effect_mode: prepared.plans[allocationIndex].rightsEffectMode,
            status: "approved",
          };
      await client.query(`INSERT INTO public.accounting_audit_events
        (id,event_uid,entity_type,entity_key,action,before_json,after_json,effective_at,recorded_at,reason_code,actor_user_id,
         actor_uid_snapshot,actor_name_snapshot,actor_scope,actor_at,correlation_uid,actor_authorization_version)
        OVERRIDING SYSTEM VALUE VALUES
        ($1,$2::uuid,$3,$4,$5,NULL,$6::jsonb,$7::timestamptz,$7::timestamptz,$8,$9,$10::uuid,$11,'admin',$7::timestamptz,$12::uuid,$13)`,
      [auditIds[index], deterministicRoleUuid(`${command.operationUid}\nreceipt-refund\naudit\n${result.ordinal}`), result.entity_type,
        result.entity_key, result.entity_action, canonicalJson(after as unknown as CanonicalValue), prepared.refund.occurred_at,
        `audit/${result.entity_type}/approve`, actor.userId, actor.userUid, actor.name, result.action_correlation_uid,
        actor.authorizationVersion]);
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
