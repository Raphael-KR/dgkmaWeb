import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const baseSource = {
  department: "한의학과",
  generation: "30",
  name: "테스트동문",
  admissionDate: "1990-03-01",
  graduationDate: "1996-02-20",
  address: "서울특별시",
  mobile: "010-1111-2222",
  phone: "02-1234-5678",
  group: "서울지부",
  status: "정회원",
  alumniPosition: "회원",
  memo: "동기화 메모",
};

const sheetHeaders = [
  "학과",
  "기수",
  "성명",
  "입학일자",
  "졸업일자",
  "주소",
  "핸드폰번호",
  "전화번호",
  "그룹",
  "상태",
  "동문회직책",
  "메모",
];

function sourceRow(rowNumber: number, overrides: Partial<typeof baseSource> = {}) {
  return { rowNumber, ...baseSource, ...overrides };
}

function databaseRow(
  id: number,
  overrides: Partial<typeof baseSource> = {},
) {
  return {
    id,
    ...baseSource,
    ...overrides,
    isMatched: false,
    matchedUserId: null,
  };
}

test("normalizes supported Korean mobile formats and rejects invalid numbers", async () => {
  const { normalizeAlumniMobile } = await import("./alumni-sync-plan");

  assert.equal(normalizeAlumniMobile("01012345678"), "010-1234-5678");
  assert.equal(normalizeAlumniMobile(" 010-1234-5678 "), "010-1234-5678");
  assert.equal(normalizeAlumniMobile("+82 10-1234-5678"), "010-1234-5678");
  assert.equal(normalizeAlumniMobile("+82 010 1234 5678"), "010-1234-5678");
  assert.equal(normalizeAlumniMobile("02-1234-5678"), null);
  assert.equal(normalizeAlumniMobile("010-123-5678"), null);
  assert.equal(normalizeAlumniMobile(undefined), null);
});

test("classifies source and database rows without planning database-only deletion", async () => {
  const { planAlumniSync } = await import("./alumni-sync-plan");
  const source = {
    records: [
      sourceRow(2, { mobile: "01011112222" }),
      sourceRow(3, { mobile: "+82 10-3333-4444", department: "한의예과" }),
      sourceRow(4, { mobile: "010-5555-6666", name: "신규동문" }),
    ],
    sourceTotal: 3,
    issues: [],
  };
  const database = [
    databaseRow(1),
    databaseRow(2, { mobile: "010-3333-4444", department: "한의학과" }),
    databaseRow(3, { mobile: "010-7777-8888", name: "DB전용동문" }),
  ];

  const plan = planAlumniSync(source, database);

  assert.deepEqual(
    {
      sourceTotal: plan.report.sourceTotal,
      databaseTotal: plan.report.databaseTotal,
      insert: plan.report.insert,
      update: plan.report.update,
      unchanged: plan.report.unchanged,
      conflict: plan.report.conflict,
      invalid: plan.report.invalid,
      sourceOnly: plan.report.sourceOnly,
      databaseOnly: plan.report.databaseOnly,
    },
    {
      sourceTotal: 3,
      databaseTotal: 3,
      insert: 1,
      update: 1,
      unchanged: 1,
      conflict: 0,
      invalid: 0,
      sourceOnly: 1,
      databaseOnly: 1,
    },
  );
  assert.equal(plan.report.blocked, false);
  assert.deepEqual(plan.changes.map((change) => change.kind), ["update", "insert"]);
  assert.equal("delete" in plan, false);
  assert.equal("deletes" in plan, false);
});

test("blocks an empty source before producing changes", async () => {
  const { planAlumniSync } = await import("./alumni-sync-plan");

  const plan = planAlumniSync(
    { records: [], sourceTotal: 0, issues: [] },
    [databaseRow(1)],
  );

  assert.equal(plan.report.blocked, true);
  assert.equal(plan.report.invalid, 0);
  assert.deepEqual(plan.report.issues, [{ code: "EMPTY_SOURCE", count: 1 }]);
  assert.deepEqual(plan.changes, []);
});

test("blocks missing required values, invalid mobiles, and duplicate normalized mobiles", async () => {
  const { planAlumniSync } = await import("./alumni-sync-plan");
  const source = {
    records: [
      sourceRow(2, { name: "" }),
      sourceRow(3, { mobile: "02-1234-5678" }),
      sourceRow(4, { mobile: "010-9999-0000", name: "중복1" }),
      sourceRow(5, { mobile: "+82 10-9999-0000", name: "중복2" }),
    ],
    sourceTotal: 4,
    issues: [],
  };

  const plan = planAlumniSync(source, []);

  assert.equal(plan.report.blocked, true);
  assert.equal(plan.report.invalid, 2);
  assert.equal(plan.report.conflict, 2);
  assert.deepEqual(plan.report.issues, [
    { code: "MISSING_REQUIRED_VALUE", count: 1 },
    { code: "INVALID_MOBILE", count: 1 },
    { code: "DUPLICATE_MOBILE", count: 2 },
  ]);
  assert.deepEqual(plan.changes, []);
});

