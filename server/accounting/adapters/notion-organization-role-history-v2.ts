import { sourceKeyDigest, sourceText } from "./admin-readable-source-v2";

export const notionOrganizationRoleHistoryAdapterV2 = Object.freeze({
  adapterCode: "notion-organization-role-history-v2",
  sourceCode: "NOTION_ORGANIZATION_ROLE_HISTORY",
  outputFamily: "role-row-v3",
  normalizationVersion: "notion-organization-role-history-v2@2.0.0+admin-readable-v1",
});

const ORGANIZATIONS: Record<string, string> = {
  "동문회": "alumni_association", "지역지부": "regional_chapter",
  "졸업기수회": "graduation_class", "동문교수회": "alumni_faculty",
};
function integer(value: unknown, minimum: number, maximum: number): number | null {
  const normalized = sourceText(value);
  if (normalized === null) return null;
  const parsed = Number(normalized.replace(/[^0-9]/g, ""));
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error("mapping_review_required:integer");
  return parsed;
}
function position(value: unknown, organization: string): string {
  const normalized = sourceText(value, true)!;
  if (organization === "alumni_faculty") return "faculty_member";
  const exact: Record<string, string> = {
    "회장": "president", "수석부회장": "senior_vice_president", "부회장": "vice_president",
    "총회의장": "general_assembly_chair", "감사": "auditor", "명예회장": "honorary_president",
    "고문": "advisor", "지부장": "chapter_president",
  };
  if (exact[normalized]) return exact[normalized];
  if (normalized.endsWith("기장")) return "graduation_class_lead";
  if (normalized.endsWith("이사")) return "director";
  throw new Error(`mapping_review_required:position:${normalized}`);
}
function appointmentBasis(value: unknown): string {
  const normalized = sourceText(value, true)!;
  if (normalized.includes("선출")) return "election";
  if (normalized.includes("임명")) return "appointment";
  if (normalized.includes("겸임")) return "concurrent";
  if (normalized.includes("교수")) return "faculty";
  if (normalized.includes("역대") || normalized.includes("과거")) return "historical";
  throw new Error(`mapping_review_required:appointment_basis:${normalized}`);
}
function booleanValue(value: unknown): boolean {
  return value === true || value === "__YES__" || value === "예" || value === "true";
}

export function normalizeNotionRoleRowV2(row: Record<string, unknown>) {
  const organizationText = sourceText(row["조직구분"]);
  const organizationCode = organizationText ? ORGANIZATIONS[organizationText] : undefined;
  if (!organizationCode) throw new Error("mapping_review_required:organization");
  const displayPosition = sourceText(row["직위"], true)!;
  const editorialStatus = sourceText(row["상태"]);
  if (!editorialStatus || !["초안", "검토필요", "승인", "종료"].includes(editorialStatus)) throw new Error("mapping_review_required:status");
  const memberMatchStatus = sourceText(row["회원매칭상태"]);
  if (!memberMatchStatus || !["미매칭", "매칭", "중복후보"].includes(memberMatchStatus)) throw new Error("mapping_review_required:member_match_status");
  const matchedMemberUid = sourceText(row["matched_member_uid"]);
  if (matchedMemberUid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(matchedMemberUid)) throw new Error("mapping_review_required:matched_member_uid");
  const name = sourceText(row["표기명"], true)!;
  const note = sourceText(row["비고"]);
  const locator = sourceText(row["출처"]);
  const verification = sourceText(row["검증근거"]);
  return Object.freeze({
    generation: integer(row["졸업기수"], 1, 999),
    admission_year: integer(row["입학년도"], 1900, 2100),
    administration_no: integer(row["대수"], 1, 999),
    organization_code: organizationCode,
    position_code: position(displayPosition, organizationCode),
    display_position: displayPosition,
    source_appointment_date: sourceText(row["date:임명일:start"]),
    source_date_text: sourceText(row["date:임명일:start"]),
    date_precision: booleanValue(row["date:임기:is_datetime"]) ? "instant" : "day",
    effective_from: sourceText(row["date:임기:start"]),
    effective_to: sourceText(row["date:임기:end"]),
    appointment_basis: appointmentBasis(row["임명근거"]),
    editorial_status: editorialStatus,
    publication_allowed: booleanValue(row["공개여부"]),
    member_match_status: memberMatchStatus,
    matched_member_uid: matchedMemberUid,
    source_timezone: "Asia/Seoul",
    name_snapshot: name,
    name_key_digest: sourceKeyDigest("role-name-key", name, true),
    note_snapshot: note,
    note_digest: sourceKeyDigest("role-note", note),
    source_locator_snapshot: locator,
    source_locator_digest: sourceKeyDigest("role-source-locator", locator),
    verification_evidence_snapshot: verification,
    verification_evidence_digest: sourceKeyDigest("role-verification-evidence", verification),
  });
}
