import type { PoolClient } from "pg";
import { planReceiptRefund, type RefundCorrectionReason } from "./refund-activation-contract";
import type { AnnualActivationActor } from "./annual-policy-activation-write";

type OriginalReceipt = { id:string; event_id:string; gross_amount:string; status:string };
type OriginalAllocation = { id:string; request_uid:string; amount:string; allocation_kind:"dues"|"special_assessment"; assessment_id:string|null; dues_year:number; effective_at:string; group_member_id:string|null; member_id:string; receipt_id:string; status:string };
type RefundEvent = { id:string; event_uid:string; amount:string; occurred_at:string; direction:string; status:string; reverses_event_id:string|null; bound_claims:number; bank_transactions:number };

export type ReceiptRefundWriteResult = Readonly<{
  reversalId:string;
  allocationIds:readonly string[];
  effectiveTimes:readonly string[];
  rightsEffectMode:"next_month_negative"|"retroactive_error";
}>;

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA=/^[0-9a-f]{64}$/;
function fail(code:string):never{throw new Error(code);}function compare(a:string,b:string){return Buffer.compare(Buffer.from(a),Buffer.from(b));}
async function reserve(client:Pick<PoolClient,"query">,table:"dues_receipt_reversals"|"dues_allocations"){const result=await client.query<{id:string}>("SELECT nextval(pg_get_serial_sequence($1,'id'))::text id",[`public.${table}`]);if(result.rowCount!==1||!/^[1-9][0-9]*$/.test(result.rows[0].id))fail("receipt_refund_reservation_failed");return result.rows[0].id;}
function actorValues(actor:AnnualActivationActor,at:string){return[at,actor.authorizationVersion,actor.userUid,actor.name,actor.userId] as const;}

/** Materializes only the reversal/allocation tail of a refund operation. The
 * caller must already have created and locked the source-bound refund event,
 * and owns the surrounding SERIALIZABLE receipt/audit transaction. */
