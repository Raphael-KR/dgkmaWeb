import { lstatSync, readFileSync } from "node:fs";
import { createTargetPool, resolveDevelopmentTarget, shutdownPool, verifyDevelopmentTarget } from "../server/db-target";
import { loadLegacyPaymentPlan } from "../server/accounting/legacy-payment-service";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";
import { verifyActorReceipt } from "./admin-actor-receipt";

const ACTIONS = ["register_release", "preview", "initialize", "fence", "cutover"] as const;
const ACTOR_RECEIPT_PATH = "docs/database-targets/development-admin-approved.json";
const APPROVED_DEVELOPMENT_ADMIN_USER_ID = 315;
function fail(code: string): never { throw new Error(code); }
function arg(name: string): string { const index=process.argv.indexOf(name); if(index<0||!process.argv[index+1])fail(`missing_argument:${name}`); return process.argv[index+1]; }
function receiptPaths(): string[] {
  const paths=process.argv.flatMap((value,index)=>value==="--receipt"&&process.argv[index+1]?[process.argv[index+1]]:[]);
  if(paths.length!==ACTIONS.length||paths.some((path)=>!/^\/tmp\/dgkma-legacy-payment-admin-[0-9a-f-]+\.json$/.test(path)))fail("legacy_development_receipt_paths_invalid");
  return paths;
}

