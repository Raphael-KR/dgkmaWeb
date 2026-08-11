import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { materializeAgm36BoundaryV3 } from "../../scripts/materialize-agm36-period-boundary-preview-input-v3";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";

type Json = Record<string, CanonicalValue>;
const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Json;

test("AGM36 v3 binds the owner-approved Notion v4 boundary row", () => {
  const mappingBytes = readFileSync("docs/source-contracts/mappings/agm36-period-boundary-v3.json");
  const approval = read("docs/source-contracts/approvals/agm36-period-boundary-v3.json"); const approvalPreimage = { ...approval }; delete approvalPreimage.receipt_sha256;
  const descriptorBytes = readFileSync("docs/source-contracts/releases/agm36-period-boundary-v3.json"); const descriptor = JSON.parse(descriptorBytes.toString("utf8")) as Json;
  const plan = read("docs/source-contracts/releases/agm36-period-boundary-development-release-plan-v3.json"); const planPreimage = { ...plan }; delete planPreimage.plan_sha256;
  assert.equal(approval.mapping_sha256, sha256(mappingBytes)); assert.equal(approval.receipt_sha256, sha256(canonicalJson(approvalPreimage)));
  assert.equal(approval.approved_boundary_coordinate_key, "notion:page:3b72225d-9c4d-81b6-9fbb-f30287bfe90e");
  assert.equal(approval.approved_boundary_content_digest, "2e0b0afea037bca10fd6ff405e629794367edd590031a409a8073d99eb2bfbc2");
  assert.equal(descriptor.adapter_version, "3.0.0"); assert.equal(descriptor.mapping_approval_receipt_sha256, approval.receipt_sha256);
  assert.equal(plan.descriptor_sha256, sha256(descriptorBytes)); assert.equal(plan.plan_sha256, sha256(canonicalJson(planPreimage)));
});

test("AGM36 v3 emits exactly two periods with the approved boundary evidence", () => {
  const input = materializeAgm36BoundaryV3(readFileSync("docs/source-authority/22nd-officers.json"));
  assert.equal(input.rows.length, 2); assert.deepEqual(input.rows.map((row) => row.normalized_payload.period_code).sort(), ["AGM36_TO_AGM37", "PRE_AGM36_2026"]);
  for (const row of input.rows) {
    assert.equal(row.normalization_version, "agm-period-boundary-v3@3.0.0+notion-role-v4-boundary-v1");
    assert.equal(row.normalized_payload.boundary_coordinate_key, approvalCoordinate());
    assert.equal(row.normalized_payload.boundary_content_digest, "2e0b0afea037bca10fd6ff405e629794367edd590031a409a8073d99eb2bfbc2");
    assert.equal(row.decisions[0].decision_payload.outcome, "approve");
  }
});

function approvalCoordinate(): string { return String(read("docs/source-contracts/approvals/agm36-period-boundary-v3.json").approved_boundary_coordinate_key); }
