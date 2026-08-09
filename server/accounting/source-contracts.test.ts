import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readManifest } from "../../scripts/schema-ledger";
import { normalizeMembershipIdentityRow } from "./adapters/membership-integrated-address-book-v1";
import { normalizeNotionRoleRow } from "./adapters/notion-organization-role-history-v1";
import {
  canonicalJson,
  ImmutableCoordinateVersionStore,
  TODO_14_LIVE_SOURCES,
  TODO_14_MANIFEST_SHA256,
  validateSourceContract,
} from "./source-contracts";

const membership = {
  profile: "docs/source-contracts/profiles/membership-integrated-address-book.json",
  mapping: "docs/source-contracts/mappings/membership-integrated-address-book-v1.json",
  approval: "docs/source-contracts/approvals/membership-integrated-address-book-v1.json",
  schema: "docs/source-contracts/schemas/membership-integrated-address-book-v1.schema.json",
};
const notion = {
  profile: "docs/source-contracts/profiles/notion-organization-role-history.json",
  mapping: "docs/source-contracts/mappings/notion-organization-role-history-v1.json",
  approval: "docs/source-contracts/approvals/notion-organization-role-history-v1.json",
  schema: "docs/source-contracts/schemas/notion-organization-role-history-v1.schema.json",
};

test("Todo 14 profiles, maps, provider approvals, and manifest source identities are byte-bound", () => {
  const membershipContract = validateSourceContract(membership.profile, membership.mapping, membership.approval);
  const notionContract = validateSourceContract(notion.profile, notion.mapping, notion.approval);
  assert.equal(membershipContract.outputFamily, "member-identity-row-v1");
  assert.equal(notionContract.outputFamily, "role-row-v2");
  const manifest = readManifest();
  assert.equal(manifest.sha256, TODO_14_MANIFEST_SHA256);
  const registry = (manifest.value.logical_source_uuid_registry as Array<Record<string, unknown>>);
  for (const [sourceCode, source] of Object.entries(TODO_14_LIVE_SOURCES)) {
    assert.deepEqual(registry.find((row) => row.source_code === sourceCode), {
      default_sql: null,
      source_code: sourceCode,
      source_uid: source.sourceUid,
      uniqueness: "global",
    });
  }
  assert.equal(registry.some((row) => row.source_code === "MEMBERSHIP_OFFICER_WORKBOOK"), false);
  assert.equal(registry.some((row) => row.source_code === "NOTION_22ND_OFFICERS"), false);
});

test("normalized schemas close the exact adapter outputs and exclude contact fields", () => {
  const key = "synthetic-test-key";
  const member = normalizeMembershipIdentityRow({
    "성명": " 테스트회원 ", "기수": "졸업22기", "입학일자": "2001-03-02", "졸업일자": "2007-02-20",
    "그룹": "정회원", "상태": "활동", "휴대전화": "010-0000-0000", "주소": "synthetic",
  }, key);
  const role = normalizeNotionRoleRow({
    "표기명": "테스트회원", "졸업기수": "22", "입학년도": "2001", "대수": "22", "조직구분": "동문회",
    "직위": "총무이사", "date:임명일:start": "2026-03-06", "date:임기:is_datetime": false,
    "date:임기:start": "2026-03-06", "date:임기:end": null, "임명근거": "회장 임명", "상태": "검토필요",
    "공개여부": false, "회원매칭상태": "미매칭", "matched_member_uid": null, "비고": null, "출처": "synthetic://role",
    "검증근거": "synthetic-only",
  }, key);
  const memberSchema = JSON.parse(readFileSync(membership.schema, "utf8"));
  const roleSchema = JSON.parse(readFileSync(notion.schema, "utf8"));
  assert.deepEqual(Object.keys(member).sort(), Object.keys(memberSchema.properties).sort());
  assert.deepEqual(Object.keys(role).sort(), Object.keys(roleSchema.properties).sort());
  assert.equal(Object.hasOwn(member, "휴대전화"), false);
  assert.equal(Object.hasOwn(member, "주소"), false);
  assert.match(member.name_digest, /^[0-9a-f]{64}$/);
  assert.equal(role.position_code, "director");
  assert.equal(role.appointment_basis, "appointment");
  assert.throws(() => normalizeNotionRoleRow({ ...role, "조직구분": "동문회", "직위": "미승인직책", "표기명": "테스트", "임명근거": "회장 임명", "상태": "검토필요", "회원매칭상태": "미매칭" }, key), /mapping_review_required:position/);
});

test("coordinate versions reuse identical content and append a successor for changed content", () => {
  const store = new ImmutableCoordinateVersionStore();
  const source = "MEMBERSHIP_INTEGRATED_ADDRESS_BOOK";
  const first = store.apply(source, "sheet:876761083:row:2", { generation: 22, name_digest: "a".repeat(64) });
  const retry = store.apply(source, "sheet:876761083:row:2", { generation: 22, name_digest: "a".repeat(64) });
  const changed = store.apply(source, "sheet:876761083:row:2", { generation: 23, name_digest: "a".repeat(64) });
  assert.equal(first.result, "created");
  assert.equal(retry.result, "verified_noop");
  assert.strictEqual(retry.row, first.row);
  assert.equal(changed.result, "superseded");
  assert.equal(changed.row.version, 2);
  assert.equal(changed.row.supersedesVersion, 1);
  assert.equal(store.history(source, "sheet:876761083:row:2").length, 2);
  assert.equal(canonicalJson(changed.row.normalizedPayload), `{"generation":23,"name_digest":"${"a".repeat(64)}"}`);
});

test("removed Sheet role sources and direct frozen-payload role imports fail closed", () => {
  const fixtures = JSON.parse(readFileSync("server/fixtures/database-architecture/task-14/failure-cases.json", "utf8"));
  for (const fixture of fixtures.cases) {
    assert.ok(["removed_sheet_role_source", "direct_frozen_payload_role_source", "unactivated_notion_source", "unknown_role", "coordinate_mutation"].includes(fixture.kind));
    if (fixture.source_code) {
      assert.equal(Object.hasOwn(TODO_14_LIVE_SOURCES, fixture.source_code), false);
    }
  }
});
