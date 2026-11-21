import { createHash, createHmac, randomBytes } from "node:crypto";

const ledgerHeaders = [
  "거래일시",
  "구분",
  "거래금액",
  "거래 후 잔액",
  "내용",
  "거래구분",
  "메모",
  "계좌",
];
const memberHeader = /^회원명 \(20\d{2}년 직함\)$/;
const sheetsEpoch = Date.UTC(1899, 11, 30);
const lastClosedAccountingYear = 2025;
const maxWon = 2_147_483_647;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const empty = (value) => value === undefined || value === null || value === "";

function fail(row, message) {
  throw new Error(`회비수입 ${row}행: ${message}`);
}

// UUIDv8, private application namespace. Keys do not depend on worksheet row order.
function stableKey(kind, parts, secret) {
  const hash = secret ? createHmac("sha256", secret) : createHash("sha256");
  const bytes = hash.update(JSON.stringify(["dgkma/dues-source/v1", kind, ...parts])).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function won(value, row, name, allowNegative = false) {
  if (typeof value === "string" && /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:원)?$/.test(value.trim())) {
    value = Number(value.trim().replaceAll(",", "").replace(/원$/, ""));
  }
  if (!Number.isSafeInteger(value) || (!allowNegative && (value <= 0 || value > maxWon))) {
    fail(row, `${name} 원 단위 금액을 확인하세요.`);
  }
  return value;
}

function cleanLabel(value, row, name, allowBlank = false) {
  if (allowBlank && empty(value)) return "";
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 150 ||
    /\p{Cc}|[@<>]|https?:\/\/|\d(?:[ -]?\d){7}/iu.test(value)
  ) {
    fail(row, `${name}에 빈 값 또는 허용하지 않는 식별정보가 있습니다.`);
  }
  const label = value.trim();
  if (/^#(?:N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|ERROR!)/i.test(label)) {
    fail(row, `${name}의 시트 오류를 확인하세요.`);
  }
  return label;
}

function sheetTime(value, row) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const seconds = Math.round(value * 86400);
    const at = new Date(sheetsEpoch + seconds * 1000);
    if (
      !Number.isSafeInteger(seconds) ||
      !Number.isFinite(at.getTime()) ||
      at.getUTCFullYear() < 1900 ||
      at.getUTCFullYear() > 9999
    )
      fail(row, "거래일시 범위 오류");
    const iso = at.toISOString();
    // A whole-day serial carries no evidence of an actual time-of-day.
    return seconds % 86400 === 0 ? iso.slice(0, 10) : iso.slice(0, 19) + "+09:00";
  }
  const raw = typeof value === "string" ? value.trim() : "";
  const match =
    /^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?(?:[ T]+(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\+09:00)?)?$/.exec(
      raw,
    );
  if (!match) fail(row, "거래일시 형식을 확인하세요.");
  const [, y, m, d, meridiem, h, min = "00", sec = "00"] = match;
  let hour = Number(h ?? 0);
  if (meridiem) {
    if (hour < 1 || hour > 12) fail(row, "거래 시각 오류");
    hour = (hour % 12) + (meridiem === "오후" ? 12 : 0);
  }
  const localDay = [y, m.padStart(2, "0"), d.padStart(2, "0")].join("-");
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (
    Number(y) < 1900 ||
    date.toISOString().slice(0, 10) !== localDay ||
    hour > 23 ||
    Number(min) > 59 ||
    Number(sec) > 59
  )
    fail(row, "거래 날짜 또는 시각 오류");
  return h === undefined
    ? localDay
    : `${localDay}T${String(hour).padStart(2, "0")}:${min}:${sec}+09:00`;
}

