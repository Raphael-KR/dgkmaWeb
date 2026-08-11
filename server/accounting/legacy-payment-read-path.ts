import type { PoolClient } from "pg";
import type { LegacyCutoverPhase } from "./legacy-cutover-contract";

export type LegacyPaymentReadPath = "legacy" | "new";

export function legacyPaymentReadPathForPhase(phase: LegacyCutoverPhase | null): LegacyPaymentReadPath {
  return phase === "new" ? "new" : "legacy";
}

export async function readLegacyPaymentReadPath(
  client: Pick<PoolClient, "query">,
): Promise<{ phase: LegacyCutoverPhase | null; readPath: LegacyPaymentReadPath }> {
  const current = await client.query<{ phase: LegacyCutoverPhase }>(
    "SELECT phase FROM public.legacy_cutover_states WHERE cutover_code='payments-v1' ORDER BY version DESC LIMIT 1",
  );
  if ((current.rowCount ?? current.rows.length) > 1) throw new Error("legacy_payment_read_path_state_invalid");
  const phase = current.rows[0]?.phase ?? null;
  return { phase, readPath: legacyPaymentReadPathForPhase(phase) };
}
