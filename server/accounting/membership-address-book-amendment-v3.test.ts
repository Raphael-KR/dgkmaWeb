import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeMembershipIdentityRowV3 } from "./adapters/membership-integrated-address-book-v3";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Record<string, CanonicalValue>;

test("v3 binds the refreshed profile, mapping, delegated receipt and release plan", () => {
  const profile = read("docs/source-contracts/profiles/membership-integrated-address-book-v3.json"); const profilePreimage = { ...profile }; delete profilePreimage.profile_sha256;
  const mappingBytes = readFileSync("docs/source-contracts/mappings/membership-integrated-address-book-v3.json"); const approval = read("docs/source-contracts/approvals/membership-integrated-address-book-v3.json"); const approvalPreimage = { ...approval }; delete approvalPreimage.receipt_sha256;
  const descriptorBytes = readFileSync("docs/source-contracts/releases/membership-integrated-address-book-v3.json"); const descriptor = JSON.parse(descriptorBytes.toString("utf8")) as Record<string, CanonicalValue>;
  const plan = read("docs/source-contracts/releases/membership-address-book-development-release-plan-v3.json"); const planPreimage = { ...plan }; delete planPreimage.plan_sha256;
  assert.equal(profile.source_revision, "drive-version:2130;modified:2026-08-09T15:49:34.017Z"); assert.equal(profile.profile_sha256, sha256(canonicalJson(profilePreimage)));
  assert.equal(approval.mapping_sha256, sha256(mappingBytes)); assert.equal(approval.receipt_sha256, sha256(canonicalJson(approvalPreimage)));
  assert.equal(descriptor.source_profile_file_sha256, sha256(readFileSync("docs/source-contracts/profiles/membership-integrated-address-book-v3.json")));
  assert.equal(descriptor.normalized_schema_sha256, sha256(readFileSync("docs/source-contracts/schemas/member-identity-row-v2.schema.json")));
  assert.equal(plan.descriptor_sha256, sha256(descriptorBytes)); assert.equal(plan.plan_sha256, sha256(canonicalJson(planPreimage)));
});

test("v3 accepts the observed integer generation and dotted dates without contact fields", () => {
  const row = normalizeMembershipIdentityRowV3({ "성명": " 테스트  회원 ", "기수": 22, "입학일자": "2001.3.2", "졸업일자": "2007.02.20", "그룹": "정회원", "상태": "활동", "휴대전화": "010-0000-0000" });
  assert.equal(row.name_snapshot, "테스트 회원"); assert.equal(row.generation, 22); assert.equal(row.admitted_on, "2001-03-02"); assert.equal(row.graduated_on, "2007-02-20"); assert.equal(Object.hasOwn(row, "휴대전화"), false);
  assert.throws(() => normalizeMembershipIdentityRowV3({ "성명": "테스트", "기수": "대학원", "입학일자": "2001.13.1" }), /mapping_review_required/);
});
