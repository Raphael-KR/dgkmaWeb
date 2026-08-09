import { createHmac } from "node:crypto";

export const membershipIntegratedAddressBookAdapter = Object.freeze({
  adapterCode: "membership-integrated-address-book-v1",
  sourceCode: "MEMBERSHIP_INTEGRATED_ADDRESS_BOOK",
  outputFamily: "member-identity-row-v1",
  normalizationVersion: "membership-integrated-address-book-v1@1.0.0+pii-hmac-v1",
});

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).normalize("NFC").trim();
  return normalized.length === 0 ? null : normalized;
}

function digest(value: unknown, domain: string, key: string, required: boolean): string | null {
  const normalized = text(value);
  if (normalized === null) {
    if (required) throw new Error(`mapping_review_required:${domain}`);
    return null;
  }
  return createHmac("sha256", key).update(`${domain}-v1\n${normalized}`).digest("hex");
}

function generation(value: unknown): number | null {
  const normalized = text(value);
  if (normalized === null) return null;
  const match = normalized.match(/^(?:졸업)?\s*(\d{1,3})\s*기$/);
  if (!match) throw new Error("mapping_review_required:generation");
  return Number(match[1]);
}

function date(value: unknown): string | null {
  const normalized = text(value);
  if (normalized === null) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error("mapping_review_required:date");
  const serial = Number(normalized);
  const utc = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000;
  return new Date(utc).toISOString().slice(0, 10);
}

export function normalizeMembershipIdentityRow(row: Record<string, unknown>, hmacKey: string) {
  if (!hmacKey) throw new Error("source_row_hmac_key_missing");
  return Object.freeze({
    name_digest: digest(row["성명"], "member-name", hmacKey, true),
    generation: generation(row["기수"]),
    admitted_on: date(row["입학일자"]),
    graduated_on: date(row["졸업일자"]),
    member_kind_evidence_digest: digest(row["그룹"], "member-kind-evidence", hmacKey, false),
    source_status_digest: digest(row["상태"], "member-status-evidence", hmacKey, false),
    source_timezone: "Asia/Seoul",
  });
}
