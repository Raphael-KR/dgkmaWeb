import { createTargetPool, resolveDevelopmentTarget, shutdownPool, verifyDevelopmentTarget } from "../server/db-target";
import { BUSINESS_REASON_TUPLES } from "../server/accounting/business-reason-contract";
import { canonicalJson, type CanonicalValue } from "../server/accounting/source-contracts";

function fail(code: string): never { throw new Error(code); }

const TRANSITION_INVALID_SQL: Readonly<Record<string,string>>={
  mutable_entity_action_history:`NOT CASE WHEN action='end' THEN reason_code='MEMBER_ENDED' WHEN action='reactivate' THEN reason_code='MEMBER_REACTIVATED' WHEN action='correct' AND mutation_actor_scope='admin' THEN reason_code='MEMBER_IDENTITY_CORRECTED' WHEN action='correct' AND mutation_actor_scope='member_self' THEN reason_code='ACCOUNT_DELETE_UNLINK' WHEN action='reconcile' THEN reason_code='PERIOD_RECONCILE_REQUESTED' WHEN action='close' THEN reason_code='PERIOD_CLOSE_APPROVED' WHEN action='reopen' THEN reason_code='PERIOD_REOPEN_APPROVED' ELSE false END`,
  member_match_cases:`NOT CASE WHEN supersedes_id IS NULL AND status='unmatched' THEN reason_code IN ('SOURCE_MATCH_REQUIRED','MANUAL_MATCH_REQUIRED','NAME_ONLY_UNAPPROVABLE','NO_CANDIDATE') WHEN supersedes_id IS NULL AND status='candidate' THEN reason_code IN ('SOURCE_MATCH_REQUIRED','MANUAL_MATCH_REQUIRED','MULTIPLE_CANDIDATES') WHEN supersedes_id IS NOT NULL AND decision_actor_correlation_uid IS NOT NULL AND status='approved' THEN reason_code='MATCH_APPROVED' WHEN supersedes_id IS NOT NULL AND decision_actor_correlation_uid IS NOT NULL AND status='rejected' THEN reason_code='MATCH_REJECTED' WHEN supersedes_id IS NOT NULL AND supersede_actor_correlation_uid IS NOT NULL THEN reason_code='MATCH_SUPERSEDED' ELSE false END`,
  member_identity_link_history:`NOT CASE WHEN operation='link' THEN reason_code='IDENTITY_LINKED' WHEN operation='correct' THEN reason_code='IDENTITY_CORRECTED' WHEN operation='unlink_user' AND decision_actor_scope='admin' THEN reason_code='IDENTITY_USER_UNLINKED' WHEN operation='unlink_user' AND decision_actor_scope='member_self' THEN reason_code='ACCOUNT_DELETE_UNLINK' WHEN operation='unlink_all' THEN reason_code='IDENTITY_ALL_UNLINKED' ELSE false END`,
  economic_event_authority_decisions:`NOT CASE WHEN decision_kind='select' THEN reason_code='HIGHEST_AUTHORITY_SELECTED' WHEN decision_kind='supersede' THEN reason_code='HIGHER_AUTHORITY_SUPERSEDED' WHEN decision_kind='quarantine' THEN reason_code IN ('AUTHORITY_TIE_QUARANTINED','AUTHORITY_INVALID_QUARANTINED') ELSE false END`,
  economic_event_canonicalizations:`reason_code<>'CHILDLESS_DUPLICATE_CANONICALIZED'`,
  economic_event_collisions:`NOT CASE WHEN supersedes_id IS NULL AND status='open' THEN reason_code IN ('POTENTIAL_DUPLICATE_OPEN','COLLISION_REVIEW_REQUIRED') WHEN supersedes_id IS NOT NULL AND status='open' THEN reason_code='COLLISION_REVIEW_REQUIRED' WHEN supersedes_id IS NOT NULL AND status='resolved' THEN reason_code='CHILDLESS_DUPLICATE_RESOLVED' ELSE false END`,
  legacy_payment_decisions:`NOT CASE WHEN decision='ineligible' THEN reason_code IN ('LEGACY_USER_NULL','LEGACY_AMOUNT_INVALID','LEGACY_AMOUNT_NONPOSITIVE','LEGACY_YEAR_OUT_OF_RANGE','LEGACY_TYPE_NOT_ANNUAL_DUES','LEGACY_STATUS_NOT_COMPLETED','LEGACY_CREATED_AT_NULL','LEGACY_DATA_EXCEPTION_OPEN') WHEN decision='review' THEN reason_code IN ('LEGACY_TIMEZONE_UNRESOLVED','LEGACY_EVIDENCE_AMBIGUOUS') WHEN decision='quarantine' THEN reason_code IN ('LEGACY_IDENTITY_AMBIGUOUS','LEGACY_EVIDENCE_AMBIGUOUS') WHEN decision='cross_link' THEN reason_code='LEGACY_CROSS_LINK_MATCHED' WHEN decision='new_compatibility_event' THEN reason_code='LEGACY_COMPATIBILITY_EVENT_CREATED' ELSE false END`,
  dues_receipt_reversals:`reason_code<>'BANK_DUES_REFUND'`,
};
const TRANSITION_TRIGGERS=["dues_receipt_reversals__business_reason_transition_v1","economic_event_authority_decisions__business_reason__87a9478ac7","economic_event_canonicalizations__business_reason_transition_v1","economic_event_collisions__business_reason_transition_v1","legacy_payment_decisions__business_reason_transition_v1","member_identity_link_history__business_reason_transition_v1","member_match_cases__business_reason_transition_v1","mutable_entity_action_history__business_reason_transition_v1"];

