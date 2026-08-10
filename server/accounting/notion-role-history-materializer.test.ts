import assert from "node:assert/strict";
import test from "node:test";
import { materializeNotionRoleHistory } from "../../scripts/materialize-notion-role-history-preview-input-v2";

const columns = ["createdTime","date:임기:end","date:임기:is_datetime","date:임기:start","date:임명일:end","date:임명일:is_datetime","date:임명일:start","matched_member_uid","url","검증근거","공개여부","대수","비고","상태","임명근거","입학년도","조직구분","졸업기수","직위","출처","표기명","회원매칭상태"];
const profile = { database_columns: columns, observed_at: "2026-08-09T16:06:30Z", source_revision: "revision-v1" };
const row = Object.fromEntries(columns.map((key) => [key, null])) as Record<string, unknown>;
Object.assign(row, { createdTime: "2026-08-01T00:00:00Z", "date:임기:is_datetime": 0, "date:임기:start": "2026-02-28", url: "https://www.notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 공개여부: "__NO__", 대수: 22, 상태: "검토필요", 임명근거: "회장 임명", 조직구분: "동문회", 직위: "총무이사", 표기명: "테스트", 회원매칭상태: "미매칭" });

test("materializer creates deterministic name-only quarantine review without raw contact fields", () => {
  const result = materializeNotionRoleHistory({ data_source_id: "dae9352c-122b-4902-bdb8-31328c35940f", rows: [row], source_revision: "revision-v1" }, profile);
  assert.deepEqual(result.blockers, {}); assert.equal(result.input?.rows.length, 1); assert.equal(result.input?.rows[0].decisions[0].decision_payload.outcome, "quarantine");
  assert.equal(result.input?.rows[0].normalized_payload.name_snapshot, "테스트"); assert.equal("url" in (result.input?.rows[0].normalized_payload ?? {}), false);
});

test("v3 preserves unknown term and appointment evidence but forces quarantine", () => {
  const incomplete = { ...row, url: "https://www.notion.so/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "date:임기:start": null, 임명근거: null };
  const result = materializeNotionRoleHistory({ data_source_id: "dae9352c-122b-4902-bdb8-31328c35940f", rows: [row, incomplete], source_revision: "revision-v1" }, profile);
  assert.deepEqual(result.blockers, {}); assert.equal(result.input?.rows.length, 2);
  const preserved = result.input?.rows.find((candidate) => candidate.coordinate_key.includes("bbbbbbbb")); assert.equal(preserved?.normalized_payload.effective_from, null); assert.equal(preserved?.normalized_payload.appointment_basis, null); assert.equal(preserved?.decisions[0].decision_payload.outcome, "quarantine");
});

test("unknown position still blocks the entire source", () => {
  const invalid = { ...row, 직위: "새로운 미승인 직위" };
  const result = materializeNotionRoleHistory({ data_source_id: "dae9352c-122b-4902-bdb8-31328c35940f", rows: [invalid], source_revision: "revision-v1" }, profile);
  assert.equal(result.input, null); assert.deepEqual(result.blockers, { "mapping_review_required:position": 1 });
});
