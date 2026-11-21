export const ADMIN_DUES_LEDGER_PATH = "/api/admin/dues/ledger";

type PayerTotal = { label: string; count: number; amount: number };
type YearTotal = { year: number; count: number; amount: number; payers: PayerTotal[] };
type MemberTotal = { label: string; amounts: Record<string, number>; total: number };

export type DuesLedgerReport =
  { status: "awaiting_schema" } | { status: "ready"; years: YearTotal[]; members: MemberTotal[] };
