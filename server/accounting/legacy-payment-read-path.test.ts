import assert from "node:assert/strict";
import test from "node:test";
import { legacyPaymentReadPathForPhase, readLegacyPaymentReadPath } from "./legacy-payment-read-path";

test("legacy payment read authority switches only for new and rolls back reads without reopening writes", () => {
  assert.equal(legacyPaymentReadPathForPhase(null), "legacy");
  assert.equal(legacyPaymentReadPathForPhase("legacy"), "legacy");
  assert.equal(legacyPaymentReadPathForPhase("fenced"), "legacy");
  assert.equal(legacyPaymentReadPathForPhase("new"), "new");
  assert.equal(legacyPaymentReadPathForPhase("read_rollback"), "legacy");
});

test("read path uses the latest DB-resident cutover phase", async () => {
  const observed: string[] = [];
  const client = { query: async (sql: string) => { observed.push(sql); return { rowCount: 1, rows: [{ phase: "read_rollback" }] }; } };
  assert.deepEqual(await readLegacyPaymentReadPath(client as never), { phase: "read_rollback", readPath: "legacy" });
  assert.match(observed[0], /ORDER BY version DESC LIMIT 1/);
});
