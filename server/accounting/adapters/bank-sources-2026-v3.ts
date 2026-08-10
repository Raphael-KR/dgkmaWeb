import { sourceKeyDigest, sourceText } from "./admin-readable-source-v2";
import { parseLedgerDateV3 } from "./ledger-final-2022-2025-v3";
import type { CanonicalValue } from "../source-contracts";

type BankCode = "BANK_TOSS_2026" | "BANK_IBK_2026";
type SourceRow = { coordinateKey: string; values: Record<string, CanonicalValue> };
function fail(code: string): never { throw new Error(code); }
function text(value: CanonicalValue): string { return sourceText(value) ?? ""; }
function amount(value: CanonicalValue, allowZero = false): number {
  const normalized = text(value).replaceAll(",", "").replaceAll("원", "").replace(/[^0-9.-]/g, "");
  if (!/^-?\d+(?:\.0+)?$/.test(normalized)) fail("bank_v3_money_invalid"); const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || (!allowZero && parsed === 0)) fail("bank_v3_money_invalid"); return parsed;
}
function snapshot(values: CanonicalValue[]): string | null { return values.map((value) => sourceText(value)).filter((value): value is string => value !== null).join(" · ") || null; }

export function normalizeBankRowV3(sourceCode: BankCode, row: SourceRow) {
  const isToss = sourceCode === "BANK_TOSS_2026"; let signed: number; let direction: "credit" | "debit";
  if (isToss) { signed = amount(row.values["거래 금액"]); direction = signed > 0 ? "credit" : "debit"; }
  else {
    const debitText = text(row.values["출금"]); const creditText = text(row.values["입금"]); const hasDebit = debitText !== "" && amount(row.values["출금"], true) !== 0; const hasCredit = creditText !== "" && amount(row.values["입금"], true) !== 0;
    if (hasDebit === hasCredit) fail("bank_v3_direction_exclusive_required"); signed = hasDebit ? -Math.abs(amount(row.values["출금"])) : Math.abs(amount(row.values["입금"])); direction = hasDebit ? "debit" : "credit";
  }
  const date = parseLedgerDateV3(row.values[isToss ? "거래 일시" : "거래일시"]);
  const payer = sourceText(row.values[isToss ? "적요" : "상대계좌예금주명"]);
  const description = isToss ? snapshot([row.values["거래 유형"] ?? null, row.values["거래 기관"] ?? null, row.values["메모"] ?? null]) : snapshot([row.values["거래내용"] ?? null, row.values["상대은행"] ?? null, row.values["메모"] ?? null]);
  if (!payer && !description) fail("bank_v3_display_missing");
  const balance = amount(row.values[isToss ? "거래 후 잔액" : "거래후 잔액"], true); if (balance < 0) fail("bank_v3_balance_invalid");
  return { amount: String(Math.abs(signed)), balance_after: String(balance), direction, occurred_at: date.occurred_at, payer_name_key_digest: sourceKeyDigest("bank-payer-name", payer, false), payer_name_snapshot: payer, posted_date: date.occurred_date, provider_row_id: row.coordinateKey, transaction_description_digest: sourceKeyDigest("bank-transaction-description", description, false), transaction_description_snapshot: description };
}
