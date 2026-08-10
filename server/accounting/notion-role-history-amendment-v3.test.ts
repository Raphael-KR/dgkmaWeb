import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";
import { normalizeNotionRoleRowV3 } from "./adapters/notion-organization-role-history-v3";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Record<string, CanonicalValue>;
test("v3 amendment is self-bound and records delegated safe-development scope", () => {
  const mappingBytes = readFileSync("docs/source-contracts/mappings/notion-organization-role-history-v3.json"); const approval = read("docs/source-contracts/approvals/notion-organization-role-history-v3.json");
  const descriptorBytes = readFileSync("docs/source-contracts/releases/notion-organization-role-history-v3.json"); const descriptor = JSON.parse(descriptorBytes.toString("utf8")) as Record<string, CanonicalValue>; const plan = read("docs/source-contracts/releases/notion-role-history-development-release-plan-v3.json");
  const planPreimage = { ...plan }; delete planPreimage.plan_sha256; const approvalPreimage = { ...approval }; delete approvalPreimage.receipt_sha256;
  assert.equal(approval.mapping_sha256, sha256(mappingBytes)); assert.equal(approval.receipt_sha256, sha256(canonicalJson(approvalPreimage))); assert.equal(approval.authority_basis, "owner-delegated-safe-development-decision-v1");
  assert.equal(descriptor.mapping_approval_receipt_sha256, approval.receipt_sha256); assert.equal(descriptor.normalized_schema_sha256, sha256(readFileSync("docs/source-contracts/schemas/role-row-v4.schema.json"))); assert.equal(plan.descriptor_sha256, sha256(descriptorBytes)); assert.equal(plan.plan_sha256, sha256(canonicalJson(planPreimage)));
});

test("v3 maps existing 부산 codes and never invents missing facts", () => {
  const base: Record<string, unknown> = { 표기명: "테스트", 조직구분: "동문회", 상태: "검토필요", 회원매칭상태: "미매칭", 공개여부: "__NO__", 대수: 22, "date:임기:is_datetime": 0 };
  const cases = [["부산지부장", "busan_branch_president"], ["부산지부 부회장", "busan_branch_vice_president"], ["부산지부 총무", "busan_branch_general_affairs"], ["부산지부 재무", "busan_branch_finance"]];
  for (const [display, code] of cases) { const normalized = normalizeNotionRoleRowV3({ ...base, 직위: display }); assert.equal(normalized.position_code, code); assert.equal(normalized.effective_from, null); assert.equal(normalized.appointment_basis, null); }
});
