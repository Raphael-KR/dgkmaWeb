import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { SourceDecisionActor } from "./source-decision-service";
import type { ResolvedLegacyMaterializationRow } from "./legacy-payment-discovery";
import type { LegacyMaterializationKind } from "./legacy-payment-materialization";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";

type Json = Record<string, CanonicalValue>;
type Action = { paymentId: number; kind: LegacyMaterializationKind; result: Json; rowId: string; auditId: string; auditEventUid: string; correlationUid: string; table: string; entityType: string; action: string; scope: "admin" | "migration_admin" };
export type LegacyMaterializationReservation = { actions: Action[]; results: Json[]; slots: Json[] };

function fail(code: string): never { throw new Error(code); }
async function reserve(client: Pick<PoolClient, "query">, table: string): Promise<string> { return (await client.query<{ id: string }>("SELECT nextval(pg_get_serial_sequence($1,'id'))::text id", [`public.${table}`])).rows[0].id; }
function actor(actorValue: SourceDecisionActor, at: string, correlationUid: string) { return [at, actorValue.authorizationVersion, correlationUid, actorValue.name, actorValue.userUid, actorValue.userId] as const; }

const SPEC: Record<LegacyMaterializationKind, { table: string; entityType: string; action: string; createsRow: boolean; scope: "admin" | "migration_admin" }> = {
  "claim:open": { table: "economic_event_claims", entityType: "event_claim", action: "create", createsRow: true, scope: "migration_admin" },
  "event:create": { table: "economic_events", entityType: "economic_event", action: "create", createsRow: true, scope: "migration_admin" },
  "claim:bind": { table: "economic_event_claims", entityType: "event_claim", action: "bind", createsRow: true, scope: "migration_admin" },
  "provenance:create": { table: "economic_event_provenance", entityType: "event_provenance", action: "create", createsRow: true, scope: "migration_admin" },
  "authority:select": { table: "economic_event_authority_decisions", entityType: "event_authority_decision", action: "select", createsRow: true, scope: "migration_admin" },
  "decision:terminal": { table: "legacy_payment_decisions", entityType: "legacy_payment_decision", action: "create", createsRow: true, scope: "migration_admin" },
  "cashbook:create": { table: "cashbook_entries", entityType: "cashbook_entry", action: "create", createsRow: true, scope: "admin" },
  "receipt:create": { table: "dues_receipts", entityType: "receipt", action: "create", createsRow: true, scope: "admin" },
  "allocation:create": { table: "dues_allocations", entityType: "allocation", action: "create", createsRow: true, scope: "admin" },
  "cashbook:approve": { table: "cashbook_entries", entityType: "cashbook_entry", action: "approve", createsRow: false, scope: "admin" },
  "receipt:approve": { table: "dues_receipts", entityType: "receipt", action: "approve", createsRow: false, scope: "admin" },
  "allocation:approve": { table: "dues_allocations", entityType: "allocation", action: "approve", createsRow: false, scope: "admin" },
  "event:approve": { table: "economic_events", entityType: "economic_event", action: "approve", createsRow: false, scope: "admin" },
};

function key(row: ResolvedLegacyMaterializationRow, kind: LegacyMaterializationKind): string {
  if (kind.startsWith("claim:")) return `legacy-claim:${row.row.paymentId}:${kind.split(":")[1]}`;
  if (kind.startsWith("event:")) return `event:${row.projection.createdEventUidOrNull ?? row.projection.candidateEventUidOrNull}`;
  if (kind === "provenance:create") return `event-provenance:legacy:${row.row.paymentId}`;
  if (kind === "authority:select") return `event-authority:${row.projection.createdEventUidOrNull}:1`;
  if (kind === "decision:terminal") return `legacy-decision:${row.row.paymentId}:1`;
  if (kind.startsWith("cashbook:")) return `cashbook:legacy:${row.row.paymentId}`;
  if (kind.startsWith("receipt:")) return `receipt:legacy:${row.row.paymentId}`;
  return `allocation:legacy:${row.row.paymentId}`;
}

