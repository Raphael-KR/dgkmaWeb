import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { materializeAgm36Boundary } from "../../scripts/materialize-agm36-period-boundary-preview-input-v2";

test("frozen payload emits only the two approved AGM36 period boundaries", () => {
  const input = materializeAgm36Boundary(readFileSync("docs/source-authority/22nd-officers.json"));
  assert.equal(input.rows.length, 2); assert.deepEqual(input.rows.map((row) => row.normalized_payload.period_code).sort(), ["AGM36_TO_AGM37", "PRE_AGM36_2026"]); assert.ok(input.rows.every((row) => row.decisions[0].decision_payload.outcome === "approve")); assert.ok(input.rows.every((row) => /^[0-9a-f]{64}$/.test(String(row.normalized_payload.boundary_content_digest))));
  assert.equal(JSON.stringify(input).includes("휴대전화"), false); assert.equal(JSON.stringify(input).includes("주소"), false);
});

test("payload byte drift fails before preview input creation", () => {
  const bytes = Buffer.from(readFileSync("docs/source-authority/22nd-officers.json")); bytes[bytes.length - 2] = bytes[bytes.length - 2] === 32 ? 33 : 32;
  assert.throws(() => materializeAgm36Boundary(bytes), /payload_commit_drift/);
});