async function main(): Promise<void> {
  if(arg("--target")!=="development")fail("legacy_development_verifier_target_forbidden");
  if(arg("--actor-receipt")!==ACTOR_RECEIPT_PATH)fail("legacy_development_verifier_actor_receipt_mismatch");
  const paths=receiptPaths(); const resolved=resolveDevelopmentTarget(process.env,"migration"); const pool=createTargetPool(resolved);
  try {
    const target=await verifyDevelopmentTarget(pool,resolved);
    await verifyActorReceipt(pool,ACTOR_RECEIPT_PATH,{kind:"development",targetFingerprint:target.targetFingerprint,candidateUserId:APPROVED_DEVELOPMENT_ADMIN_USER_ID});
    const {plan}=loadLegacyPaymentPlan();
    if(plan.target_fingerprint!==target.targetFingerprint)fail("legacy_development_verifier_plan_target_mismatch");
    const fileReceipts=paths.map((path,index)=>{
      const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())fail("legacy_development_receipt_not_regular");
      const value=JSON.parse(readFileSync(path,"utf8")) as Record<string,CanonicalValue>;
      const receipt=value.receipt as Record<string,CanonicalValue>;
      if(receipt.action!==ACTIONS[index]||receipt.receipt_sha256!==sha256(canonicalJson(Object.fromEntries(Object.entries(receipt).filter(([key])=>key!=="receipt_sha256")) as CanonicalValue)))fail("legacy_development_receipt_invalid");
      return receipt;
    });
    await pool.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    try {
      const stored=await pool.query<{action:string;receipt:Record<string,CanonicalValue>}>(`
        SELECT action,canonical_payload->'inputs'->'operation_receipt' AS receipt
        FROM public.business_operation_receipts WHERE entity_type='legacy_payment'
      `);
      if(stored.rowCount!==ACTIONS.length)fail("legacy_development_stored_receipt_count_mismatch");
      const storedByAction=new Map(stored.rows.map((row)=>[row.action,row.receipt]));
      for(let index=0;index<ACTIONS.length;index+=1){const action=ACTIONS[index];if(canonicalJson(storedByAction.get(action) as CanonicalValue)!==canonicalJson(fileReceipts[index] as CanonicalValue))fail(`legacy_development_stored_receipt_mismatch:${action}`);}
      const counts=await pool.query<{releases:number;batches:number;batch_rows:number;cutover_states:number;payments:number;decisions:number;decision_sets:number;decision_items:number;classifications:number;receipts:number;entities:number;audits:number}>(`SELECT
        (SELECT count(*)::int FROM public.accounting_source_releases r JOIN public.accounting_logical_sources s ON s.id=r.logical_source_id WHERE s.source_code='LEGACY_PAYMENTS') releases,
        (SELECT count(*)::int FROM public.accounting_import_batches b JOIN public.accounting_source_releases r ON r.id=b.source_release_id JOIN public.accounting_logical_sources s ON s.id=r.logical_source_id WHERE s.source_code='LEGACY_PAYMENTS') batches,
        (SELECT count(*)::int FROM public.accounting_import_batch_rows br JOIN public.accounting_import_batches b ON b.id=br.batch_id JOIN public.accounting_source_releases r ON r.id=b.source_release_id JOIN public.accounting_logical_sources s ON s.id=r.logical_source_id WHERE s.source_code='LEGACY_PAYMENTS') batch_rows,
        (SELECT count(*)::int FROM public.legacy_cutover_states WHERE cutover_code='payments-v1') cutover_states,
        (SELECT count(*)::int FROM public.payments) payments,
        (SELECT count(*)::int FROM public.legacy_payment_decisions) decisions,
        (SELECT count(*)::int FROM public.source_decision_sets ds JOIN public.accounting_import_batches b ON b.id=ds.batch_id JOIN public.accounting_source_releases r ON r.id=b.source_release_id JOIN public.accounting_logical_sources s ON s.id=r.logical_source_id WHERE s.source_code='LEGACY_PAYMENTS') decision_sets,
        (SELECT count(*)::int FROM public.source_decision_items di JOIN public.source_decision_sets ds ON ds.id=di.decision_set_id JOIN public.accounting_import_batches b ON b.id=ds.batch_id JOIN public.accounting_source_releases r ON r.id=b.source_release_id JOIN public.accounting_logical_sources s ON s.id=r.logical_source_id WHERE s.source_code='LEGACY_PAYMENTS') decision_items,
        (SELECT count(*)::int FROM public.source_row_classification_decisions c JOIN public.accounting_import_coordinates co ON co.id=c.coordinate_id JOIN public.accounting_logical_sources s ON s.id=co.logical_source_id WHERE s.source_code='LEGACY_PAYMENTS') classifications,
        (SELECT count(*)::int FROM public.business_operation_receipts WHERE entity_type='legacy_payment') receipts,
        (SELECT count(*)::int FROM public.business_operation_entities e JOIN public.business_operation_receipts r ON r.operation_uid=e.operation_uid WHERE r.entity_type='legacy_payment') entities,
        (SELECT count(*)::int FROM public.accounting_audit_events WHERE reason_code LIKE 'TODO19_LEGACY_%') audits`);
      const expected={releases:3,batches:1,batch_rows:0,cutover_states:3,payments:0,decisions:0,decision_sets:0,decision_items:0,classifications:0,receipts:5,entities:6,audits:6};
      if(canonicalJson(counts.rows[0] as unknown as CanonicalValue)!==canonicalJson(expected as unknown as CanonicalValue))fail("legacy_development_counts_mismatch");
      const phases=await pool.query<{phase:string;version:number;watermark_payment_id:number|null;comparison_digest:string|null}>("SELECT phase,version,watermark_payment_id,comparison_digest FROM public.legacy_cutover_states WHERE cutover_code='payments-v1' ORDER BY version");
      if(canonicalJson(phases.rows.map((row)=>[row.phase,row.version,row.watermark_payment_id,row.comparison_digest]) as unknown as CanonicalValue)!==canonicalJson([["legacy",1,null,null],["fenced",2,0,fileReceipts[3].comparison_digest],["new",3,0,fileReceipts[4].comparison_digest]] as CanonicalValue))fail("legacy_development_phase_chain_mismatch");
      const sequences=await pool.query<{sequence_name:string;last_value:string|null}>("SELECT sequencename AS sequence_name,last_value::text FROM pg_catalog.pg_sequences WHERE schemaname='public' ORDER BY sequencename");
      const identitySequenceSha256=sha256(canonicalJson(sequences.rows as unknown as CanonicalValue));
      const receiptCollectionSha256=sha256(canonicalJson(fileReceipts as unknown as CanonicalValue));
      await pool.query("ROLLBACK");
      console.log(canonicalJson({schema_version:"dgkma-legacy-payment-development-verification-v1",target:"development",manifest_sha256:"551d9d672a0cd3689b6c3ac5d1252078f4e53106a7ef143ac954c96239596c14",phase:"new",watermark_payment_id:0,counts:counts.rows[0],identity_sequence_sha256:identitySequenceSha256,receipt_collection_sha256:receiptCollectionSha256,transaction_terminal:"ROLLBACK",production_operations:0,result:"approved"} as unknown as CanonicalValue));
    } catch(error){await pool.query("ROLLBACK").catch(()=>undefined);throw error;}
  } finally {await shutdownPool(pool);}
}

main().catch((error)=>{console.error(JSON.stringify({schema_version:"dgkma-legacy-payment-development-verification-error-v1",error_code:error instanceof Error?error.message:"unknown",result:"rejected"}));process.exitCode=1;});
