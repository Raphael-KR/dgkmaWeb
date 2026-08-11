import { decideLegacyPayment, firstLegacyIneligibility, legacyDecisionKey, type FrozenLegacyPayment, type LegacyDecisionEvidence, type LegacyDecisionProjection } from "./legacy-payment-contract";

export type LegacyMaterializationKind =
  | "decision:terminal"
  | "claim:open"
  | "event:create"
  | "claim:bind"
  | "provenance:create"
  | "authority:select"
  | "receipt:create"
  | "allocation:create"
  | "cashbook:create"
  | "receipt:approve"
  | "allocation:approve"
  | "cashbook:approve"
  | "event:approve";

export type LegacyMaterializationStep = {
  ordinal: number;
  paymentId: number;
  kind: LegacyMaterializationKind;
};

export type LegacyMaterializationRow = {
  row: FrozenLegacyPayment;
  evidence: LegacyDecisionEvidence;
  createdEventUid: string | null;
  projection: LegacyDecisionProjection;
  decisionKey: string;
  steps: LegacyMaterializationStep[];
};

function fail(code: string): never { throw new Error(code); }

const NEW_EVENT_ORDER: LegacyMaterializationKind[] = [
  "claim:open",
  "event:create",
  "claim:bind",
  "provenance:create",
  "authority:select",
  "decision:terminal",
  "cashbook:create",
  "receipt:create",
  "allocation:create",
  "cashbook:approve",
  "receipt:approve",
  "allocation:approve",
  "event:approve",
];

const CROSS_LINK_ORDER: LegacyMaterializationKind[] = [
  "claim:open",
  "claim:bind",
  "provenance:create",
  "decision:terminal",
];

export function buildLegacyMaterializationRows(input: Array<{
  row: FrozenLegacyPayment;
  evidence: LegacyDecisionEvidence;
  createdEventUid?: string | null;
}>): LegacyMaterializationRow[] {
  const sorted = [...input].sort((left, right) => left.row.paymentId - right.row.paymentId);
  if (new Set(sorted.map(({ row }) => row.paymentId)).size !== sorted.length) fail("legacy_materialization_duplicate_payment");
  let ordinal = 1;
  return sorted.map(({ row, evidence, createdEventUid = null }) => {
    const staticFailure = firstLegacyIneligibility(row);
    const projection = decideLegacyPayment(row, evidence, createdEventUid);
    if (staticFailure !== null && projection.decision !== "ineligible") fail("legacy_materialization_ineligible_projection_mismatch");
    const order = projection.decision === "new_compatibility_event"
      ? NEW_EVENT_ORDER
      : projection.decision === "cross_link"
        ? CROSS_LINK_ORDER
        : ["decision:terminal" as const];
    const steps = order.map((kind) => ({ ordinal: ordinal++, paymentId: row.paymentId, kind }));
    return { row, evidence, createdEventUid, projection, decisionKey: legacyDecisionKey(row, projection), steps };
  });
}

export function assertLegacyMaterializationReady(rows: LegacyMaterializationRow[]): void {
  for (const item of rows) {
    if (item.projection.decision === "review" || item.projection.decision === "quarantine") fail("legacy_materialization_unresolved_decision");
    const expected = item.projection.decision === "new_compatibility_event"
      ? NEW_EVENT_ORDER
      : item.projection.decision === "cross_link"
        ? CROSS_LINK_ORDER
        : ["decision:terminal"];
    if (item.steps.length !== expected.length || item.steps.some((step, index) => step.kind !== expected[index])) fail("legacy_materialization_topology_invalid");
    if (item.projection.decision === "ineligible" && item.steps.some((step) => step.kind !== "decision:terminal")) fail("legacy_materialization_ineligible_side_effect");
  }
  const ordinals = rows.flatMap((row) => row.steps.map((step) => step.ordinal));
  if (ordinals.some((ordinal, index) => ordinal !== index + 1)) fail("legacy_materialization_ordinal_gap");
}

export function legacyMaterializationCounts(rows: LegacyMaterializationRow[]) {
  return rows.flatMap((row) => row.steps).reduce<Record<LegacyMaterializationKind, number>>((counts, step) => {
    counts[step.kind] += 1;
    return counts;
  }, {
    "decision:terminal": 0,
    "claim:open": 0,
    "event:create": 0,
    "claim:bind": 0,
    "provenance:create": 0,
    "authority:select": 0,
    "receipt:create": 0,
    "allocation:create": 0,
    "cashbook:create": 0,
    "receipt:approve": 0,
    "allocation:approve": 0,
    "cashbook:approve": 0,
    "event:approve": 0,
  });
}
