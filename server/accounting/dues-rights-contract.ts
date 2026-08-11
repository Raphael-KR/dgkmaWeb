export type DuesTierCode = "president" | "senior_vice_president" | "vice_president_auditor_chair" | "director" | "member" | "honorary";
export type RightsStatus = "rights_member" | "member" | "honorary";
export type RightsReason = "annual_complete" | "monthly_current" | "january_carry" | "monthly_shortfall" | "assessment_shortfall" | "monthly_and_assessment_shortfall" | "honorary";

type Money = string;
type PriorYear = Readonly<{
  noPriorLiability: boolean;
  annualRequired: Money;
  monthlyMinimum: Money;
  rightsPaidTotal: Money;
  assessmentRequired: Money;
  assessmentPaid: Money;
}>;

export type RightsEvaluationInput = Readonly<{
  evaluationInstant: string;
  memberKind: "member" | "honorary";
  tierCode: DuesTierCode;
  monthlyMinimum: Money;
  annualMinimum: Money;
  paidTotal: Money;
  rightsPaidTotal: Money;
  pledgeMonthlyAmounts: readonly Money[];
  specialAssessmentRequired: Money;
  specialAssessmentPaid: Money;
  specialAssessmentRightsRequired: Money;
  specialAssessmentRightsPaid: Money;
  priorYear: PriorYear | null;
}>;

export type RightsEvaluation = Readonly<{
  evaluationDate: string;
  complianceMonths: number;
  rightsMonths: number;
  monthlyRequiredToDate: Money;
  rightsRequiredToDate: Money;
  annualRequired: Money;
  paidTotal: Money;
  rightsPaidTotal: Money;
  pledgeTargetToDate: Money;
  policyShortfall: Money;
  pledgeShortfall: Money;
  specialAssessmentRequired: Money;
  specialAssessmentRightsRequired: Money;
  specialAssessmentPaid: Money;
  specialAssessmentRightsPaid: Money;
  rightsStatus: RightsStatus;
  reasonCode: RightsReason;
}>;

const KST_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+09:00$/;
const MONEY = /^(0|[1-9][0-9]*)$/;

function fail(code: string): never { throw new Error(code); }
function money(value: Money, code: string): bigint { return MONEY.test(value) ? BigInt(value) : fail(code); }
function decimal(value: bigint): string { return value.toString(10); }
function shortfall(required: bigint, paid: bigint): bigint { return required > paid ? required - paid : 0n; }

