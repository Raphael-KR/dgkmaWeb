import { alumniDatabase } from "@shared/schema";
import type { AlumniSyncReport } from "@shared/alumni-sync";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { googleSheetsService } from "../../integrations/google-sheets";
import { planAlumniSync } from "./alumni-sync-plan";

export const ALUMNI_SYNC_ADVISORY_LOCK_KEY = "dgkma:alumni-sync:v1";

export class AlumniSyncFingerprintMismatchError extends Error {
  constructor() {
    super("The alumni source fingerprint does not match the preview.");
    this.name = "AlumniSyncFingerprintMismatchError";
  }
}

export class AlumniSyncBlockedError extends Error {
  constructor() {
    super("The alumni sync plan contains blocking issues.");
    this.name = "AlumniSyncBlockedError";
  }
}

export class AlumniSyncInProgressError extends Error {
  constructor() {
    super("Another alumni sync transaction holds the advisory lock.");
    this.name = "AlumniSyncInProgressError";
  }
}

// 적용 시 advisory lock과 원본 재조회·fingerprint 확인을 한 트랜잭션에 유지한다.
export class AlumniSyncStorage {
  async previewAlumniSync(): Promise<AlumniSyncReport> {
    const snapshot = await googleSheetsService.fetchAlumniSnapshot();
    const databaseRecords = await db.select().from(alumniDatabase);
    return planAlumniSync(snapshot, databaseRecords).report;
  }

  async applyAlumniSync(fingerprint: string): Promise<AlumniSyncReport> {
    return db.transaction(async (tx) => {
      const lockResult = await tx.execute<{ locked: boolean }>(sql`
        select pg_try_advisory_xact_lock(
          hashtextextended(${ALUMNI_SYNC_ADVISORY_LOCK_KEY}, 0)
        ) as locked
      `);
      if (lockResult.rows[0]?.locked !== true) {
        throw new AlumniSyncInProgressError();
      }

      const snapshot = await googleSheetsService.fetchAlumniSnapshot();
      const databaseRecords = await tx.select().from(alumniDatabase);
      const plan = planAlumniSync(snapshot, databaseRecords);
      if (plan.report.blocked) throw new AlumniSyncBlockedError();
      if (plan.report.sourceFingerprint !== fingerprint) {
        throw new AlumniSyncFingerprintMismatchError();
      }

      for (const change of plan.changes) {
        if (change.kind === "insert") {
          await tx.insert(alumniDatabase).values({
            ...change.source,
            isMatched: false,
            matchedUserId: null,
          });
          continue;
        }
        await tx
          .update(alumniDatabase)
          .set(change.source)
          .where(eq(alumniDatabase.id, change.databaseId));
      }

      return plan.report;
    });
  }
}
