import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { CanonicalValue } from "./source-contracts";

type JsonObject = Record<string, CanonicalValue>;

export type RoleDecisionEvidence = {
  decisionItemId: string;
  coordinateId: string;
  coordinateKey: string;
  sourceRowVersionId: string;
  contentDigest: string;
  normalizedPayload: JsonObject;
  decisionPayload: JsonObject;
};

export type RoleApplyPlan = {
  coordinateKey: string;
  memberId: string;
  memberUid: string;
  caseUid: string;
  assignmentUid: string;
  evidenceKind: string;
  evidenceDigest: string;
  scoreBasis: string;
  administrationNo: number;
  positionCode: string;
  displayPosition: string;
  sourceAppointmentDate: string | null;
  sourceDateText: string;
  datePrecision: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  appointmentBasis: string;
  subjectGeneration: string;
  subjectNameDigest: string;
  evidence: RoleDecisionEvidence;
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SCORE_BY_EVIDENCE: Record<string, string> = {
  existing_fk: "exact_existing_user_fk",
  roster_member_uid: "exact_roster_member_uid",
  canonical_email: "exact_canonical_email",
  canonical_phone: "exact_canonical_phone",
  canonical_mobile: "exact_canonical_mobile",
  board_roster_row: "exact_board_name_generation_position",
  bank_payer_reference: "exact_bank_payer_alias",
  manual_document: "manual_document_reference",
};

function fail(code: string): never { throw new Error(code); }
function compare(left: string, right: string): number { return Buffer.compare(Buffer.from(left), Buffer.from(right)); }
function string(value: CanonicalValue | undefined, code: string): string { if (typeof value !== "string" || !value) fail(code); return value; }
function timestamp(value: CanonicalValue | undefined, code: string): string { const result = string(value, code); if (!Number.isFinite(Date.parse(result))) fail(code); return result; }

export function deterministicRoleUuid(seed: string): string {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function loadRoleApplyPlans(
  client: Pick<PoolClient, "query">,
  sourceCode: string,
  operationUid: string,
  items: RoleDecisionEvidence[],
): Promise<RoleApplyPlan[]> {
  const approved = items.filter((item) => item.decisionPayload.outcome === "approve");
  if (approved.length === 0) return [];
  if (sourceCode !== "NOTION_ORGANIZATION_ROLE_HISTORY") return [];
  if (!UUID_V4.test(operationUid)) fail("source_decision_role_operation_uid_invalid");
  const plans = approved.map((item) => {
    const decision = item.decisionPayload;
    const normalized = item.normalizedPayload;
    if (decision.outcome !== "approve") fail("source_decision_role_outcome_invalid");
    const memberUid = string(decision.candidate_member_uid_or_null, "source_decision_role_member_uid_invalid");
    const caseUid = string(decision.case_uid, "source_decision_role_case_uid_invalid");
    const evidenceKind = string(decision.evidence_kind, "source_decision_role_evidence_invalid");
    const evidenceDigest = string(decision.evidence_digest, "source_decision_role_evidence_invalid");
    const scoreBasis = string(decision.score_basis, "source_decision_role_evidence_invalid");
    if (!UUID_V4.test(memberUid) || !UUID_V4.test(caseUid) || !SHA256.test(evidenceDigest) || SCORE_BY_EVIDENCE[evidenceKind] !== scoreBasis) fail("source_decision_role_evidence_invalid");
    const administrationNo = normalized.administration_no;
    const generation = normalized.generation;
    const positionCode = string(normalized.position_code, "source_decision_role_normalized_payload_invalid");
    const displayPosition = string(normalized.display_position, "source_decision_role_normalized_payload_invalid");
    const sourceDateText = string(normalized.source_date_text, "source_decision_role_normalized_payload_invalid");
    const datePrecision = string(normalized.date_precision, "source_decision_role_normalized_payload_invalid");
    const effectiveFrom = timestamp(normalized.effective_from, "source_decision_role_normalized_payload_invalid");
    const appointmentBasis = string(normalized.appointment_basis, "source_decision_role_normalized_payload_invalid");
    const nameDigest = string(normalized.name_key_digest, "source_decision_role_normalized_payload_invalid");
    const effectiveTo = normalized.effective_to;
    const sourceAppointmentDate = normalized.source_appointment_date;
    if (!Number.isInteger(administrationNo) || Number(administrationNo) <= 0 || !Number.isInteger(generation) || Number(generation) <= 0 || !SHA256.test(nameDigest) || !["day", "month", "year", "unknown"].includes(datePrecision) || !["election", "appointment", "concurrent", "historical"].includes(appointmentBasis) || effectiveTo !== null && (typeof effectiveTo !== "string" || !Number.isFinite(Date.parse(effectiveTo)) || Date.parse(effectiveFrom) >= Date.parse(effectiveTo)) || sourceAppointmentDate !== null && (typeof sourceAppointmentDate !== "string" || !DATE.test(sourceAppointmentDate))) fail("source_decision_role_normalized_payload_invalid");
    return {
      coordinateKey: item.coordinateKey,
      memberId: "",
      memberUid,
      caseUid,
      assignmentUid: deterministicRoleUuid(`${operationUid}\nrole-assignment\n${item.coordinateKey}`),
      evidenceKind,
      evidenceDigest,
      scoreBasis,
      administrationNo: Number(administrationNo),
      positionCode,
      displayPosition,
      sourceAppointmentDate: sourceAppointmentDate as string | null,
      sourceDateText,
      datePrecision,
      effectiveFrom,
      effectiveTo: effectiveTo as string | null,
      appointmentBasis,
      subjectGeneration: String(generation),
      subjectNameDigest: nameDigest,
      evidence: item,
    } satisfies RoleApplyPlan;
  }).sort((left, right) => compare(left.coordinateKey, right.coordinateKey));
  if (new Set(plans.map((plan) => plan.coordinateKey)).size !== plans.length || new Set(plans.map((plan) => plan.caseUid)).size !== plans.length || new Set(plans.map((plan) => plan.assignmentUid)).size !== plans.length) fail("source_decision_role_identity_collision");
  const memberUids = [...new Set(plans.map((plan) => plan.memberUid))].sort(compare);
  const members = await client.query<{ id: string; member_uid: string; status: string }>("SELECT id::text,member_uid::text,status FROM public.association_members WHERE member_uid=ANY($1::uuid[]) ORDER BY member_uid FOR UPDATE", [memberUids]);
  if (members.rowCount !== memberUids.length || members.rows.some((member, index) => member.member_uid !== memberUids[index] || member.status !== "active")) fail("source_decision_role_member_binding_missing");
  const caseCollision = await client.query("SELECT case_uid FROM public.member_match_cases WHERE case_uid=ANY($1::uuid[]) FOR UPDATE", [plans.map((plan) => plan.caseUid)]);
  const assignmentCollision = await client.query("SELECT assignment_uid FROM public.member_position_assignments WHERE assignment_uid=ANY($1::uuid[]) FOR UPDATE", [plans.map((plan) => plan.assignmentUid)]);
  if (caseCollision.rowCount !== 0 || assignmentCollision.rowCount !== 0) fail("source_decision_role_identity_collision");
  const memberIdByUid = Object.fromEntries(members.rows.map((member) => [member.member_uid, member.id]));
  return plans.map((plan) => ({ ...plan, memberId: memberIdByUid[plan.memberUid] }));
}