test("blocks ambiguous normalized mobile duplicates already in the database", async () => {
  const { planAlumniSync } = await import("./alumni-sync-plan");
  const plan = planAlumniSync(
    {
      records: [sourceRow(2)],
      sourceTotal: 1,
      issues: [],
    },
    [
      databaseRow(1, { mobile: "010-1111-2222" }),
      databaseRow(2, { mobile: "+82 10-1111-2222" }),
    ],
  );

  assert.equal(plan.report.blocked, true);
  assert.equal(plan.report.conflict, 2);
  assert.deepEqual(plan.report.issues, [
    { code: "DATABASE_DUPLICATE_MOBILE", count: 2 },
  ]);
  assert.deepEqual(plan.changes, []);
});

test("sums every row across independent source and database duplicate groups", async () => {
  const { planAlumniSync } = await import("./alumni-sync-plan");
  const plan = planAlumniSync(
    {
      records: [
        sourceRow(2, { mobile: "010-1111-2222" }),
        sourceRow(3, { mobile: "+82 10-1111-2222" }),
        sourceRow(4, { mobile: "010-3333-4444" }),
        sourceRow(5, { mobile: "+82 10-3333-4444" }),
      ],
      sourceTotal: 4,
      issues: [],
    },
    [
      databaseRow(1, { mobile: "010-5555-6666" }),
      databaseRow(2, { mobile: "+82 10-5555-6666" }),
      databaseRow(3, { mobile: "010-7777-8888" }),
      databaseRow(4, { mobile: "+82 10-7777-8888" }),
    ],
  );

  assert.equal(plan.report.blocked, true);
  assert.equal(plan.report.conflict, 8);
  assert.deepEqual(plan.report.issues, [
    { code: "DUPLICATE_MOBILE", count: 4 },
    { code: "DATABASE_DUPLICATE_MOBILE", count: 4 },
  ]);
  assert.deepEqual(plan.changes, []);
});

test("preserves structured source issues as blocking PII-free report counts", async () => {
  const { planAlumniSync } = await import("./alumni-sync-plan");
  const plan = planAlumniSync(
    {
      records: [sourceRow(2)],
      sourceTotal: 1,
      issues: [{ code: "MISSING_REQUIRED_HEADER" as const, count: 1 }],
    },
    [],
  );

  assert.equal(plan.report.blocked, true);
  assert.deepEqual(plan.report.issues, [
    { code: "MISSING_REQUIRED_HEADER", count: 1 },
  ]);
  assert.deepEqual(plan.changes, []);
});

test("creates a stable non-identifying fingerprint and keeps the report PII-free", async () => {
  const { planAlumniSync } = await import("./alumni-sync-plan");
  const first = sourceRow(2, {
    name: "민감이름A",
    mobile: "010-1212-3434",
    address: "민감주소A",
    memo: "민감메모A",
  });
  const second = sourceRow(3, {
    name: "민감이름B",
    mobile: "010-5656-7878",
    address: "민감주소B",
    memo: "민감메모B",
  });

  const original = planAlumniSync(
    { records: [first, second], sourceTotal: 2, issues: [] },
    [],
  );
  const reorderedAndReformatted = planAlumniSync(
    {
      records: [
        { ...second, rowNumber: 20, mobile: "+82 10-5656-7878" },
        { ...first, rowNumber: 21, mobile: "01012123434", memo: " 민감메모A " },
      ],
      sourceTotal: 2,
      issues: [],
    },
    [],
  );
  const changed = planAlumniSync(
    {
      records: [first, { ...second, department: "한의예과" }],
      sourceTotal: 2,
      issues: [],
    },
    [],
  );

  assert.match(original.report.sourceFingerprint ?? "", /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    original.report.sourceFingerprint,
    reorderedAndReformatted.report.sourceFingerprint,
  );
  assert.notEqual(original.report.sourceFingerprint, changed.report.sourceFingerprint);

  const serializedReport = JSON.stringify(original.report);
  for (const pii of [
    "민감이름A",
    "민감이름B",
    "010-1212-3434",
    "민감주소A",
    "민감메모A",
  ]) {
    assert.doesNotMatch(serializedReport, new RegExp(pii));
  }

  const blocked = planAlumniSync(
    { records: [], sourceTotal: 0, issues: [] },
    [],
  );
  assert.equal(blocked.report.sourceFingerprint, null);
});

