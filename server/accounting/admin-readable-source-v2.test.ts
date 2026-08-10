import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { adminReviewProjection } from "./adapters/admin-readable-source-v2";
import { normalizeDeferredSourceRowV2 } from "./adapters/deferred-source-normalization-v2";
import type { DeferredMapping } from "./adapters/deferred-source-normalization-v1";
import { normalizeMembershipIdentityRowV2 } from "./adapters/membership-integrated-address-book-v2";
import { normalizeNotionRoleRowV2 } from "./adapters/notion-organization-role-history-v2";
import { canonicalJson } from "./source-contracts";

const mapping = (name: string) => JSON.parse(readFileSync(`docs/source-contracts/mappings/${name}-v2.json`, "utf8")) as DeferredMapping;
const roleFixture = (name: string, memberUid: string) => ({
  "표기명": name, "졸업기수": "22", "입학년도": "2001", "대수": "22", "조직구분": "동문회",
  "직위": "총무이사", "date:임명일:start": "2026-03-06", "date:임기:is_datetime": false,
  "date:임기:start": "2026-03-06", "date:임기:end": null, "임명근거": "회장 임명", "상태": "검토필요",
  "공개여부": false, "회원매칭상태": "매칭", "matched_member_uid": memberUid, "비고": "확인 중",
  "출처": "synthetic://role", "검증근거": "synthetic-only",
});

test("v2 member source preserves admin-readable evidence without contact fields or a secret", () => {
  const member = normalizeMembershipIdentityRowV2({
    "성명": "  테스트   회원 ", "기수": "졸업22기", "입학일자": "2001-03-02", "졸업일자": "2007-02-20",
    "그룹": " 정회원 ", "상태": "활동", "휴대전화": "010-0000-0000", "주소": "synthetic",
  });
  assert.equal(member.name_snapshot, "테스트 회원");
  assert.equal(member.member_kind_evidence_snapshot, "정회원");
  assert.match(member.name_key_digest, /^[0-9a-f]{64}$/);
  assert.equal(Object.hasOwn(member, "휴대전화"), false);
  assert.equal(Object.hasOwn(member, "주소"), false);
});

test("a renamed member keeps stable member UID while source snapshots remain historical", () => {
  const memberUid = "11111111-1111-4111-8111-111111111111";
  const before = normalizeNotionRoleRowV2(roleFixture("이전 이름", memberUid));
  const after = normalizeNotionRoleRowV2(roleFixture("변경 이름", memberUid));
  assert.equal(before.matched_member_uid, memberUid);
  assert.equal(after.matched_member_uid, memberUid);
  assert.notEqual(before.name_snapshot, after.name_snapshot);
  assert.notEqual(before.name_key_digest, after.name_key_digest);
});

test("v2 member and role normalizers exactly match their closed schemas", () => {
  const member = normalizeMembershipIdentityRowV2({ "성명": "테스트 회원", "기수": "졸업22기" });
  const role = normalizeNotionRoleRowV2(roleFixture("테스트 회원", "11111111-1111-4111-8111-111111111111"));
  const memberSchema = JSON.parse(readFileSync("docs/source-contracts/schemas/member-identity-row-v2.schema.json", "utf8"));
  const roleSchema = JSON.parse(readFileSync("docs/source-contracts/schemas/role-row-v3.schema.json", "utf8"));
  assert.deepEqual(Object.keys(member).sort(), Object.keys(memberSchema.properties).sort());
  assert.deepEqual(Object.keys(role).sort(), Object.keys(roleSchema.properties).sort());
});

test("admin review projection contains source display while decision evidence can remain display-free", () => {
  const payload = normalizeMembershipIdentityRowV2({ "성명": "테스트 회원", "기수": "졸업22기" });
  const review = adminReviewProjection({
    sourceCode: "MEMBERSHIP_INTEGRATED_ADDRESS_BOOK",
    coordinateKey: "sheet:876761083:row:2",
    display: { name: payload.name_snapshot },
    normalizedPayload: payload,
  });
  assert.equal(review.reviewDisplay.name, "테스트 회원");
  const decisionEvidence = canonicalJson({ sourceContentDigest: review.sourceContentDigest });
  assert.doesNotMatch(decisionEvidence, /테스트|회원/);
});

test("deferred v2 keeps readable candidate names and excludes account or CMS fields", () => {
  const result = normalizeDeferredSourceRowV2(mapping("group-foreign-faculty-2025"), {
    coordinateKey: "1501009351:3",
    recordKind: "allocation_roster",
    values: { "졸업기수": "12기", "성  명": "테스트 교수" },
  });
  assert.equal(result.envelope.normalized_payload.member_name_snapshot, "테스트 교수");
  assert.equal(result.envelope.normalized_payload.group_name_snapshot, "외래교수회");
  assert.equal(result.envelope.normalized_payload.allocation_status, "candidate_only");
  assert.match(String(result.envelope.normalized_payload.member_name_key_digest), /^[0-9a-f]{64}$/);
  assert.doesNotMatch(canonicalJson(result.envelope), /계좌번호|상대계좌번호|CMS코드/);
});

test("all ten v2 mappings contain no HMAC or secret reference and bind every parser", () => {
  const names = [
    "membership-integrated-address-book", "notion-organization-role-history", "agm36-period-boundary",
    "bank-ibk-2026", "bank-toss-2026", "group-foreign-faculty-2025", "ledger-dues-policy-2024-2025",
    "ledger-final-2022-2025", "legacy-payments", "notion-dues-regulation-draft",
  ];
  for (const name of names) {
    const bytes = readFileSync(`docs/source-contracts/mappings/${name}-v2.json`, "utf8");
    assert.doesNotMatch(bytes, /HMAC|ACCOUNTING_PII_HMAC_KEY_V1|source-row-hmac|key_ref/i);
    const value = JSON.parse(bytes) as Record<string, unknown>;
    const parsers = value.parsers as Record<string, unknown>;
    for (const entry of value.columns as Array<Record<string, unknown>>) assert.ok(Object.hasOwn(parsers, String(entry.parser_code)));
  }
});

test("all ten v2 mapping approvals bind the exact provider-owned owner approval", () => {
  const names = [
    "membership-integrated-address-book", "notion-organization-role-history", "agm36-period-boundary",
    "bank-ibk-2026", "bank-toss-2026", "group-foreign-faculty-2025", "ledger-dues-policy-2024-2025",
    "ledger-final-2022-2025", "legacy-payments", "notion-dues-regulation-draft",
  ];
  for (const name of names) {
    const mappingBytes = readFileSync(`docs/source-contracts/mappings/${name}-v2.json`);
    const approvalBytes = readFileSync(`docs/source-contracts/approvals/${name}-v2.json`, "utf8");
    const approval = JSON.parse(approvalBytes) as Record<string, unknown>;
    const preimage = { ...approval }; delete preimage.receipt_sha256;
    assert.equal(approvalBytes, `${canonicalJson(approval as never)}\n`);
    assert.equal(approval.mapping_sha256, createSha(mappingBytes));
    assert.equal(approval.platform_thread_id, "019fe3d1-7669-7911-b30f-2ebc99d3245a");
    assert.equal(approval.platform_message_id, "item-418");
    assert.equal(approval.platform_message_created_at, "2026-08-10T06:43:28Z");
    assert.equal(approval.approved_at, "2026-08-10T06:43:28Z");
    assert.equal(approval.approval_text_sha256, createSha(Buffer.from("승인\n")));
    assert.equal(approval.receipt_sha256, createSha(Buffer.from(canonicalJson(preimage as never))));
  }
});

function createSha(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
