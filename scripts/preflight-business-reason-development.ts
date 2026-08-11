import { createTargetPool, resolveDevelopmentTarget, shutdownPool, verifyDevelopmentTarget } from "../server/db-target";
import { BUSINESS_REASON_TUPLES } from "../server/accounting/business-reason-contract";
import { canonicalJson, type CanonicalValue } from "../server/accounting/source-contracts";

function fail(code: string): never { throw new Error(code); }

async function main(): Promise<void> {
  if (process.argv.join(" ") !== `${process.argv[0]} ${process.argv[1]} --target development`) fail("business_reason_preflight_arguments_invalid");
  const resolved=resolveDevelopmentTarget(process.env,"migration");const pool=createTargetPool(resolved);
  try {
    const target=await verifyDevelopmentTarget(pool,resolved);
    await pool.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    try {
      const registry=[...new Set(BUSINESS_REASON_TUPLES.map((tuple)=>tuple.table))].sort().map((table)=>({table,reasonCodes:[...new Set(BUSINESS_REASON_TUPLES.filter((tuple)=>tuple.table===table).map((tuple)=>tuple.reasonCode))].sort()}));
      const invalidCounts:Record<string,number>={};
      for(const entry of registry){if(!/^[a-z][a-z0-9_]*$/.test(entry.table))fail("business_reason_preflight_table_invalid");const result=await pool.query<{count:number}>(`SELECT count(*)::int count FROM public.${entry.table} WHERE reason_code IS NULL OR NOT (reason_code=ANY($1::text[]))`,[entry.reasonCodes]);invalidCounts[entry.table]=result.rows[0].count;}
      const constraints=await pool.query<{count:number}>("SELECT count(*)::int count FROM pg_catalog.pg_constraint WHERE conname=ANY($1::text[])",[registry.map((entry)=>`${entry.table}__reason_code__check`)]);
      const ledger=await pool.query<{sequence_no:number}>("SELECT sequence_no FROM public.schema_change_ledger ORDER BY sequence_no");
      if(Object.values(invalidCounts).some((count)=>count!==0))fail("business_reason_development_invalid_rows");
      if(constraints.rows[0].count!==0)fail("business_reason_development_constraint_collision");
      if(canonicalJson(ledger.rows.map((row)=>row.sequence_no) as unknown as CanonicalValue)!==canonicalJson([1,10,15,20,30,40,50,60,70,80,90,100] as unknown as CanonicalValue))fail("business_reason_development_ledger_mismatch");
      await pool.query("ROLLBACK");
      console.log(canonicalJson({schema_version:"dgkma-business-reason-development-preflight-v1",target_fingerprint:target.targetFingerprint,ledger_sequences:ledger.rows.map((row)=>row.sequence_no),invalid_counts:invalidCounts,constraint_count:constraints.rows[0].count,transaction_terminal:"ROLLBACK",schema_writes:0,production_operations:0,result:"approved"} as unknown as CanonicalValue));
    }catch(error){await pool.query("ROLLBACK").catch(()=>undefined);throw error;}
  }finally{await shutdownPool(pool);}
}

main().catch((error)=>{console.error(JSON.stringify({schema_version:"dgkma-business-reason-development-preflight-error-v1",error_code:error instanceof Error?error.message:"unknown",result:"rejected"}));process.exitCode=1;});
