import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";

type Json = Record<string, CanonicalValue>;
const profilePath = "docs/source-contracts/profiles/notion-organization-role-history.json";
const mappingPath = "docs/source-contracts/mappings/notion-organization-role-history-v3.json";
const approvalPath = "docs/source-contracts/approvals/notion-organization-role-history-v3.json";
const schemaPath = "docs/source-contracts/schemas/role-row-v4.schema.json";
const descriptorPath = "docs/source-contracts/releases/notion-organization-role-history-v3.json";
const planPath = "docs/source-contracts/releases/notion-role-history-development-release-plan-v3.json";
const profile = JSON.parse(readFileSync(profilePath, "utf8")) as Json;

const schema = JSON.parse(readFileSync("docs/source-contracts/schemas/role-row-v3.schema.json", "utf8")) as Json;
schema.$id = "dgkma://source-contract/role-row-v4"; schema.title = "role-row-v4";
const properties = schema.properties as Json;
properties.appointment_basis = { anyOf: [{ enum: ["election", "appointment", "concurrent", "historical", "faculty"] }, { type: "null" }] } as CanonicalValue;
properties.effective_from = { anyOf: [{ minLength: 1, type: "string" }, { type: "null" }] } as CanonicalValue;
writeFileSync(schemaPath, `${canonicalJson(schema)}\n`, { flag: "wx" });

const mapping = JSON.parse(readFileSync("docs/source-contracts/mappings/notion-organization-role-history-v2.json", "utf8")) as Json;
mapping.adapter_code = "notion-organization-role-history-v3"; mapping.output_family = "role-row-v4";
const columns = mapping.columns as Json[];
for (const column of columns) {
  if (column.target_field === "effective_from") { column.parser_code = "datetime_nullable_v1"; column.required = false; }
  if (column.target_field === "appointment_basis") { column.parser_code = "appointment_basis_nullable_v2"; column.required = false; }
}
const parsers = mapping.parsers as Json;
parsers.appointment_basis_nullable_v2 = { allowed: ["election", "appointment", "concurrent", "historical", "faculty"], context_columns: ["조직구분"], nullable: true, operation: "korean_appointment_basis", unknown: "mapping_review_required" } as CanonicalValue;
(parsers.position_code_closed_v1 as Json).exact_overrides = { "부산지부 부회장": "busan_branch_vice_president", "부산지부 재무": "busan_branch_finance", "부산지부 총무": "busan_branch_general_affairs", "부산지부장": "busan_branch_president" } as CanonicalValue;
writeFileSync(mappingPath, `${canonicalJson(mapping)}\n`, { flag: "wx" });

const delegationText = "이런건 네가 판단해서 승인해도 될 것 같은데? 나에게 시키는 이유가 있나?\n";
const continuationText = "그래. 잘 해라. 그리고 왜 진행하지 또 중단했어?\n";
const approvalPreimage = { authority_basis: "owner-delegated-safe-development-decision-v1", decided_at: "2026-08-10T08:58:21Z", decision_scope: ["nullable_unknown_evidence", "forced_name_only_quarantine", "existing_busan_position_codes", "development_release_and_preview_only", "no_notion_write", "no_source_apply", "no_production"], delegation_text_sha256: sha256(delegationText), continuation_text_sha256: sha256(continuationText), mapping_sha256: sha256(readFileSync(mappingPath)), project_id: "local-fcb170b4427ba4e258ce8af48e487c64", schema_version: "source-mapping-delegated-decision-v1", source_code: "NOTION_ORGANIZATION_ROLE_HISTORY", source_profile_sha256: profile.profile_sha256, thread_id: "019fe3d1-7669-7911-b30f-2ebc99d3245a" } as Json;
const approval = { ...approvalPreimage, receipt_sha256: sha256(canonicalJson(approvalPreimage)) } as Json;
writeFileSync(approvalPath, `${canonicalJson(approval)}\n`, { flag: "wx" });

const implementationPaths = ["server/accounting/adapters/admin-readable-source-v2.ts", "server/accounting/adapters/notion-organization-role-history-v3.ts", "server/accounting/source-contracts.ts"];
const implementationClosure = { schema_version: "normalization-implementation-closure-v1", files: implementationPaths.sort().map((path) => ({ path, sha256: sha256(readFileSync(path)) })) } as CanonicalValue;
const descriptor = { adapter_code: "notion-organization-role-history-v3", adapter_version: "3.0.0", mapping_approval_receipt_sha256: approval.receipt_sha256, mapping_table_sha256: approval.mapping_sha256, normalization_implementation_sha256: sha256(canonicalJson(implementationClosure)), normalized_schema_sha256: sha256(readFileSync(schemaPath)), output_family: "role-row-v4", schema_version: "admin-readable-source-release-descriptor-v3", source_code: "NOTION_ORGANIZATION_ROLE_HISTORY", source_profile_file_sha256: sha256(readFileSync(profilePath)), source_profile_sha256: profile.profile_sha256 } as Json;
writeFileSync(descriptorPath, `${canonicalJson(descriptor)}\n`, { flag: "wx" });

const actor = JSON.parse(readFileSync("docs/database-targets/development-admin-approved.json", "utf8")) as Json;
const planPreimage = { action_correlation_uid: randomUUID(), actor_authorization_version: actor.authorization_version, actor_user_id: actor.candidate_user_id, actor_user_uid: actor.candidate_user_uid, descriptor_sha256: sha256(readFileSync(descriptorPath)), event_uid: randomUUID(), operation_uid: randomUUID(), release_uid: randomUUID(), root_correlation_uid: randomUUID(), schema_version: "notion-role-history-development-release-plan-v3", source_code: "NOTION_ORGANIZATION_ROLE_HISTORY", target_fingerprint: actor.target_fingerprint } as Json;
const plan = { ...planPreimage, plan_sha256: sha256(canonicalJson(planPreimage)) } as Json;
writeFileSync(planPath, `${canonicalJson(plan)}\n`, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ result: "materialized", mapping_sha256: approval.mapping_sha256, receipt_sha256: approval.receipt_sha256, descriptor_sha256: plan.descriptor_sha256, plan_sha256: plan.plan_sha256, external_writes: 0, database_writes: 0 }));
