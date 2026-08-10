import type { PoolClient } from "pg";
import { canonicalJson } from "./source-contracts";
import type { GroupExecutionReservation } from "./source-decision-group-materialization";
import type { GroupMultiBatchApplyPlan } from "./source-decision-group-plan";
import type { GroupMaterializationActor } from "./source-decision-group-source-spine";

function fail(code:string):never{throw new Error(code);}
export async function insertGroupMaterializationAudits(client:Pick<PoolClient,"query">,plan:GroupMultiBatchApplyPlan,reservation:GroupExecutionReservation,actor:GroupMaterializationActor,decidedAt:string):Promise<void>{
  const bindings=plan.resolvedBindings;if(!bindings?.batchIdsByUid||!bindings.decisionSetIdsByUid)fail("source_decision_group_audit_binding_missing");
  const actions=[...reservation.transitionAudits,...reservation.steps].sort((left,right)=>left.executionOrdinal-right.executionOrdinal);
  for(const action of actions){let rowId:string;if(action.key.startsWith("decision-set:")){const uid=action.key.slice(13,-8);rowId=bindings.decisionSetIdsByUid[uid];}else if(action.key.startsWith("batch:")){const uid=action.key.slice(6,-6);rowId=bindings.batchIdsByUid[uid];}else{const value=reservation.steps.find((step)=>step.key===action.key);rowId=value?.rowId??"";}if(!rowId)fail("source_decision_group_audit_binding_missing");
    const inserted=await client.query(`INSERT INTO public.accounting_audit_events (id,entity_type,entity_key,action,before_json,after_json,effective_at,recorded_at,reason_code,actor_user_id,actor_uid_snapshot,actor_name_snapshot,actor_scope,actor_at,correlation_uid,actor_authorization_version) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,NULL,$5::jsonb,$6::timestamptz,$6::timestamptz,$7,$8,$9::uuid,$10,'admin',$6::timestamptz,$11::uuid,$12)`,[action.auditId,action.entityType,action.entityKey,action.action,canonicalJson({id:rowId}),decidedAt,`audit/${action.entityType}/${action.action}`,actor.userId,actor.userUid,actor.name,action.correlationUid,actor.authorizationVersion]);if(inserted.rowCount!==1)fail("source_decision_group_audit_insert_failed");
  }
}
