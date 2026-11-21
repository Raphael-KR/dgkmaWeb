import type { Express } from "express";
import { ADMIN_DUES_LEDGER_PATH, type DuesLedgerReport } from "@shared/contracts/admin-dues-ledger";
import { pool } from "../../db";
import type { RouteContext } from "../../lib/route-context";
import { getErrorType } from "../../lib/safe-logging";

type PivotTotals = Pick<Extract<DuesLedgerReport, { status: "ready" }>, "years" | "members">;

async function readDuesLedger(): Promise<DuesLedgerReport> {
  const schema = await pool.query<{ installed: boolean }>(
    "SELECT to_regclass('public.dues_receipts') IS NOT NULL AS installed",
  );
  if (!schema.rows[0].installed) return { status: "awaiting_schema" };

  // Each row is either a member allocation or one unallocated receipt. Group
  // payments by their dues year, which can differ from the bank deposit year.
  const totals = await pool.query<PivotTotals>(`
    WITH entries AS (
      SELECT p.year, p.amount, u.id AS member_id,
             CASE WHEN u.id IS NULL THEN '회원 연결 해제'
                  ELSE coalesce(nullif(src.item->>'label', ''), '원장 표기 없음') END AS payer,
             CASE WHEN u.id IS NULL THEN '회원 연결 해제'
                  ELSE coalesce(nullif(src.item->>'memberLabel', ''), '원장 표기 없음') END AS member_label
      FROM public.payments p
      JOIN public.dues_receipts r ON r.id = p.dues_receipt_id
      LEFT JOIN public.users u ON u.id = p.user_id
        AND u.alumni_status NOT IN ('동문회 탈퇴자', '사망')
      LEFT JOIN LATERAL (
        SELECT item FROM jsonb_array_elements(r.source_rows) AS src_row(item)
        WHERE (item->>'allocationKey')::uuid = p.dues_allocation_key
      ) src ON true
      WHERE p.status = 'ledger_staged'
      UNION ALL
      SELECT r.unallocated_year, r.amount, NULL::uuid, '미배분', '미배분'
      FROM public.dues_receipts r WHERE r.unallocated_year IS NOT NULL
    ), payer_totals AS (
      SELECT year, payer AS label, count(*) AS count, sum(amount) AS amount
      FROM entries GROUP BY year, payer
    ), years AS (
      SELECT year, sum(count) AS count, sum(amount) AS amount,
             jsonb_agg(jsonb_build_object('label', label, 'count', count, 'amount', amount)
                       ORDER BY label) AS payers
      FROM payer_totals GROUP BY year
    ), member_years AS (
      SELECT member_id, member_label, year, sum(amount) AS amount
      FROM entries GROUP BY member_id, member_label, year
    ), members AS (
      SELECT member_id, member_label AS label, jsonb_object_agg(year, amount) AS amounts,
             sum(amount) AS total
      FROM member_years GROUP BY member_id, member_label
    )
    SELECT coalesce((SELECT jsonb_agg(years ORDER BY year DESC) FROM years), '[]'::jsonb) AS years,
           coalesce((SELECT jsonb_agg(to_jsonb(members) - 'member_id'
                                      ORDER BY label, member_id) FROM members), '[]'::jsonb) AS members
  `);
  return { status: "ready", ...totals.rows[0] };
}

export function registerAdminDuesLedgerRoute(app: Express, { requireAdmin }: RouteContext): void {
  app.get(ADMIN_DUES_LEDGER_PATH, requireAdmin, async (_req, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      res.json(await readDuesLedger());
    } catch (error) {
      console.error("Admin dues ledger read failed", { errorType: getErrorType(error) });
      res.status(500).json({ message: "회비수입 집계를 불러오지 못했습니다." });
    }
  });
}
