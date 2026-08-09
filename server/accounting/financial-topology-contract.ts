import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function fail(code: string): never { throw new Error(code); }
const MANIFEST_SHA = "24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a";
const FINANCIAL_TABLES = [
  "economic_event_parties", "economic_event_party_aliases", "economic_event_claims", "economic_event_provenance",
  "economic_event_authority_decisions", "economic_event_canonicalizations", "economic_event_collisions", "economic_events",
  "bank_accounts", "bank_balance_anchors", "bank_transactions", "bank_transfer_matches", "accounting_categories",
  "cashbook_entries", "dues_receipts", "dues_receipt_reversals", "dues_payment_groups", "dues_group_members",
  "dues_allocations", "bank_reconciliations", "bank_reconciliation_items", "bank_reconciliation_carryforwards", "accounting_audit_events",
] as const;

export function validateFinancialManifest(path = "docs/database-manifest.yaml") {
  const bytes = readFileSync(path);
  if (createHash("sha256").update(bytes).digest("hex") !== MANIFEST_SHA) fail("todo_15_manifest_digest_mismatch");
  const manifest = JSON.parse(bytes.toString("utf8")) as Record<string, any>;
  for (const table of FINANCIAL_TABLES) if (!manifest.tables.some((entry: Record<string, any>) => entry.table === table)) fail(`todo_15_financial_table_missing:${table}`);
  const requiredActions = ["receipt:approve", "receipt_reversal:reverse", "allocation:approve", "economic_event:reject", "event_canonicalization:create", "event_collision:resolve"];
  const actions = new Set(manifest.actor_action_registry.flatMap((entry: Record<string, any>) => entry.actions.map((action: string) => `${entry.entity_type}:${action}`)));
  for (const action of requiredActions) if (!actions.has(action)) fail(`todo_15_actor_action_missing:${action}`);
  return { financialTableCount: FINANCIAL_TABLES.length, actorActionCount: manifest.actor_action_registry.length };
}
type Allocation = { memberId: number; amount: number; kind: "dues" | "special_assessment"; effect: "payment" | "cancellation" | "refund" };

export class FinancialTopologyContract {
  events = new Map<string, { status: "proposed" | "approved" | "rejected"; amount: number; childCount: number; canonicalRoot: string | null }>();
  receipts = new Map<string, { eventId: string; gross: number; status: "proposed" | "approved" | "rejected"; allocations: Allocation[] }>();
  audit: Array<{ entity: string; action: string }> = [];

  proposeEvent(id: string, amount: number): void { if (this.events.has(id)) fail("terminal_state_root_rewrite"); this.events.set(id, { status: "proposed", amount, childCount: 0, canonicalRoot: null }); }
  approveReceipt(id: string, eventId: string, gross: number, allocations: Allocation[]): void {
    const event = this.events.get(eventId) ?? fail("receipt_event_missing");
    if (event.status !== "proposed" || this.receipts.has(id)) fail("terminal_state_root_rewrite");
    if (gross !== event.amount || allocations.reduce((sum, row) => sum + (row.effect === "payment" ? row.amount : -row.amount), 0) !== gross) fail("receipt_allocation_unbalanced");
    this.receipts.set(id, { eventId, gross, allocations, status: "approved" }); event.status = "approved"; event.childCount += 1;
    this.audit.push({ entity: "receipt", action: "approve" });
  }
  refund(originalReceiptId: string, refundEventId: string, amount: number, evidence: { boundClaim: boolean; bankTransaction: boolean; reversesOriginalEvent: boolean }): void {
    const receipt = this.receipts.get(originalReceiptId) ?? fail("refund_original_receipt_missing");
    const event = this.events.get(refundEventId) ?? fail("refund_event_missing");
    if (!evidence.boundClaim || !evidence.bankTransaction) fail("refund_claimless_or_off_bank");
    if (!evidence.reversesOriginalEvent || event.status !== "proposed" || amount > receipt.gross) fail("refund_original_mismatch");
    event.status = "approved"; event.childCount += 1; this.audit.push({ entity: "receipt_reversal", action: "approve" });
  }
  resolveChildlessCollision(duplicateId: string, canonicalId: string): void {
    const duplicate = this.events.get(duplicateId) ?? fail("collision_duplicate_missing");
    const canonical = this.events.get(canonicalId) ?? fail("collision_canonical_missing");
    if (duplicate.status !== "proposed" || duplicate.childCount !== 0 || canonical.status !== "proposed") fail("collision_not_childless");
    duplicate.status = "rejected"; duplicate.canonicalRoot = canonicalId;
    this.audit.push({ entity: "economic_event", action: "reject" }, { entity: "event_canonicalization", action: "create" }, { entity: "event_collision", action: "resolve" });
  }
  closeBlockers(): string[] { return [...this.events].filter(([, row]) => row.status === "proposed" && row.canonicalRoot === null).map(([id]) => id); }
}
