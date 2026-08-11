import { closeDisposableTarget, createOrResumeDisposableTarget, createTargetPool, resolveDisposableControlTarget, shutdownPool, verifyDevelopmentTarget } from "../server/db-target";
import { canonicalJson, type CanonicalValue } from "../server/accounting/source-contracts";

function value(name:string):string{const index=process.argv.indexOf(name);if(index<0||!process.argv[index+1])throw new Error(`missing_argument:${name}`);return process.argv[index+1];}
function fail(code:string):never{throw new Error(code);}

async function main():Promise<void>{
  if(process.argv.length!==4||process.argv[2]!=="--run-uid")fail("schema_exception_registry_verify_arguments_invalid");
  const runUid=value("--run-uid");const resolved=resolveDisposableControlTarget(process.env,runUid);const control=createTargetPool(resolved);let disposable:Awaited<ReturnType<typeof createOrResumeDisposableTarget>>|undefined;
  try{
    const development=await verifyDevelopmentTarget(control,{...resolved,kind:"development"});disposable=await createOrResumeDisposableTarget(control,development,runUid);
    const client=await disposable.pool.connect();
    try{
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const catalog=await client.query<{constraint_count:number;trigger_count:number;function_count:number;exception_count:number}>(`SELECT
        (SELECT count(*)::int FROM pg_catalog.pg_constraint WHERE conrelid='public.schema_data_exceptions'::regclass AND conname=ANY(ARRAY['schema_data_exceptions__rule_code_registry__check','schema_data_exceptions__rule_class_registry__check','schema_data_exceptions__status_resolution__check','schema_data_exceptions__resolution_duplicate__check','schema_data_exceptions__lifecycle_actor__check','schema_data_exceptions__capture_chain__check'])) constraint_count,
        (SELECT count(*)::int FROM pg_catalog.pg_trigger WHERE tgrelid='public.schema_data_exceptions'::regclass AND tgname='schema_data_exceptions__registry_transition_v1' AND NOT tgisinternal) trigger_count,
        (SELECT count(*)::int FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='dgkma_validate_schema_exception_transition_v1') function_count,
        (SELECT count(*)::int FROM public.schema_data_exceptions) exception_count`);
      const state=catalog.rows[0];if(state.constraint_count!==6||state.trigger_count!==1||state.function_count!==1||state.exception_count!==0)fail("schema_exception_registry_catalog_mismatch");
      await client.query("SAVEPOINT invalid_root");
      let rejected=false;
      try{await client.query(`INSERT INTO public.schema_data_exceptions(exception_uid,version,table_name,row_key,rule_code,exception_class,row_digest,status,detected_at,effective_at) VALUES(gen_random_uuid(),1,'users',repeat('a',64),'USERS_EMAIL_CANONICAL_BLANK','pre_anchor_blocking',repeat('b',64),'open',clock_timestamp(),clock_timestamp())`);}
      catch(error){const candidate=error as {code?:unknown;message?:unknown};rejected=candidate.code==="23514"&&typeof candidate.message==="string"&&candidate.message.includes("schema_exception_capture_closed");}
      await client.query("ROLLBACK TO SAVEPOINT invalid_root");if(!rejected)fail("schema_exception_post_capture_root_not_rejected");
      await client.query("ROLLBACK");
      console.log(canonicalJson({schema_version:"dgkma-schema-exception-registry-disposable-verification-v1",run_uid:runUid,target_fingerprint:disposable.targetFingerprint,constraint_count:state.constraint_count,trigger_count:state.trigger_count,function_count:state.function_count,exception_count:state.exception_count,post_capture_root_sqlstate:"23514",transaction_terminal:"ROLLBACK",production_operations:0,result:"approved"} as unknown as CanonicalValue));
    }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
  }finally{if(disposable)await closeDisposableTarget(control,disposable);await shutdownPool(control);}
}

main().catch((error)=>{console.error(JSON.stringify({schema_version:"dgkma-schema-exception-registry-disposable-verification-error-v1",error_code:error instanceof Error?error.message:"unknown",result:"rejected"}));process.exitCode=1;});