export async function reserveLegacyMaterialization(client: Pick<PoolClient, "query">, rows: ResolvedLegacyMaterializationRow[], startOrdinal = 1): Promise<LegacyMaterializationReservation> {
  const actions: Action[] = []; const results: Json[] = []; const slots: Json[] = []; const createdIds = new Map<string, string>(); let ordinal = startOrdinal;
  for (const row of rows) for (const step of row.steps) {
    const spec = SPEC[step.kind]; const identity = `${row.row.paymentId}:${spec.table}`;
    const rowId = spec.createsRow ? await reserve(client, spec.table) : createdIds.get(identity) ?? fail("legacy_materialization_parent_reservation_missing");
    if (spec.createsRow && !createdIds.has(identity)) createdIds.set(identity, rowId);
    const correlationUid = randomUUID(); const auditId = await reserve(client, "accounting_audit_events"); const result = { ordinal, entity_type: spec.entityType, entity_key: key(row, step.kind), entity_action: spec.action, action_correlation_uid: correlationUid } as Json;
    results.push(result); actions.push({ paymentId: row.row.paymentId, kind: step.kind, result, rowId, auditId, auditEventUid: randomUUID(), correlationUid, table: spec.table, entityType: spec.entityType, action: spec.action, scope: spec.scope });
    if (spec.createsRow) slots.push({ local_ordinal: ordinal, phase: 10, qualified_table_name: `public.${spec.table}`, reserved_id: rowId, result_ordinal: ordinal, slot_kind: "business_row", slot_kind_order: 10 });
    slots.push({ local_ordinal: ordinal, phase: 30, qualified_table_name: "public.accounting_audit_events", reserved_id: auditId, result_ordinal: ordinal, slot_kind: "audit_row", slot_kind_order: 30 }); ordinal += 1;
  }
  return { actions, results, slots };
}

function action(reservation: LegacyMaterializationReservation, paymentId: number, kind: LegacyMaterializationKind): Action { return reservation.actions.find((entry) => entry.paymentId === paymentId && entry.kind === kind) ?? fail(`legacy_materialization_action_missing:${kind}`); }

