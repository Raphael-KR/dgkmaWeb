import { negativeAllocationEffectiveAt } from "./dues-rights-contract";

export type RefundCorrectionReason = "source_error" | "false_transaction" | null;

function fail(code: string): never { throw new Error(code); }

export function planReceiptRefund(input: Readonly<{
  observedAt: string;
  originalEffectiveAt: string;
  correctionReasonCode: RefundCorrectionReason;
  correctionEvidenceSha256: string | null;
  originalReceiptBound: boolean;
  originalAllocationBound: boolean;
  boundClaim: boolean;
  bankTransactionBound: boolean;
  reversesOriginalEvent: boolean;
}>): Readonly<{
  effectiveAt: string;
  rightsEffectMode: "next_month_negative" | "retroactive_error";
  correctionReasonCode: RefundCorrectionReason;
  correctionEvidenceSha256: string | null;
  steps: readonly string[];
}> {
  if (!input.originalReceiptBound || !input.originalAllocationBound) fail("refund_original_binding_missing");
  if (!input.boundClaim || !input.bankTransactionBound) fail("refund_bank_evidence_missing");
  if (!input.reversesOriginalEvent) fail("refund_original_event_mismatch");
  const effectiveAt = negativeAllocationEffectiveAt({
    observedAt: input.observedAt, originalEffectiveAt: input.originalEffectiveAt,
    correctionReasonCode: input.correctionReasonCode, correctionEvidenceSha256: input.correctionEvidenceSha256,
  });
  return {
    effectiveAt,
    rightsEffectMode: input.correctionReasonCode === null ? "next_month_negative" : "retroactive_error",
    correctionReasonCode: input.correctionReasonCode,
    correctionEvidenceSha256: input.correctionEvidenceSha256,
    steps: [
      "event_claim:open", "economic_event:create", "event_claim:bind", "event_provenance:create",
      "authority_decision:select", "bank_transaction:create", "receipt_reversal:propose",
      "original_allocation:lock", "new_allocation:refund", "receipt_reversal:approve", "audit:append",
    ],
  };
}

const TIERS = ["president", "senior_vice_president", "vice_president_auditor_chair", "director", "member", "honorary"] as const;

export function planAnnualPolicyActivation(input: Readonly<{
  policySuccessors: readonly Readonly<{ tierCode: string; successorUid: string }>[];
  mappingSuccessors: readonly Readonly<{ mappingUid: string; tierCode: string; policySuccessorUid: string }>[];
}>): Readonly<{ steps: readonly Readonly<{ kind: "policy_successor" | "mapping_successor"; uid: string; tierCode: string }>[] }> {
  if (input.policySuccessors.length !== TIERS.length || new Set(input.policySuccessors.map((entry) => entry.tierCode)).size !== TIERS.length || TIERS.some((tier) => !input.policySuccessors.some((entry) => entry.tierCode === tier))) fail("annual_activation_policy_coverage_invalid");
  if (new Set(input.policySuccessors.map((entry) => entry.successorUid)).size !== input.policySuccessors.length || new Set(input.mappingSuccessors.map((entry) => entry.mappingUid)).size !== input.mappingSuccessors.length) fail("annual_activation_identity_collision");
  const policyByTier = new Map(input.policySuccessors.map((entry) => [entry.tierCode, entry.successorUid]));
  if (input.mappingSuccessors.length === 0 || input.mappingSuccessors.some((entry) => policyByTier.get(entry.tierCode) !== entry.policySuccessorUid)) fail("annual_activation_mapping_policy_binding_invalid");
  return {
    steps: [
      ...input.policySuccessors.map((entry) => ({ kind: "policy_successor" as const, uid: entry.successorUid, tierCode: entry.tierCode })),
      ...input.mappingSuccessors.map((entry) => ({ kind: "mapping_successor" as const, uid: entry.mappingUid, tierCode: entry.tierCode })),
    ],
  };
}

export class AtomicActivationFixture {
  committed: readonly Readonly<{ kind: "policy_successor" | "mapping_successor"; uid: string; tierCode: string }>[] = [];

  apply(plan: ReturnType<typeof planAnnualPolicyActivation>, failAtOrdinal: number | null): void {
    const pending: typeof this.committed = [];
    try {
      for (let index = 0; index < plan.steps.length; index += 1) {
        if (failAtOrdinal === index + 1) fail("annual_activation_synthetic_failure");
        pending.push(plan.steps[index]);
      }
      this.committed = pending;
    } catch (error) {
      this.committed = [];
      throw error;
    }
  }
}
