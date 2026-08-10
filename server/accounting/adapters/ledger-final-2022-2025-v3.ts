import { canonicalJson, sha256, type CanonicalValue } from "../source-contracts";
import { sourceKeyDigest, sourceText } from "./admin-readable-source-v2";

type SourceRow = { coordinateKey: string; values: Record<string, CanonicalValue> };

function fail(code: string): never { throw new Error(code); }
function text(value: CanonicalValue): string { return sourceText(value) ?? ""; }
function money(value: CanonicalValue): { absolute: string; signed: number } {
  const normalized = text(value).replaceAll(",", "").replaceAll("원", "").replace(/[^0-9.-]/g, "");
  if (!/^-?\d+(?:\.0+)?$/.test(normalized)) fail("ledger_v3_money_invalid");
  const signed = Number(normalized);
  if (!Number.isSafeInteger(signed) || signed === 0) fail("ledger_v3_money_invalid");
  return { absolute: String(Math.abs(signed)), signed };
}
function partsToKst(year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day || probe.getUTCHours() !== hour || probe.getUTCMinutes() !== minute || probe.getUTCSeconds() !== second) fail("ledger_v3_datetime_invalid");
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${year}-${pad(month)}-${pad(day)}`;
  return { occurred_at: `${date}T${pad(hour)}:${pad(minute)}:${pad(second)}+09:00`, occurred_date: date, year };
}
export function parseLedgerDateV3(value: CanonicalValue) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = Math.round(value * 86_400_000);
    const date = new Date(Date.UTC(1899, 11, 30) + milliseconds);
    return partsToKst(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
  }
  const normalized = text(value).replace(/\s+/g, " ");
  const match = normalized.match(/^(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})\.?\s*(?:(오전|오후)\s*)?(\d{1,2})?(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
  if (!match) fail("ledger_v3_datetime_invalid");
  let hour = Number(match[5] ?? 0);
  if (match[4] === "오전" && hour === 12) hour = 0;
  if (match[4] === "오후" && hour < 12) hour += 12;
  return partsToKst(Number(match[1]), Number(match[2]), Number(match[3]), hour, Number(match[6] ?? 0), Number(match[7] ?? 0));
}
function joined(values: CanonicalValue[]): string {
  return values.map((value) => sourceText(value)).filter((value): value is string => value !== null).join(" · ");
}

export function normalizeLedgerFinalRowV3(row: SourceRow) {
  const amount = money(row.values["거래금액"]);
  const label = text(row.values["구분"]);
  const direction = label === "수입" ? "credit" : label === "지출" ? "debit" : amount.signed > 0 ? "credit" : "debit";
  const date = parseLedgerDateV3(row.values["거래일시"]);
  const descriptionSnapshot = joined([row.values["내용"] ?? null, row.values["거래구분"] ?? null, row.values["메모"] ?? null]);
  if (!descriptionSnapshot) fail("ledger_v3_description_missing");
  const payerSnapshot = joined([row.values["내용"] ?? null, row.values["메모"] ?? null]) || null;
  return {
    amount: amount.absolute,
    coordinate_key: row.coordinateKey,
    coordinate_kind: "economic",
    description_digest: sourceKeyDigest("ledger-description", descriptionSnapshot, true),
    description_snapshot: descriptionSnapshot,
    direction,
    dues_year: null,
    occurred_at: date.occurred_at,
    occurred_date: date.occurred_date,
    payer_name_key_digest: sourceKeyDigest("ledger-payer-name", payerSnapshot, false),
    payer_name_snapshot: payerSnapshot,
    period_code: `CALENDAR_${date.year}`,
  };
}

export function ledgerPeriodRowV3(year: number) {
  if (!Number.isInteger(year) || year < 2022 || year > 2025) fail("ledger_v3_period_year_invalid");
  const startsAt = `${year}-01-01T00:00:00+09:00`;
  const endsAt = `${year + 1}-01-01T00:00:00+09:00`;
  const boundaryCoordinateKey = `constant:ledger-final-2022-2025:calendar:${year}`;
  const boundaryContentDigest = sha256(canonicalJson({ boundary_coordinate_key: boundaryCoordinateKey, boundary_source_code: "LEDGER_FINAL_2022_2025", ends_at: endsAt, period_code: `CALENDAR_${year}`, starts_at: startsAt }));
  return { boundary_content_digest: boundaryContentDigest, boundary_coordinate_key: boundaryCoordinateKey, boundary_source_code: "LEDGER_FINAL_2022_2025", coordinate_kind: "period_metadata", ends_at: endsAt, period_code: `CALENDAR_${year}`, starts_at: startsAt };
}
