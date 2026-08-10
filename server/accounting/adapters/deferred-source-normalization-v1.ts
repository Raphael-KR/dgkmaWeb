import { createHmac } from "node:crypto";
import { canonicalJson, sha256, type CanonicalValue } from "../source-contracts";

export const DEFERRED_SOURCE_CODES = [
  "AGM36_PERIOD_BOUNDARY", "BANK_IBK_2026", "BANK_TOSS_2026", "GROUP_FOREIGN_FACULTY_2025",
  "LEDGER_DUES_POLICY_2024_2025", "LEDGER_FINAL_2022_2025", "LEGACY_PAYMENTS", "NOTION_DUES_REGULATION_DRAFT",
] as const;

export type DeferredSourceCode = typeof DEFERRED_SOURCE_CODES[number];
export type DeferredMapping = Record<string, CanonicalValue> & {
  adapter_code: string;
  columns: Array<Record<string, CanonicalValue>>;
  output_family: string;
  parsers: Record<string, CanonicalValue>;
  source_code: DeferredSourceCode;
};

export type RawSourceRow = {
  coordinateKey: string;
  recordKind: string;
  values: Record<string, CanonicalValue>;
};

function fail(code: string): never { throw new Error(code); }
function text(value: CanonicalValue): string { return String(value ?? "").normalize("NFC").trim(); }
function money(value: CanonicalValue): string {
  const normalized = text(value).replaceAll(",", "").replaceAll("원", "").replace(/[^0-9-]/g, "");
  if (!/^-?\d+$/.test(normalized)) fail("deferred_source_money_invalid");
  return String(Math.abs(Number(normalized)));
}
function sourceValue(selector: Record<string, CanonicalValue>, row: RawSourceRow): CanonicalValue {
  const kind = String(selector.kind);
  if (kind === "constant") return selector.value ?? null;
  if (kind === "section_or_constant") return row.values[String(selector.value)] ?? selector.value ?? null;
  if (kind === "constant_pair") {
    const index = Number(row.values.constant_pair_index);
    const values = selector.values as CanonicalValue[];
    return Number.isInteger(index) && index >= 0 && index < values.length ? values[index] : fail("deferred_source_constant_pair_index_invalid");
  }
  if (kind === "batch_field" || kind === "column" || kind === "computed" || kind === "header" || kind === "label" || kind === "phrase") return row.values[String(selector.value)];
  if (kind === "headers" || kind === "headers_joined") return (selector.values as CanonicalValue[]).map((key) => row.values[String(key)] ?? null);
  fail("deferred_source_selector_unknown");
}
function hmac(value: CanonicalValue, key: Buffer, nullable: boolean): string | null {
  const joined = Array.isArray(value) ? value.map(text).filter(Boolean).join("\u001f") : text(value);
  if (!joined) return nullable ? null : fail("deferred_source_required_digest_input_missing");
  return createHmac("sha256", key).update(joined).digest("hex");
}
function parse(parserCode: string, selector: Record<string, CanonicalValue>, row: RawSourceRow, hmacKey: Buffer): CanonicalValue {
  const value = sourceValue(selector, row);
  if (parserCode === "constant_v1" || parserCode === "period_boundary_reference_v1" || parserCode === "payload_digest_reference_v1") return value ?? null;
  if (parserCode === "hmac_sha256_required_nfc_trim_v1" || parserCode === "ledger_description_digest_v1" || parserCode === "bank_payer_digest_v1") return hmac(value, hmacKey, false);
  if (parserCode === "hmac_sha256_nullable_nfc_trim_v1") return hmac(value, hmacKey, true);
  if (["absolute_money_v1", "bank_amount_v1", "bank_balance_v1", "canonical_money_constant_v1", "policy_amount_v1"].includes(parserCode)) return money(value);
  if (parserCode === "korean_generation_required_v1") { const match = text(value).match(/\d+/); return match ? Number(match[0]) : fail("deferred_source_generation_invalid"); }
  if (parserCode === "nullable_integer_v1") return value === null || text(value) === "" ? null : Number(text(value));
  if (parserCode === "nullable_year_v1") return null;
  if (parserCode === "legacy_amount_parse_v1") return { canonical_amount: money(value), source_signed: text(value) };
  if (parserCode === "row_coordinate_v1") return row.coordinateKey;
  if (parserCode === "ledger_direction_v1") {
    const [label, amount] = value as CanonicalValue[];
    const normalizedLabel = text(label);
    if (normalizedLabel === "수입") return "credit";
    if (normalizedLabel === "지출") return "debit";
    const signed = Number(text(amount).replaceAll(",", ""));
    return signed > 0 ? "credit" : signed < 0 ? "debit" : fail("deferred_source_direction_ambiguous");
  }
  if (parserCode === "bank_direction_v1") {
    const values = value as CanonicalValue[];
    if (values.length === 1) { const signed = Number(text(values[0]).replaceAll(",", "")); return signed > 0 ? "credit" : signed < 0 ? "debit" : fail("deferred_source_direction_ambiguous"); }
    const debit = text(values[0]); const credit = text(values[1]);
    if (Boolean(debit) === Boolean(credit)) fail("deferred_source_bank_direction_exclusive_required");
    return debit ? "debit" : "credit";
  }
  if (parserCode === "calendar_period_v1") return `CALENDAR_${text(value)}`;
  if (parserCode === "policy_year_v1") { const match = text(value).match(/20\d{2}/); return match ? Number(match[0]) : fail("deferred_source_policy_year_invalid"); }
  if (parserCode === "policy_tier_v1" || parserCode === "text_enum_v1") return text(value);
  if (["sheet_datetime_kst_v1", "bank_datetime_kst_v1", "legacy_created_at_v1"].includes(parserCode)) return text(value) || null;
  fail("deferred_source_parser_unknown");
}

export function normalizeDeferredSourceRow(mapping: DeferredMapping, row: RawSourceRow, hmacKey: Buffer) {
  if (!DEFERRED_SOURCE_CODES.includes(mapping.source_code)) fail("deferred_source_code_unknown");
  if (!row.coordinateKey.normalize("NFC").trim()) fail("deferred_source_coordinate_missing");
  if (hmacKey.length < 32) fail("deferred_source_hmac_key_too_short");
  const columns = mapping.columns.filter((column) => column.record_kind === row.recordKind);
  if (columns.length === 0) fail("deferred_source_record_kind_unknown");
  const normalizedPayload: Record<string, CanonicalValue> = {};
  for (const column of columns) {
    const target = String(column.target_field);
    const parsed = parse(String(column.parser_code), column.source_selector as Record<string, CanonicalValue>, row, hmacKey);
    if (column.required === true && (parsed === null || parsed === "")) fail("deferred_source_required_value_missing");
    normalizedPayload[target] = parsed;
  }
  if (mapping.source_code === "GROUP_FOREIGN_FACULTY_2025") {
    if (normalizedPayload.proposed_amount !== "50000") fail("foreign_faculty_candidate_amount_mismatch");
    normalizedPayload.allocation_status = "candidate_only";
  }
  const envelope = {
    schema_version: "deferred-source-normalized-row-v1",
    source_code: mapping.source_code,
    output_family: mapping.output_family,
    record_kind: row.recordKind,
    coordinate_key: row.coordinateKey.normalize("NFC").trim(),
    normalized_payload: normalizedPayload,
  };
  return { envelope, contentDigest: sha256(canonicalJson(envelope)) };
}
