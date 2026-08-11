import type { Pool } from "pg";
import { readArtifactDescriptors } from "../scripts/schema-ledger";
import { verifyStartupLedger, type StartupLedgerRow } from "../scripts/startup-retention-contract";

export async function verifyStartupSchema(pool: Pool): Promise<void> {
  const result = await pool.query<StartupLedgerRow>(`
    SELECT l.sequence_no, l.artifact_id, l.artifact_sha256, l.artifact_kind,
           l.manifest_sha256, l.target_fingerprint, l.capability_variant,
           l.executor_version, r.state AS release_state
    FROM public.schema_change_ledger AS l
    JOIN public.schema_release_runs AS r ON r.id=l.release_run_id
    WHERE l.sequence_no <= 130
    ORDER BY l.sequence_no, l.artifact_id
  `);
  const verification = verifyStartupLedger(result.rows, readArtifactDescriptors());
  if (!verification.ready) throw new Error(verification.code);
}
