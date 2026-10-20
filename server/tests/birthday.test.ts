import assert from "node:assert/strict";
import test from "node:test";
import { isBirthdayToday } from "@shared/birthday";

test("solar birthday uses the current date in Korea", () => {
  assert.equal(
    isBirthdayToday(
      { birthday: "0101", birthdayType: "SOLAR", isLeapMonth: false },
      new Date("2024-12-31T15:30:00.000Z"),
    ),
    true,
  );
});

test("regular lunar birthday matches its converted solar day", () => {
  assert.equal(
    isBirthdayToday(
      { birthday: "0101", birthdayType: "LUNAR", isLeapMonth: false },
      new Date("2024-02-10T03:00:00.000Z"),
    ),
    true,
  );
});

test("leap lunar birthday matches only the leap month", () => {
  const birthday = { birthday: "0201", birthdayType: "LUNAR" as const, isLeapMonth: true };
  assert.equal(isBirthdayToday(birthday, new Date("2023-03-22T03:00:00.000Z")), true);
  assert.equal(isBirthdayToday(birthday, new Date("2023-02-20T03:00:00.000Z")), false);
});

test("missing or malformed birthday data never matches", () => {
  const now = new Date("2024-01-01T03:00:00.000Z");
  assert.equal(isBirthdayToday({ birthday: null, birthdayType: null, isLeapMonth: null }, now), false);
  assert.equal(isBirthdayToday({ birthday: "1332", birthdayType: "SOLAR", isLeapMonth: false }, now), false);
});
