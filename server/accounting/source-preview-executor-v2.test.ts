import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("source preview executor is Development-only and follows the three-phase receipt contract", async () => {
  const source = await readFile(new URL("../../scripts/preview-accounting-source-batch-v2.ts", import.meta.url), "utf8");
  assert.match(source, /arg\("--target"\) !== "development"/);
  assert.match(source, /source_preview_input_must_be_ephemeral/);
  assert.match(source, /command: "import_batch:preview"/);
  assert.match(source, /phase: 0[\s\S]*slot_kind: "operation_receipt"/);
  assert.match(source, /phase: 1[\s\S]*slot_kind: "business_row"/);
  assert.match(source, /phase: 2[\s\S]*slot_kind: "audit_row"/);
  assert.match(source, /for \(const plan of plans\) plan\.auditId = await reserve/);
  assert.match(source, /source_preview_downstream_business_row_detected/);
  assert.match(source, /outcome: "verified_noop"/);
  assert.doesNotMatch(source, /PROD_DATABASE|production/);
});

test("source snapshots stay in immutable row versions and out of receipts and stdout", async () => {
  const source = await readFile(new URL("../../scripts/preview-accounting-source-batch-v2.ts", import.meta.url), "utf8");
  assert.match(source, /row\.input\.source_display_snapshot/);
  const receiptStart = source.indexOf("async function insertReceipt");
  const graphStart = source.indexOf("async function insertBusinessGraph");
  assert.ok(receiptStart >= 0 && graphStart > receiptStart);
  assert.equal(source.slice(receiptStart, graphStart).includes("normalized_payload"), false);
  assert.equal(source.slice(receiptStart, graphStart).includes("source_display_snapshot"), false);
  assert.equal(source.slice(source.indexOf("async function main()")).includes("normalized_payload"), false);
});
