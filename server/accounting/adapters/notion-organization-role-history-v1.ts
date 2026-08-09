import { createHash, createHmac } from "node:crypto";

export const notionOrganizationRoleHistoryAdapter = Object.freeze({
  adapterCode: "notion-organization-role-history-v1",
  sourceCode: "NOTION_ORGANIZATION_ROLE_HISTORY",
  outputFamily: "role-row-v2",
  normalizationVersion: "notion-organization-role-history-v1@1.0.0+pii-hmac-v1",
});

const ORGANIZATIONS: Record<string, string> = {
  "동문회": "alumni_association",
  "지역지부": "regional_chapter",
  "졸업기수회": "graduation_class",
  "동문교수회": "alumni_faculty",
};

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).normalize("NFC").trim();
  return normalized.length === 0 ? null : normalized;
}

function hmac(value: unknown, domain: string, key: string, required = false): string | null {
  const normalized = text(value);
  if (normalized === null) {
    if (required) throw new Error(`mapping_review_required:${domain}`);
    return null;
  }
  return createHmac("sha256", key).update(`${domain}-v1\n${normalized}`).digest("hex");
}

function plainDigest(value: unknown): string | null {
  const normalized = text(value);
  return normalized === null ? null : createHash("sha256").update(normalized).digest("hex");
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  const normalized = text(value);
  if (normalized === null) return null;
  const parsed = Number(normalized.replace(/[^0-9]/g, ""));
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error("mapping_review_required:integer");
  return parsed;
}

function position(value: unknown, organization: string): string {
  const normalized = text(value);
  if (!normalized) throw new Error("mapping_review_required:position");
  if (organization === "alumni_faculty") return "faculty_member";
  if (normalized === "회장") return "president";
  if (normalized === "수석부회장") return "senior_vice_president";
  if (normalized === "부회장") return "vice_president";
  if (normalized === "총회의장") return "general_assembly_chair";
  if (normalized === "감사") return "auditor";
  if (normalized === "명예회장") return "honorary_president";
  if (normalized === "고문") return "advisor";
  if (normalized === "지부장") return "chapter_president";
  if (normalized.endsWith("기장")) return "graduation_class_lead";
  if (normalized.endsWith("이사")) return "director";
  throw new Error(`mapping_review_required:position:${normalized}`);
}

function appointmentBasis(value: unknown): string {
  const normalized = text(value);
  if (!normalized) throw new Error("mapping_review_required:appointment_basis");
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

export function normalizeNotionRoleRow(row: Record<string, unknown>, hmacKey: string) {
  if (!hmacKey) throw new Error("source_row_hmac_key_missing");
  const organizationText = text(row["조직구분"]);
  const organizationCode = organizationText ? ORGANIZATIONS[organizationText] : undefined;
  if (!organizationCode) throw new Error("mapping_review_required:organization");
  const displayPosition = text(row["직위"]);
  if (!displayPosition) throw new Error("mapping_review_required:position");
  const editorialStatus = text(row["상태"]);
  if (!editorialStatus || !["초안", "검토필요", "승인", "종료"].includes(editorialStatus)) throw new Error("mapping_review_required:status");
  const memberMatchStatus = text(row["회원매칭상태"]);
  if (!memberMatchStatus || !["미매칭", "매칭", "중복후보"].includes(memberMatchStatus)) throw new Error("mapping_review_required:member_match_status");
  const matchedMemberUid = text(row["matched_member_uid"]);
  if (matchedMemberUid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(matchedMemberUid)) throw new Error("mapping_review_required:matched_member_uid");
  return Object.freeze({
    name_digest: hmac(row["표기명"], "role-name", hmacKey, true),
    generation: integer(row["졸업기수"], 1, 999),
    admission_year: integer(row["입학년도"], 1900, 2100),
    administration_no: integer(row["대수"], 1, 999),
    organization_code: organizationCode,
    position_code: position(displayPosition, organizationCode),
    display_position: displayPosition,
    source_appointment_date: text(row["date:임명일:start"]),
    source_date_text: text(row["date:임명일:start"]),
    date_precision: booleanValue(row["date:임기:is_datetime"]) ? "instant" : "day",
    effective_from: text(row["date:임기:start"]),
    effective_to: text(row["date:임기:end"]),
    appointment_basis: appointmentBasis(row["임명근거"]),
    editorial_status: editorialStatus,
    publication_allowed: booleanValue(row["공개여부"]),
    member_match_status: memberMatchStatus,
    matched_member_uid: matchedMemberUid,
    note_digest: hmac(row["비고"], "role-note", hmacKey),
    source_locator_digest: plainDigest(row["출처"]),
    verification_evidence_digest: plainDigest(row["검증근거"]),
    source_timezone: "Asia/Seoul",
  });
}
