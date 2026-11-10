import assert from "node:assert/strict";
import test from "node:test";
import { ZodError } from "zod";
import { decodeGipoomPublicId, readGipoomNotice } from "./gipoom-public-api";
import { parseObituaryEventSource } from "../../modules/events/obituary-parser";

const PUBLIC_URL = "https://bugo.gipoom.com/e9597b47c1ec3fcc66e61b0d";

test("decodes the Gipoom public URL identifier deterministically", () => {
  assert.equal(decodeGipoomPublicId("e9597b47c1ec3fcc66e61b0d"), "6a6d3c56de2714840e63638e");
});

test("reads validated Gipoom public API fields without exposing unrelated response data", async () => {
  let requestedUrl = "";
  const result = await readGipoomNotice(PUBLIC_URL, undefined, {
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
  const { text, facts } = result;

  assert.equal(requestedUrl, "https://api.smartnanumi.com/public/member/6a6d3c56de2714840e63638e");
  assert.match(text, /故 故人/);
  assert.match(text, /남\/78세/);
  assert.match(text, /딸\n김동문/);
  assert.match(text, /발인: 2026년 8월 3일 10시 00분/);
  assert.match(text, /빈소: 동국장례식장 특실 2층/);
  assert.doesNotMatch(JSON.stringify(result), /출력하면 안 됨/);
  assert.equal(facts.memberName, "김동문");
  assert.equal(facts.deceasedName, "故人");
  assert.equal(facts.deceasedAge, "78");
  assert.equal(facts.date, "2026-08-03");
  assert.equal(facts.time, "10:00");
  assert.equal(facts.place, "동국장례식장");
  assert.equal(facts.room, "특실");
  assert.equal(facts.floor, "2층");
  assert.deepEqual(facts.accounts, [
    {
      role: "member",
      label: "",
      bank: "동국은행",
      number: "123-456",
      holder: "김동문",
    },
  ]);
  assert.equal(facts.contactPhone, null);
});

test("rejects unsafe or malformed Gipoom source URLs before calling the API", async () => {
  let fetched = false;
  const fetchJson = async () => {
    fetched = true;
    return {};
  };

  await assert.rejects(
    readGipoomNotice("http://user:pass@bugo.gipoom.com:8080/e9597b47c1ec3fcc66e61b0d", undefined, {
      fetchJson,
    }),
    /Unsupported public obituary URL/,
  );
  assert.equal(fetched, false);
});

test("rejects invalid Gipoom API field types instead of inventing obituary facts", async () => {
  await assert.rejects(
    readGipoomNotice(PUBLIC_URL, undefined, {
      fetchJson: async () => ({
        name: "김동문",
        fevent: { deceasedInfo: { name: "故人", age: 999 } },
      }),
    }),
    (error: unknown) =>
      error instanceof ZodError &&
      error.issues.some(
        (issue) =>
          issue.path.join(".") === "fevent.deceasedInfo.age" &&
          issue.code === "too_big" &&
          issue.maximum === 130,
      ),
  );
});

test("labels a canonical provider relationship for the common obituary parser", async () => {
  const { text, facts } = await readGipoomNotice(PUBLIC_URL, undefined, {
    fetchJson: async () => ({
      name: "김동문",
      reverseType: "장인",
      fevent: {
        deceasedInfo: { name: "김고인", age: 80 },
      },
    }),
  });

  assert.match(text, /김동문 동문 빙부상/);
  assert.equal(facts.relation, "빙부");
  assert.equal(facts.memberName, "김동문");
  const parsed = parseObituaryEventSource(text);
  assert.equal(parsed.draft.details.relationship, "빙부");
  assert.equal(parsed.draft.relatedMemberName, "김동문");
});
