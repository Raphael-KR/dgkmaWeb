import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { koreaCalendarYear } from "./korea-date";

test("Korea calendar year changes at the UTC plus nine boundary", () => {
  assert.equal(koreaCalendarYear(new Date("2026-12-31T14:59:59.999Z")), 2026);
  assert.equal(koreaCalendarYear(new Date("2026-12-31T15:00:00.000Z")), 2027);
  assert.equal(koreaCalendarYear(new Date("2027-01-01T00:00:00.000+09:00")), 2027);
});

test("membership status uses the Korea calendar year helper", async () => {
  const storage = await readFile(new URL("./storage.ts", import.meta.url), "utf8");
  assert.match(storage, /const year = koreaCalendarYear\(\)/);
});
