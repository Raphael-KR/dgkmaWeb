import assert from "node:assert/strict";
import test from "node:test";
import { uniqueAlumniMatch } from "./alumni-match";

test("alumni matching accepts exactly one deterministic result", () => {
  assert.equal(uniqueAlumniMatch([]), undefined);
  assert.equal(uniqueAlumniMatch(["first"]), "first");
  assert.equal(uniqueAlumniMatch(["first", "second"]), undefined);
});
