import { isDeepStrictEqual } from "node:util";
import pg from "pg";

const workspaceId = "dc5e5541-525b-4ad6-b914-2d2db70cb4a9";

class LedgerPreviewError extends Error {}

function developmentClient() {
  const { REPL_ID, REPLIT_DEPLOYMENT, PGHOST, PGUSER, PGDATABASE, PGPORT, PGPASSWORD } =
    process.env;
  if (
    REPL_ID !== workspaceId ||
    REPLIT_DEPLOYMENT === "1" ||
    PGDATABASE !== "heliumdb" ||
    !PGUSER ||
    !PGHOST
  ) {
    throw new LedgerPreviewError("Replit 개발 워크스페이스의 PG* 연결이 필요합니다.");
  }
  return new pg.Client({
    host: PGHOST,
    port: Number(PGPORT || 5432),
    user: PGUSER,
    password: PGPASSWORD,
    database: PGDATABASE,
    ssl: /^(?:localhost|127\.0\.0\.1|helium(?:\.|$))/.test(PGHOST)
      ? false
      : { rejectUnauthorized: true },
    application_name: "dues-ledger-preview",
    connectionTimeoutMillis: 10000,
    statement_timeout: 60000,
    options: "-c default_transaction_read_only=on",
  });
}

function indexAllocations(rows) {
  const byReceipt = new Map();
  for (const row of rows) {
    if (!byReceipt.has(row.receiptKey)) byReceipt.set(row.receiptKey, new Map());
    byReceipt.get(row.receiptKey).set(row.allocationKey, row);
  }
  return byReceipt;
}

function sameReceipt(expected, stored, allocations) {
  if (
    expected.receivedOn !== stored.receivedOn ||
    expected.bankAmount !== stored.bankAmount ||
    expected.amount !== stored.amount ||
    (expected.unallocatedYear ?? null) !== stored.unallocatedYear ||
    expected.allocations.length !== allocations.size
  )
    return false;

  for (const entry of expected.allocations) {
    const payment = allocations.get(entry.allocationKey);
    if (
      !payment ||
      payment.year !== entry.year ||
      payment.amount !== entry.amount ||
      (payment.userId !== null && payment.userId !== entry.userId) ||
      payment.status !== "ledger_staged" ||
      payment.type !== "연회비"
    )
      return false;
  }

  // Compare with the same redaction as the withdrawal trigger; never suggest restoring a cleared link.
  const sourceRows = expected.sourceRows.map((row) =>
    allocations.get(row.allocationKey)?.userId === null
      ? { ...row, label: "연결 해제", memberLabel: "연결 해제" }
      : row,
  );
  return isDeepStrictEqual(sourceRows, stored.sourceRows);
}

async function compareSnapshot(client, receipts) {
  const { rows: storedReceipts } = await client.query(`
    SELECT id AS "receiptKey", to_char(received_on, 'YYYY-MM-DD') AS "receivedOn",
           bank_amount AS "bankAmount", amount, unallocated_year AS "unallocatedYear",
           source_rows AS "sourceRows"
      FROM public.dues_receipts`);
  const { rows: storedPayments } = await client.query(`
    SELECT dues_receipt_id AS "receiptKey", dues_allocation_key AS "allocationKey",
           user_id AS "userId", year, amount, type, status
      FROM public.payments WHERE dues_receipt_id IS NOT NULL`);
  const storedByKey = new Map(storedReceipts.map((row) => [row.receiptKey, row]));
  const paymentsByReceipt = indexAllocations(storedPayments);
  const newMemberYears = new Map();
  // One accounting receipt per issue is enough to locate it in the office's private review.
  const examples = new Map();
  let added = 0;
  let identical = 0;
  let changed = 0;

  for (const receipt of receipts) {
    const stored = storedByKey.get(receipt.receiptKey);
    if (!stored) {
      added++;
      for (const { userId, year } of receipt.allocations) {
        if (!newMemberYears.has(userId)) newMemberYears.set(userId, new Map());
        newMemberYears.get(userId).set(year, receipt.receiptKey);
      }
    } else if (
      sameReceipt(receipt, stored, paymentsByReceipt.get(receipt.receiptKey) ?? new Map())
    ) {
      identical++;
    } else {
      changed++;
      examples.set("기존 입금 변경", receipt.receiptKey);
    }
    storedByKey.delete(receipt.receiptKey);
  }

  const newMemberIds = [...newMemberYears.keys()];
  const { rows: members } = await client.query(
    "SELECT id, alumni_status FROM public.users WHERE id = ANY($1::uuid[])",
    [newMemberIds],
  );
  const statusByMember = new Map(members.map((row) => [row.id, row.alumni_status]));
  let unknownMembers = 0;
  let ineligibleMembers = 0;
  for (const [userId, years] of newMemberYears) {
    if (!statusByMember.has(userId)) {
      unknownMembers++;
      examples.set("동문 대조 필요", years.values().next().value);
    } else if (["동문회 탈퇴자", "사망"].includes(statusByMember.get(userId))) {
      ineligibleMembers++;
      examples.set("회원 상태 대조 필요", years.values().next().value);
    }
  }
  const { rows: legacy } = await client.query(
    `SELECT user_id AS "userId", year FROM public.payments
      WHERE dues_receipt_id IS NULL AND type = '연회비' AND status = 'completed'
        AND user_id = ANY($1::uuid[])`,
    [newMemberIds],
  );
  let legacyPaymentConflicts = 0;
  for (const row of legacy) {
    const receiptKey = newMemberYears.get(row.userId)?.get(row.year);
    if (receiptKey) {
      legacyPaymentConflicts++;
      examples.set("기존 연회비와 대조 필요", receiptKey);
    }
  }
  const missing = storedByKey.size;
  if (missing) examples.set("원장에서 입금 누락", storedByKey.keys().next().value);
  const detachedAllocations = storedPayments.filter((row) => row.userId === null).length;
  const ok =
    !changed && !missing && !unknownMembers && !ineligibleMembers && !legacyPaymentConflicts;
  return {
    ok,
    upToDate: ok && added === 0,
    added,
    identical,
    changed,
    missing,
    detachedAllocations,
    unknownMembers,
    ineligibleMembers,
    legacyPaymentConflicts,
    examples: [...examples].map(([reason, receiptKey]) => ({ reason, receiptKey })),
  };
}

// Each call opens a fresh read-only snapshot for preflight or post-import verification.
export async function compareDevelopmentLedger(receipts) {
  if (!receipts.length || new Set(receipts.map((row) => row.receiptKey)).size !== receipts.length) {
    throw new LedgerPreviewError("전체 원장 묶음이 비어 있거나 입금 식별자가 중복됩니다.");
  }
  const client = developmentClient();
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const {
      rows: [target],
    } = await client.query(`
      SELECT current_database() AS db,
             to_regclass('public.dues_receipts') IS NOT NULL AS ready`);
    if (target.db !== "heliumdb") throw new LedgerPreviewError("개발 DB를 확인하세요.");
    if (!target.ready) {
      throw new LedgerPreviewError(
        "개발 DB에 회비 원장 스키마가 아직 없습니다. 시트 검산만 가능합니다.",
      );
    }
    const result = await compareSnapshot(client, receipts);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    if (error instanceof LedgerPreviewError) throw error;
    if (["42P01", "42703"].includes(error?.code)) {
      throw new LedgerPreviewError("개발 DB의 회비 원장 스키마가 필요합니다.");
    }
    throw new LedgerPreviewError("개발 DB의 회비 원장 비교에 실패했습니다.");
  } finally {
    await client.end();
  }
}