test("builds a structured snapshot without dropping rows missing required values", async () => {
  const { buildAlumniSourceSnapshot } = await import("./google-sheets");
  const snapshot = buildAlumniSourceSnapshot([
    sheetHeaders,
    ["한의학과", "30", "정상동문", "", "", "", "010-1111-2222"],
    ["한의학과", "31", "", "", "", "", "010-3333-4444"],
  ]);

  assert.equal(snapshot.sourceTotal, 2);
  assert.equal(snapshot.records.length, 2);
  assert.equal(snapshot.records[1].rowNumber, 3);
  assert.equal(snapshot.records[1].name, "");
  assert.deepEqual(snapshot.issues, [
    { code: "MISSING_REQUIRED_VALUE", count: 1 },
  ]);
});

test("returns blocking snapshots for an empty source and invalid required headers", async () => {
  const { buildAlumniSourceSnapshot } = await import("./google-sheets");

  assert.deepEqual(buildAlumniSourceSnapshot([]), {
    records: [],
    sourceTotal: 0,
    issues: [{ code: "EMPTY_SOURCE", count: 1 }],
  });

  const invalidHeaders = [...sheetHeaders];
  invalidHeaders[6] = "잘못된휴대전화헤더";
  const invalid = buildAlumniSourceSnapshot([
    invalidHeaders,
    ["한의학과", "30", "동문", "", "", "", "010-1111-2222"],
  ]);
  assert.equal(invalid.sourceTotal, 1);
  assert.deepEqual(invalid.records, []);
  assert.deepEqual(invalid.issues, [
    { code: "MISSING_REQUIRED_HEADER", count: 1 },
  ]);
});

test("Google Sheets API failures become structured snapshots without raw errors", async (t) => {
  t.mock.method(console, "error", () => {});
  const { GoogleSheetsService } = await import("./google-sheets");
  const service = new GoogleSheetsService({
    spreadsheetId: "test-spreadsheet",
    sheets: {
      spreadsheets: {
        values: {
          get: async () => {
            throw new Error("민감한 원문 API 오류");
          },
        },
        get: async () => ({}),
      },
    },
  });

  const snapshot = await service.fetchAlumniSnapshot();

  assert.deepEqual(snapshot, {
    records: [],
    sourceTotal: 0,
    issues: [{ code: "SOURCE_UNAVAILABLE", count: 1 }],
  });
  assert.doesNotMatch(JSON.stringify(snapshot), /민감한 원문 API 오류/);
});

test("tracked Google Sheets readers keep no raw alumni cache", async () => {
  const serverDirectory = new URL("./", import.meta.url);
  const readerFiles = (await readdir(serverDirectory))
    .filter((fileName) => /^google-sheets(?:-.*)?\.ts$/.test(fileName));

  assert.ok(readerFiles.includes("google-sheets.ts"));
  for (const fileName of readerFiles) {
    const source = await readFile(new URL(fileName, serverDirectory), "utf8");
    assert.doesNotMatch(
      source,
      /cachedAlumniData|Cache cleared|캐시에 저장/,
      fileName,
    );
  }
});

test("planner does not double-count strict snapshot issues", async () => {
  const { buildAlumniSourceSnapshot } = await import("./google-sheets");
  const { planAlumniSync } = await import("./alumni-sync-plan");
  const missingValueSnapshot = buildAlumniSourceSnapshot([
    sheetHeaders,
    ["한의학과", "30", "", "", "", "", "010-1111-2222"],
  ]);

  const missingValuePlan = planAlumniSync(missingValueSnapshot, []);
  assert.equal(missingValuePlan.report.invalid, 1);
  assert.deepEqual(missingValuePlan.report.issues, [
    { code: "MISSING_REQUIRED_VALUE", count: 1 },
  ]);

  const invalidHeaders = [...sheetHeaders];
  invalidHeaders[2] = "잘못된성명헤더";
  const invalidHeaderPlan = planAlumniSync(
    buildAlumniSourceSnapshot([
      invalidHeaders,
      ["한의학과", "30", "동문", "", "", "", "010-1111-2222"],
    ]),
    [],
  );
  assert.deepEqual(invalidHeaderPlan.report.issues, [
    { code: "MISSING_REQUIRED_HEADER", count: 1 },
  ]);
});
