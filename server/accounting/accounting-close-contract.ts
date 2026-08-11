export type CloseEventStatus = "proposed" | "approved" | "rejected";
export type CloseDirection = "credit" | "debit";

type CloseEvent = {
  amount: bigint;
  direction: CloseDirection;
  status: CloseEventStatus;
  canonicalRoot: string | null;
  childCount: number;
  accountCode: string | null;
};

type CloseReceipt = { gross: bigint; allocated: bigint; status: "proposed" | "approved" | "rejected" };

const MONEY = /^(0|[1-9][0-9]*)$/;
const SIGNED_MONEY = /^(0|[1-9][0-9]*|-[1-9][0-9]*)$/;

function fail(code: string): never { throw new Error(code); }
function money(value: string): bigint { return MONEY.test(value) ? BigInt(value) : fail("close_money_invalid"); }
function signed(direction: CloseDirection, amount: bigint): bigint { return direction === "credit" ? amount : -amount; }

export class AccountingCloseContract {
  private readonly events = new Map<string, CloseEvent>();
  private readonly receipts = new Map<string, CloseReceipt>();
  private readonly anchors = new Map<string, bigint>();
  private readonly observedBalances = new Map<string, bigint>();
  private readonly reconciliationDifferences = new Map<string, bigint>();
  private readonly openCollisions = new Set<string>();
  private readonly openSchemaExceptions = new Set<string>();
  private closed = false;

  addEvent(input: Readonly<{ id: string; amount: string; direction: CloseDirection; status: CloseEventStatus; accountCode?: string | null }>): void {
    if (this.closed || this.events.has(input.id)) fail("close_append_only_violation");
    this.events.set(input.id, {
      amount: money(input.amount), direction: input.direction, status: input.status,
      canonicalRoot: null, childCount: 0, accountCode: input.accountCode ?? null,
    });
  }

  attachApprovedReceipt(input: Readonly<{ id: string; eventId: string; gross: string; allocations: readonly string[] }>): void {
    if (this.closed || this.receipts.has(input.id)) fail("close_append_only_violation");
    const event = this.events.get(input.eventId) ?? fail("close_receipt_event_missing");
    if (event.status !== "approved") fail("close_receipt_event_not_approved");
    const gross = money(input.gross);
    const allocated = input.allocations.reduce((sum, value) => sum + money(value), 0n);
    if (gross !== event.amount) fail("close_receipt_event_amount_mismatch");
    this.receipts.set(input.id, { gross, allocated, status: "approved" });
    event.childCount += 1;
  }

  addProposedReceipt(input: Readonly<{ id: string; gross: string; allocated: string }>): void {
    if (this.closed || this.receipts.has(input.id)) fail("close_append_only_violation");
    this.receipts.set(input.id, { gross: money(input.gross), allocated: money(input.allocated), status: "proposed" });
  }

  openCollision(collisionId: string): void { if (this.closed || this.openCollisions.has(collisionId)) fail("close_append_only_violation"); this.openCollisions.add(collisionId); }

  resolveChildlessCollision(input: Readonly<{ collisionId: string; duplicateEventId: string; canonicalEventId: string }>): void {
    if (this.closed || !this.openCollisions.has(input.collisionId)) fail("close_collision_not_open");
    const duplicate = this.events.get(input.duplicateEventId) ?? fail("close_collision_event_missing");
    const canonical = this.events.get(input.canonicalEventId) ?? fail("close_collision_event_missing");
    if (duplicate.status !== "proposed" || duplicate.childCount !== 0 || duplicate.canonicalRoot !== null || canonical.status !== "approved") fail("close_collision_not_childless");
    duplicate.status = "rejected";
    duplicate.canonicalRoot = input.canonicalEventId;
    this.openCollisions.delete(input.collisionId);
  }

  setAccountEvidence(input: Readonly<{ accountCode: string; anchorBalance: string; observedBalance: string }>): void {
    if (this.closed || this.anchors.has(input.accountCode)) fail("close_append_only_violation");
    this.anchors.set(input.accountCode, money(input.anchorBalance));
    this.observedBalances.set(input.accountCode, money(input.observedBalance));
  }

  setReconciliationDifference(reconciliationId: string, difference: string): void {
    if (this.closed || this.reconciliationDifferences.has(reconciliationId)) fail("close_append_only_violation");
    if (!SIGNED_MONEY.test(difference)) fail("close_signed_money_invalid");
    this.reconciliationDifferences.set(reconciliationId, BigInt(difference));
  }

  openSchemaException(ruleCode: string): void { if (this.closed) fail("close_append_only_violation"); this.openSchemaExceptions.add(ruleCode); }
  resolveSchemaException(ruleCode: string): void { if (this.closed || !this.openSchemaExceptions.delete(ruleCode)) fail("close_schema_exception_not_open"); }

  canonicalNetTotal(): string {
    return [...this.events.values()]
      .filter((event) => event.status === "approved" && event.canonicalRoot === null)
      .reduce((sum, event) => sum + signed(event.direction, event.amount), 0n)
      .toString(10);
  }

  sourceBoundBalance(accountCode: string): string {
    const anchor = this.anchors.get(accountCode) ?? fail("close_account_anchor_missing");
    return [...this.events.values()]
      .filter((event) => event.status === "approved" && event.canonicalRoot === null && event.accountCode === accountCode)
      .reduce((sum, event) => sum + signed(event.direction, event.amount), anchor)
      .toString(10);
  }

  blockers(): string[] {
    const blockers: string[] = [];
    for (const [id, event] of this.events) if (event.status === "proposed" && event.canonicalRoot === null) blockers.push(`event:${id}:proposed`);
    for (const [id, receipt] of this.receipts) {
      if (receipt.status !== "approved") blockers.push(`receipt:${id}:${receipt.status}`);
      else if (receipt.gross !== receipt.allocated) blockers.push(`receipt:${id}:unallocated`);
    }
    for (const id of this.openCollisions) blockers.push(`collision:${id}:open`);
    for (const code of this.openSchemaExceptions) blockers.push(`schema_exception:${code}:open`);
    for (const [id, difference] of this.reconciliationDifferences) if (difference !== 0n) blockers.push(`reconciliation:${id}:difference`);
    for (const [accountCode, observed] of this.observedBalances) if (BigInt(this.sourceBoundBalance(accountCode)) !== observed) blockers.push(`account:${accountCode}:difference`);
    return blockers.sort();
  }

  close(): Readonly<{ canonicalNetTotal: string; accountBalances: Readonly<Record<string, string>> }> {
    const blockers = this.blockers();
    if (blockers.length > 0) fail(`close_blocked:${blockers.join(",")}`);
    this.closed = true;
    return {
      canonicalNetTotal: this.canonicalNetTotal(),
      accountBalances: Object.fromEntries([...this.anchors.keys()].sort().map((code) => [code, this.sourceBoundBalance(code)])),
    };
  }
}
