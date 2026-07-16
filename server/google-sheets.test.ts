import assert from "node:assert/strict";
import test from "node:test";
import { GoogleSheetsService } from "./google-sheets";

function captureConsoleLogs(run: () => Promise<unknown>): Promise<string[]> {
  const messages: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  return run().then(
    () => messages,
    (error) => {
      throw error;
    },
  ).finally(() => {
    console.log = originalLog;
  });
}

test("Google Sheets 매칭 로그는 한국어 비식별 건수만 기록한다", async () => {
  const service = new GoogleSheetsService({
    spreadsheetId: "spreadsheet-test",
    sheets: {
      spreadsheets: {
        values: {
          get: async () => ({
            data: {
              values: [
                ["학과", "기수", "성명", "입학일자", "졸업일자", "주소", "핸드폰번호", "전화번호", "그룹", "상태", "동문회직책", "메모"],
                ["한의학과", "40", "테스트동문", "", "", "", "010-1234-5678", "", "", "", "", ""],
              ],
            },
          }),
        },
        get: async () => ({}),
      },
    },
  });

  const logs = await captureConsoleLogs(() => service.findAlumniByPhoneAndName("+82 10-1234-5678", "테스트동문"));

  assert.deepEqual(logs, ["동문 명부 전화번호 매칭 결과: 1건"]);
  assert.ok(logs.every((message) => !message.includes("010-1234-5678")));
  assert.ok(logs.every((message) => !message.includes("테스트동문")));
});
