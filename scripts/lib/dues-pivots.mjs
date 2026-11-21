const requiredYears = [2022, 2023, 2024, 2025, 2026];
const empty = (value) => value === undefined || value === null || value === "";
const isTotal = (label) => label === "총계" || label === "총합계" || label === "Grand Total";

function integer(cell) {
  if (typeof cell === "number") return Number.isSafeInteger(cell) && cell >= 0 ? cell : NaN;
  if (typeof cell !== "string" || !/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(cell)) return NaN;
  const value = Number(cell.replaceAll(",", ""));
  return Number.isSafeInteger(value) ? value : NaN;
}

function yearOf(label) {
  const match = /^(\d{4})년도 회비$/.exec(label);
  return match ? Number(match[1]) : null;
}

function addTotal(map, key, amount) {
  const total = map.get(key) ?? { count: 0, amount: 0 };
  total.count++;
  total.amount += amount;
  map.set(key, total);
}

function sameTotal(total, row) {
  return total && integer(row[2]) === total.amount && integer(row[3]) === total.count;
}

function checkAnnualPivot(grid, source, problem) {
  const [header = [], ...data] = grid;
  const totals = new Set();
  const details = new Map();
  const matched = new Map();
  let grandTotalShown = false;
  let currentYear = null;
  if (
    header[0] !== "회비납부통계" ||
    header[1] !== "내용" ||
    header[2] !== "합계" ||
    header[3] !== "건수"
  ) {
    problem("J2 열 제목 불일치");
  }
  for (const [index, row] of data.entries()) {
    if (row.every(empty)) continue;
    const sheetRow = index + 3;
    const [group, label] = row;
    if (isTotal(group) && empty(label)) {
      if (grandTotalShown || !sameTotal(source.grand, row)) {
        problem("J2 전체 총계 불일치·중복", undefined, sheetRow);
      }
      grandTotalShown = true;
      currentYear = null;
      continue;
    }
    const subtotal = /^(\d{4})년도 회비 (?:총계|합계)$/.exec(group);
    if (subtotal && empty(label)) {
      const year = Number(subtotal[1]);
      if (totals.has(year) || !sameTotal(source.years.get(year), row)) {
        problem("J2 연도 소계 불일치·중복", year, sheetRow);
      }
      totals.add(year);
      currentYear = null;
      continue;
    }

    // Expanded groups label the first payer row with its year. Collapsed groups show only a subtotal.
    if (!empty(group)) currentYear = yearOf(group);
    if (!source.years.has(currentYear) || typeof label !== "string" || empty(label)) {
      problem("J2 귀속연도·납부자 행 형식 오류", undefined, sheetRow);
      continue;
    }
    const seen = details.get(currentYear) ?? new Set();
    const expected = source.payers.get(currentYear).get(label);
    if (seen.has(label) || !sameTotal(expected, row)) {
      problem("J2 납부자별 금액·건수 불일치 또는 중복", currentYear, sheetRow);
    } else {
      matched.set(currentYear, (matched.get(currentYear) ?? 0) + 1);
    }
    seen.add(label);
    details.set(currentYear, seen);
  }
  const coverage = [];
  for (const year of new Set([...requiredYears, ...source.years.keys()])) {
    if (!totals.has(year)) problem("J2 연도 소계 누락", year);
    const seen = details.get(year);
    const groups = source.payers.get(year);
    if (seen && groups) {
      for (const label of groups.keys()) {
        if (!seen.has(label)) problem("J2 펼쳐진 연도의 납부자 누락", year);
      }
    }
    coverage.push({
      year,
      status: seen ? "shown" : "not-shown",
      matchedPayers: matched.get(year) ?? 0,
    });
  }
  return { details: coverage.sort((a, b) => a.year - b.year), grandTotalShown };
}