export function evaluateDuesRights(input: RightsEvaluationInput): RightsEvaluation {
  const instant = KST_INSTANT.exec(input.evaluationInstant) ?? fail("rights_evaluation_instant_invalid");
  const year = Number(instant[1]); const month = Number(instant[2]); const day = Number(instant[3]);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) fail("rights_evaluation_date_invalid");
  if (input.pledgeMonthlyAmounts.length !== 12) fail("rights_pledge_month_closure_invalid");

  const monthly = money(input.monthlyMinimum, "rights_monthly_minimum_invalid");
  const annual = money(input.annualMinimum, "rights_annual_minimum_invalid");
  const paid = money(input.paidTotal, "rights_paid_total_invalid");
  const rightsPaid = money(input.rightsPaidTotal, "rights_paid_total_invalid");
  const assessmentRequired = money(input.specialAssessmentRequired, "rights_assessment_invalid");
  const assessmentPaid = money(input.specialAssessmentPaid, "rights_assessment_invalid");
  const assessmentRightsRequired = money(input.specialAssessmentRightsRequired, "rights_assessment_invalid");
  const assessmentRightsPaid = money(input.specialAssessmentRightsPaid, "rights_assessment_invalid");
  const pledgeMonths = input.pledgeMonthlyAmounts.map((value) => money(value, "rights_pledge_amount_invalid"));
  const complianceMonths = day >= 11 ? month : month - 1;
  const rightsMonths = month - 1;
  const monthlyRequired = monthly * BigInt(complianceMonths);
  const rightsRequired = monthly * BigInt(rightsMonths);
  const pledgeTarget = pledgeMonths.slice(0, complianceMonths).reduce((sum, value) => sum + value, 0n);

  if (input.memberKind === "honorary") {
    if (input.tierCode !== "honorary" || monthly !== 0n || annual !== 0n || assessmentRequired !== 0n || assessmentRightsRequired !== 0n) fail("rights_honorary_policy_invalid");
    return {
      evaluationDate: `${instant[1]}-${instant[2]}-${instant[3]}`, complianceMonths, rightsMonths,
      monthlyRequiredToDate: "0", rightsRequiredToDate: "0", annualRequired: "0", paidTotal: decimal(paid), rightsPaidTotal: decimal(rightsPaid),
      pledgeTargetToDate: decimal(pledgeTarget), policyShortfall: "0", pledgeShortfall: decimal(shortfall(pledgeTarget, paid)),
      specialAssessmentRequired: "0", specialAssessmentRightsRequired: "0", specialAssessmentPaid: decimal(assessmentPaid), specialAssessmentRightsPaid: decimal(assessmentRightsPaid),
      rightsStatus: "honorary", reasonCode: "honorary",
    };
  }
  if (input.tierCode === "honorary") fail("rights_member_tier_invalid");

  const annualComplete = rightsPaid >= annual;
  let assessmentCurrent = assessmentRightsPaid >= assessmentRightsRequired;
  let duesCurrent: boolean;
  let januaryCarry = false;
  if (month === 1) {
    const prior = input.priorYear ?? fail("rights_prior_year_required");
    const priorPaid = money(prior.rightsPaidTotal, "rights_prior_year_invalid");
    const priorAnnualComplete = priorPaid >= money(prior.annualRequired, "rights_prior_year_invalid");
    const priorMonthlyComplete = priorPaid >= 12n * money(prior.monthlyMinimum, "rights_prior_year_invalid");
    const priorAssessmentCurrent = prior.noPriorLiability || money(prior.assessmentPaid, "rights_prior_year_invalid") >= money(prior.assessmentRequired, "rights_prior_year_invalid");
    const priorDuesCarry = prior.noPriorLiability || priorAnnualComplete || priorMonthlyComplete;
    duesCurrent = annualComplete || priorDuesCarry;
    januaryCarry = !annualComplete && priorDuesCarry;
    assessmentCurrent = assessmentCurrent && priorAssessmentCurrent;
  } else {
    duesCurrent = annualComplete || rightsPaid >= rightsRequired;
  }

  const status: RightsStatus = duesCurrent && assessmentCurrent ? "rights_member" : "member";
  const reason: RightsReason = !duesCurrent && !assessmentCurrent ? "monthly_and_assessment_shortfall"
    : !assessmentCurrent ? "assessment_shortfall"
    : !duesCurrent ? "monthly_shortfall"
    : annualComplete ? "annual_complete"
    : januaryCarry ? "january_carry"
    : "monthly_current";
  return {
    evaluationDate: `${instant[1]}-${instant[2]}-${instant[3]}`, complianceMonths, rightsMonths,
    monthlyRequiredToDate: decimal(monthlyRequired), rightsRequiredToDate: decimal(rightsRequired), annualRequired: decimal(annual),
    paidTotal: decimal(paid), rightsPaidTotal: decimal(rightsPaid), pledgeTargetToDate: decimal(pledgeTarget),
    policyShortfall: decimal(shortfall(monthlyRequired, paid)), pledgeShortfall: decimal(shortfall(pledgeTarget, paid)),
    specialAssessmentRequired: decimal(assessmentRequired), specialAssessmentRightsRequired: decimal(assessmentRightsRequired),
    specialAssessmentPaid: decimal(assessmentPaid), specialAssessmentRightsPaid: decimal(assessmentRightsPaid), rightsStatus: status, reasonCode: reason,
  };
}

export function negativeAllocationEffectiveAt(input: Readonly<{
  observedAt: string;
  originalEffectiveAt: string;
  correctionReasonCode: "source_error" | "false_transaction" | null;
  correctionEvidenceSha256: string | null;
}>): string {
  const observed = KST_INSTANT.exec(input.observedAt) ?? fail("negative_effect_observed_at_invalid");
  if (input.correctionReasonCode === null && input.correctionEvidenceSha256 === null) {
    const year = Number(observed[1]); const month = Number(observed[2]);
    const nextYear = month === 12 ? year + 1 : year; const nextMonth = month === 12 ? 1 : month + 1;
    return `${nextYear.toString().padStart(4,"0")}-${nextMonth.toString().padStart(2,"0")}-01T00:00:00+09:00`;
  }
  if (input.correctionReasonCode === null || !/^[0-9a-f]{64}$/.test(input.correctionEvidenceSha256 ?? "") || !KST_INSTANT.test(input.originalEffectiveAt)) fail("negative_effect_correction_binding_invalid");
  return input.originalEffectiveAt;
}
