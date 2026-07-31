import type { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import {
  createVerifiedDevelopmentPool,
  resolveDevelopmentTarget,
  shutdownPool,
} from "./db-target";

const runtimeTarget = resolveDevelopmentTarget(process.env, "runtime");
console.log("Connecting to approved Development PostgreSQL target...");

export const pool: Pool = createVerifiedDevelopmentPool(runtimeTarget);
export const databaseTargetReady = (pool as ReturnType<typeof createVerifiedDevelopmentPool>).targetVerification;
export const db = drizzle(pool, { schema });

export async function shutdownDatabasePool(): Promise<void> {
  await shutdownPool(pool);
}
