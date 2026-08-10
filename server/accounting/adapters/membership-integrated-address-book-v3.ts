import { sourceKeyDigest, sourceText } from "./admin-readable-source-v2";

export const membershipIntegratedAddressBookAdapterV3 = Object.freeze({
  adapterCode: "membership-integrated-address-book-v3",
  sourceCode: "MEMBERSHIP_INTEGRATED_ADDRESS_BOOK",
  outputFamily: "member-identity-row-v2",
  normalizationVersion: "membership-integrated-address-book-v3@3.0.0+numeric-source-cells-v1",
});

function generation(value: unknown): number | null {
  const normalized = sourceText(value);
  if (normalized === null) return null;
  const match = normalized.match(/^(?:졸업)?\s*(\d{1,3})\s*(?:기)?$/);
  if (!match) throw new Error("mapping_review_required:generation");
  const parsed = Number(match[1]);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error("mapping_review_required:generation");
  return parsed;
}

function date(value: unknown): string | null {
  const normalized = sourceText(value);
  if (normalized === null) return null;
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    const serial = Number(normalized);
    if (!Number.isFinite(serial) || serial < 1) throw new Error("mapping_review_required:date");
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
  }
  const match = normalized.match(/^(\d{4})[.-](\d{1,2})[.-](\d{1,2})$/);
  if (!match) throw new Error("mapping_review_required:date");
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new Error("mapping_review_required:date");
  return parsed.toISOString().slice(0, 10);
}

export function normalizeMembershipIdentityRowV3(row: Record<string, unknown>) {
  const name = sourceText(row["성명"], true)!;
  const memberKind = sourceText(row["그룹"]);
  const status = sourceText(row["상태"]);
  return Object.freeze({
    name_snapshot: name,
    name_key_digest: sourceKeyDigest("member-name-key", name, true),
    generation: generation(row["기수"]),
    admitted_on: date(row["입학일자"]),
    graduated_on: date(row["졸업일자"]),
    member_kind_evidence_snapshot: memberKind,
    member_kind_evidence_digest: sourceKeyDigest("member-kind-evidence", memberKind),
    source_status_snapshot: status,
    source_status_digest: sourceKeyDigest("member-status-evidence", status),
    source_timezone: "Asia/Seoul",
  });
}
