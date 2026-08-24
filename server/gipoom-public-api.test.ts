import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeGipoomPublicId,
  readGipoomPublicObituary,
} from "./gipoom-public-api";
import { parseObituaryEventSource } from "./obituary-parser";

const PUBLIC_URL = "https://bugo.gipoom.com/e9597b47c1ec3fcc66e61b0d";

test("decodes the Gipoom public URL identifier deterministically", () => {
  assert.equal(decodeGipoomPublicId("e9597b47c1ec3fcc66e61b0d"), "6a6d3c56de2714840e63638e");
});

test("reads validated Gipoom public API fields without exposing unrelated response data", async () => {
  let requestedUrl = "";
  const text = await readGipoomPublicObituary(PUBLIC_URL, {
    fetchJson: async (url) => {
      requestedUrl = url;
      return {
        name: "김동문",
        phoneNumber: "01012345678",
        reverseType: "딸",
        bank: "동국은행",
        cashAccount: "123-456",
        accountHolder: "김동문",
        secretInternalMemo: "출력하면 안 됨",
        fevent: {
          deceasedInfo: {
            name: "故人",
            age: 78,
            sex: "남",
            coffinOut: {
              date: "2026-08-03T00:00:00",
              time: "2026-08-03T10:00:00",
            },
          },
          funeralHome: { info: { name: "동국장례식장" } },
          roomCurrent: { name: "특실", nameDetail: "2층" },
        },
      };
    },
  });

  assert.equal(requestedUrl, "https://api.smartnanumi.com/public/member/6a6d3c56de2714840e63638e");
  assert.match(text, /故 故人/);
  assert.match(text, /남\/78세/);
  assert.match(text, /딸\n김동문/);
  assert.match(text, /발인: 2026년 8월 3일 10시 00분/);
  assert.match(text, /빈소: 동국장례식장 특실 2층/);
  assert.doesNotMatch(text, /출력하면 안 됨/);
});

test("rejects unsafe or malformed Gipoom source URLs before calling the API", async () => {
  let fetched = false;
  const fetchJson = async () => {
    fetched = true;
    return {};
  };

  await assert.rejects(
    readGipoomPublicObituary(
      "http://user:pass@bugo.gipoom.com:8080/e9597b47c1ec3fcc66e61b0d",
      { fetchJson },
    ),
    /지원하지 않는 기품 공개 링크/,
  );
  assert.equal(fetched, false);
});

test("rejects invalid Gipoom API field types instead of inventing obituary facts", async () => {
  await assert.rejects(
    readGipoomPublicObituary(PUBLIC_URL, {
      fetchJson: async () => ({
        name: "김동문",
        fevent: { deceasedInfo: { name: "故人", age: 999 } },
      }),
    }),
    /기품 공개 정보/,
  );
});

test("labels a canonical provider relationship for the common obituary parser", async () => {
  const text = await readGipoomPublicObituary(PUBLIC_URL, {
    fetchJson: async () => ({
      name: "김동문",
      reverseType: "장인",
      fevent: {
        deceasedInfo: { name: "김고인", age: 80 },
      },
    }),
  });

  assert.match(text, /김동문 동문 빙부상/);
  const parsed = parseObituaryEventSource(text);
  assert.equal(parsed.draft.details.relationship, "빙부");
  assert.equal(parsed.draft.relatedMemberName, "김동문");
});