function checkMemberPivot(grid, source, problem) {
  const [title = [], headings = [], ...data] = grid;
  if (title[0] !== "회원별 연간 회비납부 내역" || !String(headings[0]).startsWith("회원명")) {
    problem("Q1 열 제목 불일치");
  }

  const columns = new Map();
  let totalColumn = -1;
  for (let column = 1; column < headings.length; column++) {
    const label = headings[column];
    if (empty(label)) continue;
    if (isTotal(label)) {
      if (totalColumn !== -1) problem("Q1 합계 열 중복");
      totalColumn = column;
    } else {
      const year = yearOf(label);
      if (!source.years.has(year) || columns.has(year)) problem("Q1 연도 열 오류");
      else columns.set(year, column);
    }
  }
  for (const year of requiredYears.filter((year) => year >= 2024)) {
    if (!columns.has(year)) problem("Q1 필수 연도 누락", year);
  }

  // Column I is the account office's member grouping, which can differ from the payer text in E.
  const members = new Map();
  const yearTotals = new Map();
  for (const [year, memberAmounts] of source.members) {
    if (!columns.has(year)) continue;
    yearTotals.set(year, source.years.get(year).amount);
    for (const [label, { amount }] of memberAmounts) {
      const amounts = members.get(label) ?? new Map();
      amounts.set(year, amount);
      members.set(label, amounts);
    }
  }
  const seen = new Set();
  let grandTotalShown = false;
  let matchedMembers = 0;
  for (const [index, row] of data.entries()) {
    if (row.every(empty)) continue;
    const sheetRow = index + 3;
    const label = row[0] ?? "";
    const grand = isTotal(label);
    const expected = grand ? yearTotals : members.get(label);
    if (!expected || (grand ? grandTotalShown : seen.has(label))) {
      problem("Q1 소계·회원 행 중복 또는 원장에 없는 행", undefined, sheetRow);
      continue;
    }
    if (grand) grandTotalShown = true;
    else seen.add(label);

    let sum = 0;
    let matches = true;
    for (const [year, column] of columns) {
      const amount = expected.get(year) ?? 0;
      sum += amount;
      const value = row[column];
      // A missing value in a member/year cross-tab is zero only if the source agrees.
      if ((empty(value) ? 0 : integer(value)) !== amount) {
        problem("Q1 회원별·연도별 금액 불일치", year, sheetRow);
        matches = false;
      }
    }
    if (totalColumn !== -1 && integer(row[totalColumn]) !== sum) {
      problem("Q1 행 합계 불일치", undefined, sheetRow);
      matches = false;
    }
    if (!grand && matches) matchedMembers++;
  }
  for (const label of members.keys()) {
    if (!seen.has(label)) problem("Q1 회원 행 누락");
  }
  return { years: [...columns.keys()].sort(), matchedMembers, grandTotalShown };
}

// Input grids start at J2 and Q1 (header rows included); return only counts, years and amounts.
export function reconcileDuesPivots(rows, jRows, qRows) {
  const errors = new Map();
  function problem(description, year, sheetRow) {
    const key = year === undefined ? description : `${description} (${year}년)`;
    const detail = errors.get(key) ?? { count: 0, sheetRows: [] };
    detail.count++;
    if (sheetRow !== undefined && detail.sheetRows.length < 5) detail.sheetRows.push(sheetRow);
    errors.set(key, detail);
  }
  const source = {
    years: new Map(),
    payers: new Map(),
    members: new Map(),
    grand: { count: 0, amount: 0 },
  };
  for (const { year, amount, label, memberLabel } of rows) {
    if (
      !Number.isInteger(year) ||
      year < 2022 ||
      year > 9999 ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      typeof label !== "string" ||
      !label.trim() ||
      typeof memberLabel !== "string"
    ) {
      problem("기초 자료 형식 오류");
      continue;
    }
    addTotal(source.years, year, amount);
    if (!source.payers.has(year)) source.payers.set(year, new Map());
    if (!source.members.has(year)) source.members.set(year, new Map());
    addTotal(source.payers.get(year), label, amount);
    addTotal(source.members.get(year), memberLabel, amount);
    source.grand.amount += amount;
    source.grand.count++;
  }
  const j2 = checkAnnualPivot(jRows, source, problem);
  const q1 = checkMemberPivot(qRows, source, problem);
  const issues = [...errors].map(([message, { count, sheetRows }]) => {
    const location = sheetRows.length ? ` (시트 행 ${sheetRows.join(", ")})` : "";
    return `${message}: ${count}건${location}`;
  });
  const years = [...source.years]
    .sort(([a], [b]) => a - b)
    .map(([year, value]) => ({ year, ...value }));
  return { ok: !issues.length, issues, years, j2, q1 };
}
