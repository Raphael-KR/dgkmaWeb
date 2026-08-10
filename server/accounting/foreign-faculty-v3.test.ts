import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeDeferredSourceRowV2, type DeferredMappingV2 } from "./adapters/deferred-source-normalization-v2";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";

test("foreign-faculty v3 binds the reproducible profile without changing candidate-only semantics", () => {
  const profileBytes = readFileSync("docs/source-contracts/profiles/group-foreign-faculty-2025-v3.json", "utf8"); const profile = JSON.parse(profileBytes) as Record<string, CanonicalValue>; const profilePreimage = { ...profile }; delete profilePreimage.profile_sha256;
  const mappingBytes = readFileSync("docs/source-contracts/mappings/group-foreign-faculty-2025-v3.json", "utf8"); const mapping = JSON.parse(mappingBytes) as unknown as DeferredMappingV2;
  assert.equal(profileBytes, `${canonicalJson(profile)}\n`); assert.equal(profile.profile_sha256, sha256(canonicalJson(profilePreimage))); assert.equal(mapping.source_profile_sha256, profile.profile_sha256); assert.equal(mapping.adapter_code, "group-roster-v3");
  const result = normalizeDeferredSourceRowV2(mapping, { coordinateKey: "sheet:test:row:3", recordKind: "allocation_roster", values: { 졸업기수: "41기", "성  명": "관리자 표시 이름" } });
  assert.equal(result.envelope.normalized_payload.proposed_amount, "50000"); assert.equal(result.envelope.normalized_payload.allocation_status, "candidate_only"); assert.equal(result.envelope.normalized_payload.member_name_snapshot, "관리자 표시 이름"); assert.match(String(result.envelope.normalized_payload.member_name_key_digest), /^[0-9a-f]{64}$/); assert.doesNotMatch(mappingBytes, /ACCOUNTING_PII_HMAC_KEY_V1|createHmac/i);
});

test("foreign-faculty v3 release is self-bound but authorizes no source decision", () => {
  const mappingBytes = readFileSync("docs/source-contracts/mappings/group-foreign-faculty-2025-v3.json"); const approvalBytes = readFileSync("docs/source-contracts/approvals/group-foreign-faculty-2025-v3.json", "utf8"); const approval = JSON.parse(approvalBytes) as Record<string, CanonicalValue>; const approvalPreimage = { ...approval }; delete approvalPreimage.receipt_sha256;
  const descriptorBytes = readFileSync("docs/source-contracts/releases/group-foreign-faculty-2025-v3.json"); const descriptor = JSON.parse(descriptorBytes.toString("utf8")) as Record<string, CanonicalValue>; const planBytes = readFileSync("docs/source-contracts/releases/group-foreign-faculty-development-release-plan-v3.json", "utf8"); const plan = JSON.parse(planBytes) as Record<string, CanonicalValue>; const planPreimage = { ...plan }; delete planPreimage.plan_sha256;
  assert.equal(approval.receipt_sha256, sha256(canonicalJson(approvalPreimage))); assert.equal(approval.mapping_sha256, sha256(mappingBytes)); assert.ok((approval.decision_scope as CanonicalValue[]).includes("no_source_decision")); assert.equal(descriptor.mapping_approval_receipt_sha256, approval.receipt_sha256); assert.equal(plan.descriptor_sha256, sha256(descriptorBytes)); assert.equal(plan.plan_sha256, sha256(canonicalJson(planPreimage))); assert.equal(planBytes, `${canonicalJson(plan)}\n`);
});