export async function executeLegacyMaterialization(client: Pick<PoolClient, "query">, rows: ResolvedLegacyMaterializationRow[], reservation: LegacyMaterializationReservation, actorValue: SourceDecisionActor, at: string, batchId: string): Promise<void> {
  for (const row of rows) {
    const paymentId = row.row.paymentId; const amount = row.row.amountParse.sourceAmountSignedOrNull; const occurredAt = row.row.createdAt;
    if (row.projection.decision !== "ineligible") {
      if (!row.memberId || !row.candidateKey || !amount || !occurredAt) fail("legacy_materialization_eligible_binding_missing");
      const open = action(reservation, paymentId, "claim:open");
      const claimUid = randomUUID();
      await client.query(`INSERT INTO public.economic_event_claims (id,amount,candidate_key,claim_actor_at,claim_actor_authorization_version,claim_actor_correlation_uid,claim_actor_name_snapshot,claim_actor_scope,claim_actor_uid_snapshot,claim_actor_user_id,claim_uid,coordinate_id,created_at,direction,dues_year,effective_at,event_id,event_party_id,member_id,occurred_date_kst,party_kind,source_row_version_id,state,supersedes_id,version) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4::timestamptz,$5,$6::uuid,$7,'migration_admin',$8::uuid,$9,$10::uuid,$11,$4::timestamptz,'credit',$12,$4::timestamptz,NULL,NULL,$13,$14::date,'member',$15,'open',NULL,1)`, [open.rowId, amount, row.candidateKey, ...actor(actorValue, at, open.correlationUid), claimUid, row.coordinateId, row.row.year, row.memberId, occurredAt.slice(0,10), row.rowVersionId]);
      let eventId = row.candidateEventId;
      if (row.projection.decision === "new_compatibility_event") {
        const event = action(reservation, paymentId, "event:create"); eventId = event.rowId;
        await client.query(`INSERT INTO public.economic_events (id,amount,direction,dues_year,event_kind,event_uid,occurred_at,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,reverses_event_id,status) OVERRIDING SYSTEM VALUE VALUES ($1,$2,'credit',$3,'legacy_compatibility',$4::uuid,$5::timestamptz,$6::timestamptz,$7,$8::uuid,$9,'migration_admin',$10::uuid,$11,NULL,'proposed')`, [event.rowId, amount, row.row.year, row.createdEventUid, occurredAt, ...actor(actorValue, at, event.correlationUid)]);
      }
      if (!eventId) fail("legacy_materialization_event_binding_missing");
      const bound = action(reservation, paymentId, "claim:bind");
      await client.query(`INSERT INTO public.economic_event_claims (id,amount,candidate_key,claim_uid,coordinate_id,created_at,decision_actor_at,decision_actor_authorization_version,decision_actor_correlation_uid,decision_actor_name_snapshot,decision_actor_scope,decision_actor_uid_snapshot,decision_actor_user_id,direction,dues_year,effective_at,event_id,event_party_id,member_id,occurred_date_kst,party_kind,source_row_version_id,state,supersedes_id,version) OVERRIDING SYSTEM VALUE SELECT $1,amount,candidate_key,claim_uid,coordinate_id,created_at,$2::timestamptz,$3,$4::uuid,$5,'migration_admin',$6::uuid,$7,direction,dues_year,$2::timestamptz,$8,event_party_id,member_id,occurred_date_kst,party_kind,source_row_version_id,'bound',id,2 FROM public.economic_event_claims WHERE id=$9`, [bound.rowId, ...actor(actorValue, at, bound.correlationUid), eventId, open.rowId]);
      const provenance = action(reservation, paymentId, "provenance:create"); const eventUid = row.projection.createdEventUidOrNull ?? row.projection.candidateEventUidOrNull!; const evidenceRole = row.projection.decision === "cross_link" ? "supporting" : "authority_candidate"; const evidenceDigest = sha256(canonicalJson({ digest_version:"event-provenance-v1", event_uid:eventUid, source_row_content_digest:row.row.sourceContentDigest, evidence_role:evidenceRole, authority_rank_snapshot:200, normalization_version:"legacy-payments-v3@3.0.0" } as CanonicalValue));
      await client.query(`INSERT INTO public.economic_event_provenance (id,authority_rank_snapshot,event_id,evidence_digest,evidence_role,normalization_version,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,source_row_version_id) OVERRIDING SYSTEM VALUE VALUES ($1,200,$2,$3,$4,'legacy-payments-v3@3.0.0',$5::timestamptz,$6,$7::uuid,$8,'migration_admin',$9::uuid,$10,$11)`, [provenance.rowId, eventId, evidenceDigest, evidenceRole, ...actor(actorValue, at, provenance.correlationUid), row.rowVersionId]);
      if (row.projection.decision === "new_compatibility_event") {
        const authority = action(reservation, paymentId, "authority:select");
        await client.query(`INSERT INTO public.economic_event_authority_decisions (id,decision_actor_at,decision_actor_authorization_version,decision_actor_correlation_uid,decision_actor_name_snapshot,decision_actor_scope,decision_actor_uid_snapshot,decision_actor_user_id,decision_kind,effective_at,event_id,reason_code,selected_provenance_id,supersedes_id,version) OVERRIDING SYSTEM VALUE VALUES ($1,$2::timestamptz,$3,$4::uuid,$5,'migration_admin',$6::uuid,$7,'select',$2::timestamptz,$8,'HIGHEST_AUTHORITY_SELECTED',$9,NULL,1)`, [authority.rowId, ...actor(actorValue, at, authority.correlationUid), eventId, provenance.rowId]);
      }
    }
    const decision = action(reservation, paymentId, "decision:terminal");
    await client.query(`INSERT INTO public.legacy_payment_decisions (id,candidate_event_id,created_event_id,decision,decision_actor_at,decision_actor_authorization_version,decision_actor_correlation_uid,decision_actor_name_snapshot,decision_actor_scope,decision_actor_uid_snapshot,decision_actor_user_id,decision_key,effective_at,legacy_payment_id,member_id,preview_batch_id,reason_code,supersedes_id,timezone_snapshot,version) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,$5::timestamptz,$6,$7::uuid,$8,'migration_admin',$9::uuid,$10,$11,$5::timestamptz,$12,$13,$14,$15,NULL,$16,1)`, [decision.rowId, row.candidateEventId, row.projection.decision === "new_compatibility_event" ? action(reservation,paymentId,"event:create").rowId : null, row.projection.decision, ...actor(actorValue, at, decision.correlationUid), row.decisionKey, paymentId, row.memberId, batchId, row.projection.reasonCode, row.projection.timezoneSnapshot]);
    if (row.projection.decision === "new_compatibility_event") {
      if (!amount || !row.memberId || !row.categoryId || !row.categoryLabel || !row.periodId || !occurredAt) fail("legacy_materialization_financial_binding_missing");
      const event = action(reservation,paymentId,"event:create"); const cash = action(reservation,paymentId,"cashbook:create"); const receipt = action(reservation,paymentId,"receipt:create"); const allocation = action(reservation,paymentId,"allocation:create"); const receiptUid=randomUUID(); const requestUid=randomUUID();
      await client.query(`INSERT INTO public.cashbook_entries (id,amount,category_id,category_label_snapshot,corrects_entry_id,description_digest,direction,event_id,period_id,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,status) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,NULL,$5,'credit',$6,$7,$8::timestamptz,$9,$10::uuid,$11,'admin',$12::uuid,$13,'draft')`, [cash.rowId,amount,row.categoryId,row.categoryLabel,sha256(`legacy-payment:${paymentId}`),event.rowId,row.periodId,...actor(actorValue,at,cash.correlationUid)]);
      await client.query(`INSERT INTO public.dues_receipts (id,decision_item_id,event_id,gross_amount,legacy_decision_id,receipt_uid,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,status) OVERRIDING SYSTEM VALUE VALUES ($1,NULL,$2,$3,$4,$5::uuid,$6::timestamptz,$7,$8::uuid,$9,'admin',$10::uuid,$11,'proposed')`, [receipt.rowId,event.rowId,amount,decision.rowId,receiptUid,...actor(actorValue,at,receipt.correlationUid)]);
      await client.query(`INSERT INTO public.dues_allocations (id,allocation_kind,amount,assessment_id,correction_group_uid,correction_kind,correction_reason_code,decision_item_id,dues_year,effect_kind,effective_at,funding_event_id,group_member_id,legacy_decision_id,member_id,receipt_id,receipt_reversal_id,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,recorded_at,request_uid,reverses_allocation_id,rights_effect_mode,status) OVERRIDING SYSTEM VALUE VALUES ($1,'dues',$2,NULL,NULL,NULL,NULL,NULL,$3,'payment',$4::timestamptz,NULL,NULL,$5,$6,$7,NULL,$8::timestamptz,$9,$10::uuid,$11,'admin',$12::uuid,$13,$8::timestamptz,$14::uuid,NULL,'immediate_positive','proposed')`, [allocation.rowId,amount,row.row.year,occurredAt,decision.rowId,row.memberId,receipt.rowId,...actor(actorValue,at,allocation.correlationUid),requestUid]);
      for (const [kind,id,table] of [["cashbook:approve",cash.rowId,"cashbook_entries"],["receipt:approve",receipt.rowId,"dues_receipts"],["allocation:approve",allocation.rowId,"dues_allocations"],["event:approve",event.rowId,"economic_events"]] as const) { const approval=action(reservation,paymentId,kind); await client.query(`UPDATE public.${table} SET status='approved',approval_actor_at=$1::timestamptz,approval_actor_authorization_version=$2,approval_actor_correlation_uid=$3::uuid,approval_actor_name_snapshot=$4,approval_actor_scope='admin',approval_actor_uid_snapshot=$5::uuid,approval_actor_user_id=$6 WHERE id=$7`, [...actor(actorValue,at,approval.correlationUid),id]); }
    }
  }
  for (const entry of reservation.actions) await client.query(`INSERT INTO public.accounting_audit_events (id,event_uid,entity_type,entity_key,action,before_json,after_json,effective_at,recorded_at,reason_code,actor_user_id,actor_uid_snapshot,actor_name_snapshot,actor_scope,actor_at,correlation_uid,actor_authorization_version) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,$3,$4,$5,NULL,$6::jsonb,$7::timestamptz,$7::timestamptz,$8,$9,$10::uuid,$11,$12,$7::timestamptz,$13::uuid,$14)`, [entry.auditId,entry.auditEventUid,entry.entityType,String(entry.result.entity_key),entry.action,canonicalJson({id:entry.rowId} as CanonicalValue),at,`TODO19_LEGACY_${entry.entityType.toUpperCase()}`,actorValue.userId,actorValue.userUid,actorValue.name,entry.scope,entry.correlationUid,actorValue.authorizationVersion]);
}
