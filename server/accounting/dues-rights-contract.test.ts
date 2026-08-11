import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDuesRights, negativeAllocationEffectiveAt, type DuesTierCode, type RightsEvaluationInput } from "./dues-rights-contract";

const base = (overrides: Partial<RightsEvaluationInput> = {}): RightsEvaluationInput => ({
  evaluationInstant: "2026-06-10T12:00:00+09:00", memberKind: "member", tierCode: "member", monthlyMinimum: "2000", annualMinimum: "50000",
  paidTotal: "10000", rightsPaidTotal: "10000", pledgeMonthlyAmounts: Array(12).fill("3000"), specialAssessmentRequired: "0", specialAssessmentPaid: "0",
  specialAssessmentRightsRequired: "0", specialAssessmentRightsPaid: "0", priorYear: null, ...overrides,
});

test("KST day 1 and 10 use prior-month compliance, day 11 and month-end include current compliance", () => {
  for (const [instant, compliance, rights] of [
    ["2026-06-01T00:00:00+09:00",5,5], ["2026-06-10T23:59:59+09:00",5,5], ["2026-06-11T00:00:00+09:00",6,5], ["2026-06-30T23:59:59+09:00",6,5],
  ] as const) {
    const result=evaluateDuesRights(base({evaluationInstant:instant}));
    assert.deepEqual([result.complianceMonths,result.rightsMonths,result.monthlyRequiredToDate,result.rightsRequiredToDate],[compliance,rights,String(compliance*2000),String(rights*2000)]);
  }
});

test("January carry, new-member no-liability carry, and prior assessment blocker are exact", () => {
  const prior={noPriorLiability:false,annualRequired:"50000",monthlyMinimum:"2000",rightsPaidTotal:"50000",assessmentRequired:"0",assessmentPaid:"0"};
  assert.deepEqual(evaluateDuesRights(base({evaluationInstant:"2026-01-10T12:00:00+09:00",paidTotal:"0",rightsPaidTotal:"0",priorYear:prior})).rightsStatus,"rights_member");
  assert.equal(evaluateDuesRights(base({evaluationInstant:"2026-01-10T12:00:00+09:00",paidTotal:"0",rightsPaidTotal:"0",priorYear:prior})).reasonCode,"january_carry");
  assert.equal(evaluateDuesRights(base({evaluationInstant:"2026-01-10T12:00:00+09:00",paidTotal:"0",rightsPaidTotal:"0",priorYear:{...prior,noPriorLiability:true,rightsPaidTotal:"0"}})).reasonCode,"january_carry");
  assert.equal(evaluateDuesRights(base({evaluationInstant:"2026-01-10T12:00:00+09:00",paidTotal:"0",rightsPaidTotal:"0",priorYear:{...prior,assessmentRequired:"10000",assessmentPaid:"0"}})).reasonCode,"assessment_shortfall");
});

test("all six tiers accept annual completion immediately and honorary stays honorary", () => {
  const tiers: Array<[DuesTierCode,string,string]>=[["president","100000","1200000"],["senior_vice_president","50000","600000"],["vice_president_auditor_chair","30000","400000"],["director","10000","200000"],["member","2000","50000"]];
  for(const [tier,monthly,annual] of tiers){const result=evaluateDuesRights(base({tierCode:tier,monthlyMinimum:monthly,annualMinimum:annual,paidTotal:annual,rightsPaidTotal:annual}));assert.deepEqual([result.rightsStatus,result.reasonCode],["rights_member","annual_complete"]);}
  const honorary=evaluateDuesRights(base({memberKind:"honorary",tierCode:"honorary",monthlyMinimum:"0",annualMinimum:"0",paidTotal:"50000",rightsPaidTotal:"50000",specialAssessmentRequired:"0",specialAssessmentRightsRequired:"0"}));
  assert.deepEqual([honorary.rightsStatus,honorary.reasonCode],["honorary","honorary"]);
});

test("pledge shortfall is display-only while assessments independently block rights", () => {
  const pledgeOnly=evaluateDuesRights(base({paidTotal:"10000",rightsPaidTotal:"10000",pledgeMonthlyAmounts:Array(12).fill("10000")}));
  assert.equal(pledgeOnly.rightsStatus,"rights_member"); assert.equal(pledgeOnly.pledgeShortfall,"40000");
  const assessment=evaluateDuesRights(base({specialAssessmentRequired:"50000",specialAssessmentPaid:"0",specialAssessmentRightsRequired:"50000",specialAssessmentRightsPaid:"0"}));
  assert.deepEqual([assessment.rightsStatus,assessment.reasonCode],["member","assessment_shortfall"]);
  const paid=evaluateDuesRights(base({specialAssessmentRequired:"50000",specialAssessmentPaid:"50000",specialAssessmentRightsRequired:"50000",specialAssessmentRightsPaid:"50000"}));
  assert.equal(paid.rightsStatus,"rights_member");
});

test("role increase changes future thresholds without rewriting prior evaluation", () => {
  const before=evaluateDuesRights(base({evaluationInstant:"2026-05-31T23:59:59+09:00"}));
  const after=evaluateDuesRights(base({evaluationInstant:"2026-06-01T00:00:00+09:00",tierCode:"director",monthlyMinimum:"10000",annualMinimum:"200000"}));
  assert.deepEqual([before.monthlyRequiredToDate,before.rightsStatus],["10000","rights_member"]);
  assert.deepEqual([after.monthlyRequiredToDate,after.rightsStatus],["50000","member"]);
});

test("ordinary negatives start next KST month while proven corrections retain original instant", () => {
  assert.equal(negativeAllocationEffectiveAt({observedAt:"2026-12-31T23:59:59+09:00",originalEffectiveAt:"2026-06-01T00:00:00+09:00",correctionReasonCode:null,correctionEvidenceSha256:null}),"2027-01-01T00:00:00+09:00");
  assert.equal(negativeAllocationEffectiveAt({observedAt:"2026-07-10T12:00:00+09:00",originalEffectiveAt:"2026-06-01T00:00:00+09:00",correctionReasonCode:"source_error",correctionEvidenceSha256:"a".repeat(64)}),"2026-06-01T00:00:00+09:00");
  assert.throws(()=>negativeAllocationEffectiveAt({observedAt:"2026-07-10T12:00:00+09:00",originalEffectiveAt:"2026-06-01T00:00:00+09:00",correctionReasonCode:"false_transaction",correctionEvidenceSha256:null}),/binding_invalid/);
});

test("noncanonical money and incomplete pledge months fail before projection", () => {
  assert.throws(()=>evaluateDuesRights(base({paidTotal:"01"})),/paid_total_invalid/);
  assert.throws(()=>evaluateDuesRights(base({pledgeMonthlyAmounts:["3000"]})),/pledge_month_closure_invalid/);
});
