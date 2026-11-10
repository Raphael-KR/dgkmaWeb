import assert from "node:assert/strict";
import test from "node:test";
import { GoogleSheetsService } from "./google-sheets";

function captureConsoleLogs(run: () => Promise<unknown>): Promise<string[]> {
  const messages: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  return run()
    .then(
      () => messages,
      (error) => {
        throw error;
      },
    )
    .finally(() => {
      console.log = originalLog;
    });
}

test("Google Sheets 명부 조회는 행 원문을 로그에 기록하지 않는다", async () => {
  const service = new GoogleSheetsService({
    spreadsheetId: "spreadsheet-test",
    sheets: {
      spreadsheets: {
        values: {
          get: async () => ({
            data: {
              values: [
                [
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
                ],
                ["한의학과", "40", "테스트동문", "", "", "", "010-1234-5678", "", "", "", "", ""],
              ],
            },
          }),
        },
        get: async () => ({}),
      },
    },
  });

  const logs = await captureConsoleLogs(async () => {
    const records = await service.fetchAlumniData();
    assert.equal(records.length, 1);
  });

  assert.deepEqual(logs, []);
});
