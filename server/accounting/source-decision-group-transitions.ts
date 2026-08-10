import type { PoolClient } from "pg";
import type { GroupExecutionReservation } from "./source-decision-group-materialization";
import type { GroupMultiBatchApplyPlan } from "./source-decision-group-plan";
import type { GroupMaterializationActor } from "./source-decision-group-source-spine";

function fail(code:string):never{throw new Error(code);}
export async function executeGroupBatchTransitions(client:Pick<PoolClient,"query">,plan:GroupMultiBatchApplyPlan,reservation:GroupExecutionReservation,actor:GroupMaterializationActor,decidedAt:string):Promise<void>{
  const bindings=plan.resolvedBindings;if(!bindings?.batchIdsByUid||!bindings.decisionSetIdsByUid)fail("source_decision_group_transition_binding_missing");
  for(const decisionSetUid of plan.orderedDecisionSetUids){
    const action=reservation.transitionAudits.find((candidate)=>candidate.key===`decision-set:${decisionSetUid}:approve`);const id=bindings.decisionSetIdsByUid[decisionSetUid];if(!action||!id)fail("source_decision_group_transition_binding_missing");
    const updated=await client.query(`UPDATE public.source_decision_sets SET status='approved',approval_actor_at=$1::timestamptz,approval_actor_authorization_version=$2,approval_actor_correlation_uid=$3::uuid,approval_actor_name_snapshot=$4,approval_actor_scope='admin',approval_actor_uid_snapshot=$5::uuid,approval_actor_user_id=$6 WHERE id=$7 AND status='previewed'`,[decidedAt,actor.authorizationVersion,action.correlationUid,actor.name,actor.userUid,actor.userId,id]);if(updated.rowCount!==1)fail("source_decision_group_transition_state_drift");
  }
  for(const batchUid of plan.orderedBatchUids){
    const action=reservation.transitionAudits.find((candidate)=>candidate.key===`batch:${batchUid}:apply`);const id=bindings.batchIdsByUid[batchUid];if(!action||!id)fail("source_decision_group_transition_binding_missing");
    const updated=await client.query(`UPDATE public.accounting_import_batches SET status='applied',applied_at=$1::timestamptz,apply_actor_at=$1::timestamptz,apply_actor_authorization_version=$2,apply_actor_correlation_uid=$3::uuid,apply_actor_name_snapshot=$4,apply_actor_scope='admin',apply_actor_uid_snapshot=$5::uuid,apply_actor_user_id=$6 WHERE id=$7 AND status='previewed'`,[decidedAt,actor.authorizationVersion,action.correlationUid,actor.name,actor.userUid,actor.userId,id]);if(updated.rowCount!==1)fail("source_decision_group_transition_state_drift");
  }
}
