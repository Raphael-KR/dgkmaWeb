import { closeDisposableTarget, createOrResumeDisposableTarget, createTargetPool, resolveDisposableControlTarget, shutdownPool, verifyDevelopmentTarget } from "../server/db-target";
import { canonicalJson, type CanonicalValue } from "../server/accounting/source-contracts";

function value(name:string):string{const index=process.argv.indexOf(name);if(index<0||!process.argv[index+1])throw new Error(`missing_argument:${name}`);return process.argv[index+1];}
function fail(code:string):never{throw new Error(code);}

async function main():Promise<void>{
  if(process.argv.length!==4||process.argv[2]!=="--run-uid")fail("business_reason_transition_verify_arguments_invalid");
  const runUid=value("--run-uid");const resolved=resolveDisposableControlTarget(process.env,runUid);const control=createTargetPool(resolved);let disposable:Awaited<ReturnType<typeof createOrResumeDisposableTarget>>|undefined;
  try{
    const development=await verifyDevelopmentTarget(control,{...resolved,kind:"development"});disposable=await createOrResumeDisposableTarget(control,development,runUid);
    const client=await disposable.pool.connect();
    try{
      const catalog=await client.query<{count:number}>(`SELECT count(*)::int count FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='dgkma_validate_business_reason_transition_v1' AND NOT t.tgisinternal`);
      if(catalog.rows[0].count!==8)fail("business_reason_transition_catalog_mismatch");
      await client.query("BEGIN");
      await client.query("CREATE TEMP TABLE legacy_payment_decisions(decision text,reason_code text)");
      await client.query("CREATE TRIGGER verify_business_reason_transition BEFORE INSERT OR UPDATE ON pg_temp.legacy_payment_decisions FOR EACH ROW EXECUTE FUNCTION public.dgkma_validate_business_reason_transition_v1()");
      await client.query("SAVEPOINT invalid_pair");
      let rejected=false;
      try{await client.query("INSERT INTO pg_temp.legacy_payment_decisions(decision,reason_code) VALUES ('review','LEGACY_CROSS_LINK_MATCHED')");}
      catch(error){const candidate=error as {code?:unknown;message?:unknown};rejected=candidate.code==="23514"&&typeof candidate.message==="string"&&candidate.message.includes("business_reason_transition_invalid");}
      await client.query("ROLLBACK TO SAVEPOINT invalid_pair");
      if(!rejected)fail("business_reason_transition_wrong_pair_not_rejected");
      await client.query("INSERT INTO pg_temp.legacy_payment_decisions(decision,reason_code) VALUES ('review','LEGACY_TIMEZONE_UNRESOLVED')");
      const valid=await client.query<{count:number}>("SELECT count(*)::int count FROM pg_temp.legacy_payment_decisions");if(valid.rows[0].count!==1)fail("business_reason_transition_valid_pair_missing");
      await client.query("ROLLBACK");
      console.log(canonicalJson({schema_version:"dgkma-business-reason-transition-disposable-verification-v1",run_uid:runUid,target_fingerprint:disposable.targetFingerprint,governed_trigger_count:catalog.rows[0].count,wrong_pair_sqlstate:"23514",valid_pair_rows:valid.rows[0].count,transaction_terminal:"ROLLBACK",production_operations:0,result:"approved"} as unknown as CanonicalValue));
    }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
  }finally{if(disposable)await closeDisposableTarget(control,disposable);await shutdownPool(control);}
}

main().catch((error)=>{console.error(JSON.stringify({schema_version:"dgkma-business-reason-transition-disposable-verification-error-v1",error_code:error instanceof Error?error.message:"unknown",result:"rejected"}));process.exitCode=1;});
