import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import {
  createVerifiedDevelopmentPool,
  createTargetPool,
  disposableDatabaseName,
  resolveDevelopmentTarget,
  resolveDisposableControlTarget,
  shutdownPool,
} from "./db-target";

const ledgerOnlyRunUid = process.env.DGKMA_STARTUP_LEDGER_ONLY === "1"
  ? process.env.DGKMA_DISPOSABLE_RUN_UID : undefined;
const runtimeTarget = ledgerOnlyRunUid
  ? (() => {
      const control = resolveDisposableControlTarget(process.env, ledgerOnlyRunUid);
      return { ...control, kind: "disposable-test" as const, database: disposableDatabaseName(ledgerOnlyRunUid), applicationName: `dgkma-disposable:${ledgerOnlyRunUid}` };
    })()
  : resolveDevelopmentTarget(process.env, "runtime");
console.log(ledgerOnlyRunUid ? "Connecting to disposable ledger-only PostgreSQL target..." : "Connecting to approved Development PostgreSQL target...");

export const pool: Pool = ledgerOnlyRunUid ? createTargetPool(runtimeTarget) : createVerifiedDevelopmentPool(runtimeTarget);
export const databaseTargetReady = ledgerOnlyRunUid
  ? Promise.resolve({ targetFingerprint: "ledger-only" })
  : (pool as ReturnType<typeof createVerifiedDevelopmentPool>).targetVerification;
export const db = drizzle(pool, { schema });

export async function shutdownDatabasePool(): Promise<void> {
  await shutdownPool(pool);
}