export async function materializeReceiptRefund(client:Pick<PoolClient,"query">,input:Readonly<{
  refundEventUid:string;receiptUid:string;originalAllocationRequestUids:readonly string[];
  newAllocationRequestUids:readonly string[];correctionReasonCode:RefundCorrectionReason;
  correctionEvidenceSha256:string|null;correctionEvidenceVerified:boolean;actor:AnnualActivationActor;
}>):Promise<ReceiptRefundWriteResult>{
  if(!UUID.test(input.refundEventUid)||!UUID.test(input.receiptUid)||input.originalAllocationRequestUids.length===0||input.originalAllocationRequestUids.length!==input.newAllocationRequestUids.length)fail("receipt_refund_input_invalid");
  for(const values of [input.originalAllocationRequestUids,input.newAllocationRequestUids])if(values.some((value)=>!UUID.test(value))||new Set(values).size!==values.length||[...values].sort(compare).join()!==values.join())fail("receipt_refund_allocation_uid_order_invalid");
  if(input.correctionReasonCode===null?(input.correctionEvidenceSha256!==null||input.correctionEvidenceVerified):(input.correctionEvidenceSha256===null||!SHA.test(input.correctionEvidenceSha256)||!input.correctionEvidenceVerified))fail("receipt_refund_correction_evidence_invalid");
  const isolation=await client.query<{transaction_isolation:string}>("SELECT current_setting('transaction_isolation') transaction_isolation");if(isolation.rowCount!==1||isolation.rows[0].transaction_isolation!=="serializable")fail("receipt_refund_serializable_required");
  const actor=await client.query<{id:number;user_uid:string;name:string;is_admin:boolean}>("SELECT id,user_uid::text,name,is_admin FROM public.users WHERE id=$1 FOR UPDATE",[input.actor.userId]);if(actor.rowCount!==1||actor.rows[0].user_uid!==input.actor.userUid||actor.rows[0].name!==input.actor.name||actor.rows[0].is_admin!==true)fail("receipt_refund_actor_binding_mismatch");
  const receipt=await client.query<OriginalReceipt>(`SELECT receipt.id::text,receipt.event_id::text,receipt.gross_amount::text,receipt.status
    FROM public.dues_receipts receipt WHERE receipt.receipt_uid=$1::uuid FOR UPDATE`,[input.receiptUid]);if(receipt.rowCount!==1||receipt.rows[0].status!=="approved")fail("receipt_refund_original_receipt_missing");
  const allocations=await client.query<OriginalAllocation>(`SELECT id::text,request_uid::text,amount::text,allocation_kind,assessment_id::text,dues_year,effective_at::text,
    group_member_id::text,member_id::text,receipt_id::text,status FROM public.dues_allocations
    WHERE request_uid=ANY($1::uuid[]) ORDER BY request_uid FOR UPDATE`,[input.originalAllocationRequestUids]);
  if(allocations.rowCount!==input.originalAllocationRequestUids.length||allocations.rows.some((row,index)=>row.request_uid!==input.originalAllocationRequestUids[index]||row.receipt_id!==receipt.rows[0].id||row.status!=="approved"))fail("receipt_refund_original_allocation_missing");
  const event=await client.query<RefundEvent>(`SELECT event.id::text,event.event_uid::text,event.amount::text,event.occurred_at::text,event.direction,event.status,event.reverses_event_id::text,
    (SELECT count(*)::int FROM public.economic_event_claims claim WHERE claim.event_id=event.id AND claim.state='bound') bound_claims,
    (SELECT count(*)::int FROM public.bank_transactions bank WHERE bank.event_id=event.id) bank_transactions
    FROM public.economic_events event WHERE event.event_uid=$1::uuid FOR UPDATE`,[input.refundEventUid]);
  const refund=event.rows[0];const total=allocations.rows.reduce((sum,row)=>sum+BigInt(row.amount),0n);if(event.rowCount!==1||refund.direction!=="debit"||refund.status!=="proposed"||refund.reverses_event_id!==receipt.rows[0].event_id||refund.bound_claims!==1||refund.bank_transactions!==1||BigInt(refund.amount)!==total)fail("receipt_refund_event_binding_mismatch");
  const plans=allocations.rows.map((row)=>planReceiptRefund({observedAt:refund.occurred_at,originalEffectiveAt:row.effective_at,correctionReasonCode:input.correctionReasonCode,correctionEvidenceSha256:input.correctionEvidenceSha256,originalReceiptBound:true,originalAllocationBound:true,boundClaim:true,bankTransactionBound:true,reversesOriginalEvent:true}));
  const reversalId=await reserve(client,"dues_receipt_reversals");const allocationIds=[];for(let index=0;index<allocations.rows.length;index++)allocationIds.push(await reserve(client,"dues_allocations"));const at=refund.occurred_at;
  await client.query(`INSERT INTO public.dues_receipt_reversals (id,amount,reason_code,receipt_id,refund_event_id,status,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_user_id,recorded_actor_correlation_uid) OVERRIDING SYSTEM VALUE VALUES ($1,$2,'BANK_DUES_REFUND',$3,$4,'proposed',$5::timestamptz,$6,$7::uuid,$8,'admin',$9,gen_random_uuid())`,[reversalId,refund.amount,receipt.rows[0].id,refund.id,...actorValues(input.actor,at)]);
  for(let index=0;index<allocations.rows.length;index++){const original=allocations.rows[index],plan=plans[index];await client.query(`INSERT INTO public.dues_allocations (id,allocation_kind,amount,assessment_id,correction_group_uid,correction_kind,correction_reason_code,decision_item_id,dues_year,effect_kind,effective_at,funding_event_id,group_member_id,legacy_decision_id,member_id,receipt_id,receipt_reversal_id,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_user_id,recorded_actor_correlation_uid,recorded_at,request_uid,reverses_allocation_id,rights_effect_mode,status) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,NULL,NULL,$5,NULL,$6,'refund',$7::timestamptz,$8,$9,NULL,$10,$11,$12,$13::timestamptz,$14,$15::uuid,$16,'admin',$17,gen_random_uuid(),$13::timestamptz,$18::uuid,$19,$20,'proposed')`,[allocationIds[index],original.allocation_kind,original.amount,original.assessment_id,plan.correctionReasonCode,original.dues_year,plan.effectiveAt,refund.id,original.group_member_id,original.member_id,receipt.rows[0].id,reversalId,...actorValues(input.actor,at),input.newAllocationRequestUids[index],original.id,plan.rightsEffectMode]);}
  for(const id of allocationIds)await client.query(`UPDATE public.dues_allocations SET status='approved',approval_actor_at=$1::timestamptz,approval_actor_authorization_version=$2,approval_actor_uid_snapshot=$3::uuid,approval_actor_name_snapshot=$4,approval_actor_scope='admin',approval_actor_user_id=$5,approval_actor_correlation_uid=gen_random_uuid() WHERE id=$6`,[...actorValues(input.actor,at),id]);
  await client.query(`UPDATE public.dues_receipt_reversals SET status='approved',approval_actor_at=$1::timestamptz,approval_actor_authorization_version=$2,approval_actor_uid_snapshot=$3::uuid,approval_actor_name_snapshot=$4,approval_actor_scope='admin',approval_actor_user_id=$5,approval_actor_correlation_uid=gen_random_uuid() WHERE id=$6`,[...actorValues(input.actor,at),reversalId]);
  return{reversalId,allocationIds,effectiveTimes:plans.map((plan)=>plan.effectiveAt),rightsEffectMode:plans[0].rightsEffectMode};
}
