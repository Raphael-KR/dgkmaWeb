import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";

type Json = Record<string, CanonicalValue>;

const PROFILE_PATH = "docs/source-contracts/profiles/agm36-period-boundary.json";
const MAPPING_PATH = "docs/source-contracts/mappings/agm36-period-boundary-v3.json";
const APPROVAL_PATH = "docs/source-contracts/approvals/agm36-period-boundary-v3.json";
const DESCRIPTOR_PATH = "docs/source-contracts/releases/agm36-period-boundary-v3.json";
const PLAN_PATH = "docs/source-contracts/releases/agm36-period-boundary-development-release-plan-v3.json";
const SOURCE_CODE = "AGM36_PERIOD_BOUNDARY";
const BOUNDARY_COORDINATE = "notion:page:3b72225d-9c4d-81b6-9fbb-f30287bfe90e";
const BOUNDARY_CONTENT_DIGEST = "2e0b0afea037bca10fd6ff405e629794367edd590031a409a8073d99eb2bfbc2";
const APPROVAL_TEXT = "기존 AGM36 v2 release·preview는 이력으로 보존하고, 실제 Notion v4의 22대 회장 경계 row에 결합한 immutable v3 mapping/release와 fresh preview를 생성한다. 기존 v2 set은 reject하고, v3의 PRE_AGM36_2026·AGM36_TO_AGM37 두 기간만 Development에서 관리자 CLI로 approve/apply한다. DB 직접 변경, service 검증 완화, Production·배포 작업은 하지 않으며 외래교수회도 변경하지 않는다.\n";

const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf8")) as Json;
const v2 = JSON.parse(readFileSync("docs/source-contracts/mappings/agm36-period-boundary-v2.json", "utf8")) as Json;
const mapping = structuredClone(v2) as Json;
mapping.adapter_code = "agm-period-boundary-v3";
mapping.columns = (mapping.columns as Json[]).map((column) => {
  if (column.target_field === "boundary_content_digest") return { ...column, parser_code: "approved_source_row_reference_v1", source_selector: { kind: "constant", value: BOUNDARY_CONTENT_DIGEST } } as Json;
  if (column.target_field === "boundary_coordinate_key") return { ...column, parser_code: "approved_source_row_reference_v1", source_selector: { kind: "constant", value: BOUNDARY_COORDINATE } } as Json;
  return column;
});
const parsers = mapping.parsers as Json;
delete parsers.payload_digest_reference_v1;
parsers.approved_source_row_reference_v1 = { operation: "owner_approved_exact_source_row_reference" } as Json;
writeFileSync(MAPPING_PATH, `${canonicalJson(mapping)}\n`, { flag: "wx" });

const approvalPreimage = {
  approval_text_sha256: sha256(APPROVAL_TEXT),
  approved_at: "2026-08-11T01:22:04Z",
  approved_boundary_content_digest: BOUNDARY_CONTENT_DIGEST,
  approved_boundary_coordinate_key: BOUNDARY_COORDINATE,
  authority_basis: "owner-explicit-current-turn-decision-v1",
  decision_scope: ["preserve_v2_history", "immutable_v3_mapping_and_release", "fresh_preview", "reject_v2_set", "approve_apply_two_v3_periods", "development_only", "no_direct_sql", "no_service_relaxation", "no_production_or_deploy", "no_foreign_faculty_change"],
  mapping_sha256: sha256(readFileSync(MAPPING_PATH)),
  schema_version: "source-mapping-owner-decision-v1",
  source_code: SOURCE_CODE,
  source_profile_sha256: profile.profile_sha256,
} as Json;
const approval = { ...approvalPreimage, receipt_sha256: sha256(canonicalJson(approvalPreimage)) } as Json;
writeFileSync(APPROVAL_PATH, `${canonicalJson(approval)}\n`, { flag: "wx" });

const closurePaths = [
  "scripts/materialize-agm36-period-boundary-preview-input-v3.ts",
  "server/accounting/source-contracts.ts",
  "server/accounting/source-preview-contract-v2.ts",
].sort();
const closure = { schema_version: "normalization-implementation-closure-v1", files: closurePaths.map((path) => ({ path, sha256: sha256(readFileSync(path)) })) } as CanonicalValue;
const descriptor = {
  adapter_code: "agm-period-boundary-v3",
  adapter_version: "3.0.0",
  mapping_approval_receipt_sha256: approval.receipt_sha256,
  mapping_table_sha256: approval.mapping_sha256,
  normalization_implementation_sha256: sha256(canonicalJson(closure)),
  normalized_schema_sha256: sha256(readFileSync("docs/source-contracts/schemas/deferred-source-normalized-row-v2.schema.json")),
  output_family: "period-boundary-v1",
  schema_version: "admin-readable-source-release-descriptor-v3",
  source_code: SOURCE_CODE,
  source_profile_file_sha256: sha256(readFileSync(PROFILE_PATH)),
  source_profile_sha256: profile.profile_sha256,
} as Json;
writeFileSync(DESCRIPTOR_PATH, `${canonicalJson(descriptor)}\n`, { flag: "wx" });

const actor = JSON.parse(readFileSync("docs/database-targets/development-admin-approved.json", "utf8")) as Json;
const planPreimage = {
  action_correlation_uid: randomUUID(), actor_authorization_version: actor.authorization_version,
  actor_user_id: actor.candidate_user_id, actor_user_uid: actor.candidate_user_uid,
  descriptor_sha256: sha256(readFileSync(DESCRIPTOR_PATH)), event_uid: randomUUID(), operation_uid: randomUUID(),
  release_uid: randomUUID(), root_correlation_uid: randomUUID(), schema_version: "agm36-period-boundary-development-release-plan-v3",
  source_code: SOURCE_CODE, target_fingerprint: actor.target_fingerprint,
} as Json;
const plan = { ...planPreimage, plan_sha256: sha256(canonicalJson(planPreimage)) } as Json;
writeFileSync(PLAN_PATH, `${canonicalJson(plan)}\n`, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ schema_version: "agm36-period-boundary-amendment-result-v3", mapping_sha256: approval.mapping_sha256, approval_receipt_sha256: approval.receipt_sha256, descriptor_sha256: plan.descriptor_sha256, plan_sha256: plan.plan_sha256, external_writes: 0, database_writes: 0, result: "materialized" }));
