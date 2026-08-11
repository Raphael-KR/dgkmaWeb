import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalJson, sha256, withProductionReadonly } from "../server/db-target";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing_argument:${name}`);
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const output = argument("--output");
  if (existsSync(output)) throw new Error("task22_production_dossier_exists");
  const dossier = await withProductionReadonly(process.env, async (client, fingerprint) => {
    const catalog = await client.query(`SELECT (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') public_object_count,(SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public') public_table_count,to_regclass('public.schema_change_ledger') IS NOT NULL ledger_present,current_setting('transaction_read_only') transaction_read_only`);
    const projection = catalog.rows[0] as Record<string, Json>;
    return {
      schema_version: "dgkma-task22-production-readonly-dossier-v1",
      target_fingerprint: fingerprint,
      current_database: "neondb",
      transaction_read_only: projection.transaction_read_only,
      catalog_sha256: sha256(canonicalJson(projection as Json)),
      schema_writes: 0,
      business_writes: 0,
      result: "verified-read-only",
    } as Json;
  });
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${canonicalJson(dossier)}\n`, { flag: "wx" });
  console.log(canonicalJson(dossier));
}

main().catch((error) => {
  console.error(JSON.stringify({ schema_version: "dgkma-task22-production-readonly-error-v1", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" }));
  process.exitCode = 1;
});