export function normalizeDuesRows(grid) {
  if (
    !Array.isArray(grid) ||
    !Array.isArray(grid[0]) ||
    ledgerHeaders.some((title, index) => grid[0][index] !== title) ||
    !memberHeader.test(grid[0][8]) ||
    grid[0].length !== 9
  ) {
    throw new Error("회비수입 A:I의 열 제목을 확인하세요.");
  }
  const rows = [];
  const parents = new Set();
  const occurrences = new Map();
  let parentReceipt = null;
  let splitTotal = 0;

  function finishReceipt() {
    if (parentReceipt && splitTotal !== parentReceipt.amount) {
      fail(parentReceipt.sheetRow, "바로 아래 분개 합계가 원입금액과 일치하지 않습니다.");
    }
    parentReceipt = null;
    splitTotal = 0;
  }

  for (const [index, cells] of grid.entries()) {
    if (index === 0) continue;
    if (Array.isArray(cells) && cells.every(empty)) {
      finishReceipt();
      continue;
    }
    const sheetRow = index + 1;
    if (!Array.isArray(cells) || cells.length > 9) fail(sheetRow, "원장 열 구성 오류");
    const [date, direction, rawAmount, rawBalance, payer, category, memo, bank, member] = cells;
    const yearMatch = typeof memo === "string" && /^(\d{4})년도 회비$/.exec(memo.trim());
    const parent = direction === "수입" && empty(memo);
    if (
      category !== "회비수입" ||
      !["수입", "분개"].includes(direction) ||
      (!parent && !yearMatch)
    ) {
      fail(sheetRow, "수입·분개·회비수입·귀속연도 분류를 확인하세요.");
    }
    const occurredAt = sheetTime(date, sheetRow);
    const amount = won(rawAmount, sheetRow, "거래금액");
    const balance = empty(rawBalance) ? null : won(rawBalance, sheetRow, "거래 후 잔액", true);
    const label = cleanLabel(payer, sheetRow, "내용");
    const memberLabel = cleanLabel(member, sheetRow, "회원명", true);
    const account = cleanLabel(bank, sheetRow, "계좌 별칭", true);
    const year = parent ? null : Number(yearMatch[1]);
    if (year !== null && year < 1900) fail(sheetRow, "귀속연도 범위 오류");
    const keyFacts = [occurredAt, account, amount, balance, label, year];
    const sourceKey =
      direction === "분개" && parentReceipt
        ? stableKey("split-line", [parentReceipt.sourceKey, ...keyFacts])
        : stableKey("line", keyFacts);
    const line = {
      occurredAt,
      direction,
      amount,
      balance,
      label,
      category,
      memo: parent ? "" : memo.trim(),
      account,
      memberLabel,
      year,
      sourceKey,
      sheetRow,
    };
    if (direction === "수입") {
      finishReceipt();
      if (parent) {
        if (parents.has(sourceKey)) fail(sheetRow, "동일한 단체 원입금이 두 번 표시되었습니다.");
        parents.add(sourceKey);
        parentReceipt = line;
        continue;
      }
    } else {
      if (!parentReceipt || occurredAt !== parentReceipt.occurredAt) {
        fail(sheetRow, "같은 거래일시의 원입금 바로 아래에 연속된 분개가 필요합니다.");
      }
      line.parentReceipt = parentReceipt;
      splitTotal += amount;
    }
    const copies = occurrences.get(sourceKey) ?? [];
    copies.push(line);
    occurrences.set(sourceKey, copies);
    rows.push(line);
  }
  finishReceipt();
  for (const [key, copies] of occurrences) {
    if (copies.length === 1) continue;
    // A shared label cannot establish the beneficiary of each identical allocation.
    // Original sheet row numbers never enter the keys of this multiset.
    const distinctLabels = new Set(copies.map((line) => line.memberLabel)).size > 1;
    const seenPerLabel = new Map();
    for (const line of copies) {
      const occurrence = (seenPerLabel.get(line.memberLabel) ?? 0) + 1;
      seenPerLabel.set(line.memberLabel, occurrence);
      line.duplicate = { occurrence, count: copies.length };
      if (distinctLabels) {
        line.sourceKey = stableKey("duplicate-label", [key, line.memberLabel, occurrence]);
      } else if (occurrence > 1) {
        line.sourceKey = stableKey("duplicate-line", [key, occurrence]);
      }
    }
  }
  if (rows.length === 0) throw new Error("회비수입 원장이 비어 있습니다.");
  return rows;
}

function isAnonymous(row) {
  return /^(?:성명불상|\(성명불상\)(?: 정회원)?)$/.test(row.label);
}

// The receipt amount belongs to the bank entry; only its numbered-year splits enter the pivots.
function declaredGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    const parent = row.parentReceipt;
    if (!parent) continue;
    if (!groups.has(parent.sourceKey)) groups.set(parent.sourceKey, { parent, children: [] });
    groups.get(parent.sourceKey).children.push(row);
  }
  return groups.values();
}

function bankKey(row) {
  return JSON.stringify([row.account, row.occurredAt]);
}

