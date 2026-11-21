import { createHash } from "node:crypto";
import { open, readFile, unlink } from "node:fs/promises";
import { parseArgs } from "node:util";
import { google } from "googleapis";
import { reconcileDuesPivots } from "./lib/dues-pivots.mjs";
import { normalizeDuesRows, createDuesReview, buildDuesReceipts } from "./lib/dues-source.mjs";

const spreadsheetId = "1aStEZeCSHIUqS4W81umlW8B3pMCJpx-u5Oe_IHcD49k";
const sheet = "'회비수입'";

async function readSheet() {
  const { GOOGLE_SERVICE_ACCOUNT_EMAIL: client_email, GOOGLE_PRIVATE_KEY } = process.env;
  if (!client_email || !GOOGLE_PRIVATE_KEY)
    throw new Error("Sheets 읽기 전용 서비스 계정 설정을 확인하세요.");
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email, private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n") },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  try {
    // One snapshot for the ledger and both pivots. Do not cap the range at the current last row.
    const { data } = await google.sheets({ version: "v4", auth }).spreadsheets.values.get({
      spreadsheetId,
      range: sheet,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "SERIAL_NUMBER",
    });
    return data.values ?? [];
  } catch {
    throw new Error("회비수입 시트를 읽을 수 없습니다. 시트 공유 권한과 연결을 확인하세요.");
  }
}

async function readReview(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error("지정한 대조 파일을 JSON으로 읽을 수 없습니다.");
  }
}

async function writePrivate(path, contents) {
  const file = await open(path, "wx", 0o600).catch(() => {
    throw new Error("새 파일을 만들 수 없습니다. 기존 파일과 다른 경로를 지정하세요.");
  });
  try {
    await file.writeFile(contents, "utf8");
  } catch {
    await unlink(path);
    throw new Error("검토 파일을 저장하지 못했습니다.");
  } finally {
    await file.close();
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      review: { type: "string" },
      template: { type: "string" },
      bundle: { type: "string" },
      "compare-db": { type: "boolean" },
      "verify-db": { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "node scripts/reconcile-dues-ledger.mjs [--template 새파일] [--review 대조파일] [--compare-db | --verify-db] [--bundle 새파일]",
    );
    return;
  }
  const compare = values["compare-db"],
    verify = values["verify-db"];
  if (
    (compare && verify) ||
    (values.template && (values.bundle || compare || verify)) ||
    ((values.bundle || compare || verify) && !values.review) ||
    (verify && values.bundle)
  ) {
    throw new Error("명령 조합을 확인하세요. --help로 사용법을 볼 수 있습니다.");
  }
  const grid = await readSheet();
  const rows = normalizeDuesRows(grid.map((row) => row.slice(0, 9)));
  const declaredReceipts = new Set(rows.map((row) => row.parentReceipt).filter(Boolean));
  const sourceRows = rows.length + declaredReceipts.size;
  const duplicateRows = rows.filter((row) => row.duplicate).map((row) => row.sheetRow);
  const report = reconcileDuesPivots(
    rows,
    grid.slice(1).map((row) => row.slice(9, 13)),
    grid.map((row) => row.slice(16)),
  );
  console.log(
    JSON.stringify({ ...report, sourceRows, duesYearRows: rows.length, duplicateRows }, null, 2),
  );
  if (!report.ok) throw new Error("원장과 피벗의 차이를 확인하세요.");
  const review = values.review ? await readReview(values.review) : undefined;
  if (values.template) {
    await writePrivate(
      values.template,
      JSON.stringify(createDuesReview(rows, review), null, 2) + "\n",
    );
    console.log("회원 연결과 단체 입금을 검토할 비공개 대조 파일을 생성했습니다.");
    return;
  }
  if (!values.review) return;
  const result = buildDuesReceipts(rows, review);
  const { receipts, issues, mixedReceipts, settledWithoutAccount } = result;
  if (mixedReceipts.length) console.log(JSON.stringify({ mixedReceipts }, null, 2));
  if (settledWithoutAccount.length) {
    console.log(
      JSON.stringify(
        {
          settledWithoutAccount: {
            rows: settledWithoutAccount.length,
            amount: settledWithoutAccount.reduce((total, row) => total + row.amount, 0),
          },
          importReady: false,
        },
        null,
        2,
      ),
    );
  }
  if (issues.length) {
    for (const issue of issues) console.error(issue);
    throw new Error("대조 파일의 미확인 사항을 해결하세요.");
  }
  if (settledWithoutAccount.length) {
    if (compare || verify || values.bundle) {
      throw new Error(
        "계정 미연결 결산 원장의 납부자 표기를 보존할 수 있는 이관 형식이 필요합니다.",
      );
    }
    console.log("원장 대조를 마쳤습니다.");
    return;
  }
  const json = JSON.stringify(receipts);
  const fingerprint = createHash("sha256").update(json, "utf8").digest("hex");
  console.log(
    JSON.stringify({
      receipts: receipts.length,
      sourceRows,
      bundle_sha256: fingerprint,
    }),
  );
  if (compare || verify || values.bundle) {
    const { compareDevelopmentLedger } = await import("./lib/dues-db-preview.mjs");
    const comparison = await compareDevelopmentLedger(receipts);
    console.log(JSON.stringify(comparison));
    if (!comparison.ok || (verify && !comparison.upToDate)) {
      throw new Error("개발 DB 대조 결과를 확인하세요.");
    }
  }
  if (values.bundle) await writePrivate(values.bundle, json + "\n");
}

main().catch((error) => {
  // Provider and PostgreSQL errors can contain source values. Only local validation reports
  // and the deliberately bounded diagnostics from the ledger modules are suitable for the CLI.
  if (error instanceof Error && !error.code) console.error(error.message);
  else console.error("회비수입 검산을 마치지 못했습니다. 입력과 연결 설정을 확인하세요.");
  process.exitCode = 1;
});