async function main(): Promise<void> {
  if (process.argv.join(" ") !== `${process.argv[0]} ${process.argv[1]} --target development`) fail("business_reason_preflight_arguments_invalid");
  const resolved=resolveDevelopmentTarget(process.env,"migration");const pool=createTargetPool(resolved);
  try {
    const target=await verifyDevelopmentTarget(pool,resolved);
    await pool.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    try {
      const registry=[...new Set(BUSINESS_REASON_TUPLES.map((tuple)=>tuple.table))].sort().map((table)=>({table,reasonCodes:[...new Set(BUSINESS_REASON_TUPLES.filter((tuple)=>tuple.table===table).map((tuple)=>tuple.reasonCode))].sort()}));
      const invalidCounts:Record<string,number>={};const transitionInvalidCounts:Record<string,number>={};
      for(const entry of registry){if(!/^[a-z][a-z0-9_]*$/.test(entry.table))fail("business_reason_preflight_table_invalid");const domain=await pool.query<{count:number}>(`SELECT count(*)::int count FROM public.${entry.table} WHERE reason_code IS NULL OR NOT (reason_code=ANY($1::text[]))`,[entry.reasonCodes]);invalidCounts[entry.table]=domain.rows[0].count;const transition=await pool.query<{count:number}>(`SELECT count(*)::int count FROM public.${entry.table} WHERE ${TRANSITION_INVALID_SQL[entry.table]}`);transitionInvalidCounts[entry.table]=transition.rows[0].count;}
      const constraints=await pool.query<{count:number}>("SELECT count(*)::int count FROM pg_catalog.pg_constraint WHERE conname=ANY($1::text[])",[registry.map((entry)=>`${entry.table}__reason_code__check`)]);
      const functionCount=await pool.query<{count:number}>("SELECT count(*)::int count FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='dgkma_validate_business_reason_transition_v1'");
      const triggerCount=await pool.query<{count:number}>("SELECT count(*)::int count FROM pg_catalog.pg_trigger WHERE tgname=ANY($1::text[]) AND NOT tgisinternal",[TRANSITION_TRIGGERS]);
      const ledger=await pool.query<{sequence_no:number}>("SELECT sequence_no FROM public.schema_change_ledger ORDER BY sequence_no");
      if(Object.values(invalidCounts).some((count)=>count!==0))fail("business_reason_development_invalid_rows");
      if(Object.values(transitionInvalidCounts).some((count)=>count!==0))fail("business_reason_development_transition_invalid_rows");
      if(constraints.rows[0].count!==8)fail("business_reason_development_constraint_mismatch");
      if(functionCount.rows[0].count!==0||triggerCount.rows[0].count!==0)fail("business_reason_development_transition_object_collision");
      if(canonicalJson(ledger.rows.map((row)=>row.sequence_no) as unknown as CanonicalValue)!==canonicalJson([1,10,15,20,30,40,50,60,70,80,90,100,110] as unknown as CanonicalValue))fail("business_reason_development_ledger_mismatch");
      await pool.query("ROLLBACK");
      console.log(canonicalJson({schema_version:"dgkma-business-reason-transition-development-preflight-v1",target_fingerprint:target.targetFingerprint,ledger_sequences:ledger.rows.map((row)=>row.sequence_no),domain_invalid_counts:invalidCounts,transition_invalid_counts:transitionInvalidCounts,constraint_count:constraints.rows[0].count,function_count:functionCount.rows[0].count,trigger_count:triggerCount.rows[0].count,transaction_terminal:"ROLLBACK",schema_writes:0,production_operations:0,result:"approved"} as unknown as CanonicalValue));
    }catch(error){await pool.query("ROLLBACK").catch(()=>undefined);throw error;}
  }finally{await shutdownPool(pool);}
}

main().catch((error)=>{console.error(JSON.stringify({schema_version:"dgkma-business-reason-transition-development-preflight-error-v1",error_code:error instanceof Error?error.message:"unknown",result:"rejected"}));process.exitCode=1;});