function ambiguousRows(rows) {
  const buckets = new Map();
  for (const row of rows) {
    if (row.parentReceipt) continue;
    const key = bankKey(row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  return [...buckets.values()].filter(
    (bucket) =>
      bucket.length > 1 ||
      bucket.some((r) => r.balance === null || !r.account || r.occurredAt.length === 10),
  );
}

function validReview(review) {
  const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  if (
    !object(review) ||
    !object(review.members) ||
    !object(review.overrides) ||
    !Array.isArray(review.groups) ||
    !Array.isArray(review.singles) ||
    (review.unallocated !== undefined && !Array.isArray(review.unallocated)) ||
    review.groups.some((g) => !object(g) || !Array.isArray(g.sourceKeys))
  ) {
    throw new Error("회원·원거래 대조표 형식을 확인하세요.");
  }
  if (typeof review.keySecret !== "string" || !/^[a-f0-9]{64}$/i.test(review.keySecret)) {
    throw new Error("최초 대조표에 저장한 이관 식별키가 필요합니다.");
  }
}

export function createDuesReview(rows, previous) {
  const review = previous ?? {
    keySecret: randomBytes(32).toString("hex"),
    members: {},
    overrides: {},
    groups: [],
    singles: [],
  };
  validReview(review);
  const members = Object.assign(Object.create(null), review.members);
  const knownRows = new Set([...review.singles, ...review.groups.flatMap((g) => g.sourceKeys)]);
  const groups = [...review.groups];
  const candidates = [];
  for (const row of rows) {
    if (!isAnonymous(row) && !Object.hasOwn(members, row.label)) members[row.label] = null;
  }
  for (const bucket of ambiguousRows(rows)) {
    const sourceKeys = bucket
      .map((r) => r.sourceKey)
      .filter((key) => !knownRows.has(key))
      .sort();
    if (sourceKeys.length) {
      groups.push({ receiptKey: stableKey("review", sourceKeys), sourceKeys, amount: null });
    }
    for (const r of bucket) {
      candidates.push({
        sourceKey: r.sourceKey,
        sheetRow: r.sheetRow,
        occurredAt: r.occurredAt,
        amount: r.amount,
        balance: r.balance,
        label: r.label,
        memberLabel: r.memberLabel,
        account: r.account,
      });
    }
  }
  // Row numbers are hints for the reviewer only. Matching always uses durable keys.
  const rowKeys = Object.fromEntries(rows.map(({ sheetRow, sourceKey }) => [sheetRow, sourceKey]));
  return {
    keySecret: review.keySecret,
    members,
    overrides: review.overrides,
    singles: review.singles,
    unallocated: review.unallocated ?? [],
    groups,
    duplicateRows: rows
      .filter((row) => row.duplicate)
      .map(({ sourceKey, sheetRow, duplicate }) => ({ sourceKey, sheetRow, ...duplicate })),
    declaredGroups: Array.from(declaredGroups(rows), ({ parent, children }) => ({
      parent,
      sourceKeys: children.map((row) => row.sourceKey),
    })),
    rowKeys,
    candidates,
  };
}

export function buildDuesReceipts(rows, review) {
  validReview(review);
  // A DB identifier must not permit dictionary matching against a redacted payer label.
  // The secret and the unkeyed review identifiers stay in the secretariat's private file.
  const secret = Buffer.from(review.keySecret, "hex");
  const problems = [];
  const collected = [];
  const mixedReceipts = [];
  const settledWithoutAccount = [];
  const bySource = new Map(rows.map((r) => [r.sourceKey, r]));
  const unallocated = new Set();
  for (const key of review.unallocated ?? []) {
    if (!bySource.has(key) || unallocated.has(key) || Object.hasOwn(review.overrides, key)) {
      problems.push("미배분 지정에 삭제된 행, 중복 또는 회원별 지정과의 충돌이 있습니다.");
    }
    unallocated.add(key);
  }
  const explicit = new Set();
  const receiptKeys = new Set();
  const uncertain = new Set(
    ambiguousRows(rows)
      .flat()
      .map((r) => r.sourceKey),
  );

  function consume(key) {
    if (!bySource.has(key) || explicit.has(key)) {
      problems.push("대조표에 사라진 행 또는 중복 지정된 행이 있습니다.");
      return null;
    }
    explicit.add(key);
    return bySource.get(key);
  }

  function append(reviewReceiptKey, batch, amount, bankAmount, otherAmount) {
    if (typeof reviewReceiptKey !== "string" || !uuidPattern.test(reviewReceiptKey)) {
      problems.push("원거래 식별자가 잘못되었습니다.");
      return;
    }
    const receiptKey = stableKey("db-receipt", [reviewReceiptKey.toLowerCase()], secret);
    if (receiptKeys.has(receiptKey)) {
      problems.push("원거래 식별자가 잘못되었거나 중복되었습니다.");
      return;
    }
    receiptKeys.add(receiptKey);
    const receivedOn = batch[0].occurredAt.slice(0, 10);
    if (
      batch.some((r) => r.occurredAt.slice(0, 10) !== receivedOn) ||
      new Set(batch.map((r) => r.account).filter(Boolean)).size > 1 ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > maxWon ||
      amount !== batch.reduce((acc, r) => acc + r.amount, 0)
    ) {
      problems.push(`입금 일자·계좌 또는 회비 배분 합계 대조 필요 (원장 ${batch[0].sheetRow}행)`);
      return;
    }
    if (bankAmount !== undefined || otherAmount !== undefined) {
      if (
        !Number.isSafeInteger(bankAmount) ||
        bankAmount > maxWon ||
        !Number.isSafeInteger(otherAmount) ||
        otherAmount <= 0 ||
        amount + otherAmount !== bankAmount
      ) {
        problems.push(`회비·기타 분개 합계와 은행 입금액 대조 필요 (원장 ${batch[0].sheetRow}행)`);
        return;
      }
      mixedReceipts.push({
        sheetRows: batch.map((row) => row.sheetRow).sort((a, b) => a - b),
        bankAmount,
        duesAmount: amount,
        otherAmount,
      });
    }
    const allocations = [];
    const sourceRows = [];
    const closed = Number(receivedOn.slice(0, 4)) <= lastClosedAccountingYear;
    let unallocatedYear = null;
    for (const line of batch) {
      const { sourceKey, sheetRow, parentReceipt: _parentReceipt, duplicate, ...facts } = line;
      if (isAnonymous(line) || unallocated.has(sourceKey)) {
        if (batch.length !== 1 || Object.hasOwn(review.overrides, sourceKey)) {
          problems.push(`미배분 지정과 회원별 분개가 충돌합니다 (원장 ${sheetRow}행).`);
          return;
        }
        unallocatedYear = line.year;
        sourceRows.push({ ...facts, allocationKey: null });
        continue;
      }
      const hasOverride = Object.hasOwn(review.overrides, sourceKey);
      const id = hasOverride
        ? review.overrides[sourceKey]
        : !duplicate && Object.hasOwn(review.members, line.label)
          ? review.members[line.label]
          : null;
      if (closed && id === null && !hasOverride) {
        settledWithoutAccount.push({ sourceKey, sheetRow, ...facts });
        continue;
      }
      if (typeof id !== "string" || !uuidPattern.test(id)) {
        problems.push(`동문 ID 확인 필요 (원장 ${sheetRow}행)`);
        return;
      }
      const allocationKey = stableKey("db-allocation", [sourceKey], secret);
      allocations.push({
        allocationKey,
        userId: id.toLowerCase(),
        year: line.year,
        amount: line.amount,
      });
      sourceRows.push({ ...facts, allocationKey });
    }
    // Unallocated receipts have exactly one row, so their null key is never compared.
    const byAllocationKey = (a, b) => a.allocationKey.localeCompare(b.allocationKey);
    allocations.sort(byAllocationKey);
    sourceRows.sort(byAllocationKey);
    collected.push({
      receiptKey,
      receivedOn,
      bankAmount: bankAmount ?? amount,
      amount,
      unallocatedYear,
      allocations,
      sourceRows,
    });
  }

  for (const key of Object.keys(review.overrides)) {
    if (!bySource.has(key)) problems.push("동문 ID 개별 지정에 원장에 없는 행이 있습니다.");
  }
  for (const { parent, children } of declaredGroups(rows)) {
    for (const child of children) explicit.add(child.sourceKey);
    append(stableKey("receipt", [parent.sourceKey]), children, parent.amount);
  }
  for (const group of review.groups) {
    if (!group.sourceKeys.length) {
      problems.push("빈 원거래 묶음이 있습니다.");
      continue;
    }
    const batch = group.sourceKeys.map(consume);
    if (batch.every(Boolean)) {
      append(group.receiptKey, batch, group.amount, group.bankAmount, group.otherAmount);
    }
  }
  for (const key of review.singles) {
    const row = consume(key);
    if (row) append(stableKey("receipt", [key]), [row], row.amount);
  }
  for (const row of rows) {
    if (explicit.has(row.sourceKey)) continue;
    if (uncertain.has(row.sourceKey)) {
      problems.push(`분개 여부와 원입금 확인 필요 (원장 ${row.sheetRow}행)`);
      continue;
    }
    append(stableKey("receipt", [row.sourceKey]), [row], row.amount);
  }
  return {
    receipts:
      problems.length || settledWithoutAccount.length
        ? []
        : collected.sort((a, b) => a.receiptKey.localeCompare(b.receiptKey)),
    issues: problems,
    mixedReceipts,
    settledWithoutAccount,
  };
}
