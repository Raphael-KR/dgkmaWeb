import { readFileSync } from "node:fs";
import { canonicalJson, readArtifactDescriptors, readManifest, sha256 } from "./schema-ledger";

function fail(code: string): never {
  throw new Error(code);
}

function utf8Prefix(value: string, byteLimit: number): string {
  let result = "";
  for (const character of value) {
    if (Buffer.byteLength(result + character, "utf8") > byteLimit) break;
    result += character;
  }
  return result;
}

function objectName(table: string, body: string, suffix: string): string {
  const full = `${table}__${body}__${suffix}`;
  return Buffer.byteLength(full, "utf8") <= 63 ? full : `${utf8Prefix(full, 52)}_${sha256(full).slice(0, 10)}`;
}

function canonicalObjectName(full: string): string {
  return Buffer.byteLength(full, "utf8") <= 63 ? full : `${utf8Prefix(full, 52)}_${sha256(full).slice(0, 10)}`;
}

function main(): void {
  const manifest = readManifest();
  const value = manifest.value as Record<string, any>;
  const planLines = readFileSync("docs/plans/database-architecture-audit.md", "utf8").split("\n");
  if (value.architecture_plan_sha256 !== sha256(readFileSync("docs/plans/database-architecture-audit.md"))) fail("manifest_plan_digest_mismatch");
  const lineDigests = value.manifest_contract?.source_contract_line_digests;
  if (!Array.isArray(lineDigests) || lineDigests.length !== 514) fail("manifest_source_line_closure_mismatch");
  for (const entry of lineDigests) {
    if (entry.line_no < 62 || entry.line_no > 575 || entry.sha256 !== sha256(planLines[entry.line_no - 1])) fail("manifest_source_line_digest_mismatch");
  }
  if (!Array.isArray(value.tables) || value.tables.length !== 55 || !Array.isArray(value.existing_table_alterations) || value.existing_table_alterations.length !== 13) fail("manifest_table_closure_mismatch");
  const tableNames = [...value.existing_table_alterations.map((entry: any) => entry.table), ...value.tables.map((entry: any) => entry.table)];
  if (new Set(tableNames).size !== 68) fail("manifest_table_identity_duplicate");
  for (const table of value.tables) {
    if (!Array.isArray(table.columns) || table.columns.length === 0) fail("manifest_table_columns_missing");
    const names = table.columns.map((column: any) => column.name);
    if (new Set(names).size !== names.length) fail("manifest_column_duplicate");
    for (const column of table.columns) {
      if (!/^[a-z][a-z0-9_]*$/.test(column.name) || typeof column.type !== "string" || column.type.length === 0 || typeof column.nullable !== "boolean") fail("manifest_column_not_physical");
    }
    const source = planLines[table.source_line - 1];
    if (table.contract_sha256 !== sha256(source)) fail("manifest_table_contract_digest_mismatch");
  }
  if (!Array.isArray(value.logical_source_uuid_registry) || value.logical_source_uuid_registry.length !== 10 || new Set(value.logical_source_uuid_registry.map((entry: any) => entry.source_uid)).size !== 10 || value.logical_source_uuid_registry.some((entry: any) => entry.default_sql !== null || entry.uniqueness !== "global")) fail("manifest_logical_source_uuid_closure_mismatch");
  const sourceReleases = value.source_release_contract_registry;
  if (!Array.isArray(sourceReleases) || sourceReleases.length !== 2 || new Set(sourceReleases.map((entry: any) => entry.source_code)).size !== 2) fail("manifest_source_release_contract_closure_mismatch");
  for (const release of sourceReleases) {
    const base = release.adapter_code === "membership-integrated-address-book-v1"
      ? { source: "MEMBERSHIP_INTEGRATED_ADDRESS_BOOK", family: "member-identity-row-v1", schema: "docs/source-contracts/schemas/membership-integrated-address-book-v1.schema.json", module: "server/accounting/adapters/membership-integrated-address-book-v1.ts", mapping: "docs/source-contracts/mappings/membership-integrated-address-book-v1.json", approval: "docs/source-contracts/approvals/membership-integrated-address-book-v1.json", profile: "docs/source-contracts/profiles/membership-integrated-address-book.json" }
      : release.adapter_code === "notion-organization-role-history-v1"
        ? { source: "NOTION_ORGANIZATION_ROLE_HISTORY", family: "role-row-v2", schema: "docs/source-contracts/schemas/notion-organization-role-history-v1.schema.json", module: "server/accounting/adapters/notion-organization-role-history-v1.ts", mapping: "docs/source-contracts/mappings/notion-organization-role-history-v1.json", approval: "docs/source-contracts/approvals/notion-organization-role-history-v1.json", profile: "docs/source-contracts/profiles/notion-organization-role-history.json" }
        : fail("manifest_source_release_adapter_unknown");
    const profile = JSON.parse(readFileSync(base.profile, "utf8"));
    const approval = JSON.parse(readFileSync(base.approval, "utf8"));
    if (release.source_code !== base.source || release.output_family !== base.family || release.adapter_version !== "1.0.0" || release.released_at !== "2026-08-10T00:00:00Z" || release.normalized_schema_sha256 !== sha256(readFileSync(base.schema)) || release.normalization_implementation_sha256 !== sha256(readFileSync(base.module)) || release.mapping_table_sha256 !== sha256(readFileSync(base.mapping)) || release.mapping_approval_receipt_sha256 !== sha256(readFileSync(base.approval)) || release.source_profile_file_sha256 !== sha256(readFileSync(base.profile)) || release.source_profile_sha256 !== profile.profile_sha256 || release.mapping_approval_self_sha256 !== approval.receipt_sha256) fail("manifest_source_release_digest_mismatch");
  }
  if (!Array.isArray(value.actor_action_registry) || value.actor_action_registry.length !== 59) fail("manifest_actor_action_closure_mismatch");
  if (!Array.isArray(value.lock_class_registry) || value.lock_class_registry.length !== 62 || value.lock_class_registry[0].rank !== 10 || value.lock_class_registry.at(-1).rank !== 490) fail("manifest_lock_class_closure_mismatch");
  if (!Array.isArray(value.primary_keys) || value.primary_keys.length !== 55) fail("manifest_primary_key_closure_mismatch");
  if (!Array.isArray(value.unique_constraints) || value.unique_constraints.length < 100) fail("manifest_unique_constraint_closure_mismatch");
  const tableColumns = new Map(value.tables.map((table: any) => [table.table, new Set(table.columns.map((column: any) => column.name))]));
  const uniqueIdentities = new Set<string>();
  for (const constraint of value.unique_constraints) {
    const columns = tableColumns.get(constraint.table) as Set<string> | undefined;
    if (!columns || !constraint.columns.every((column: string) => columns.has(column))) fail("manifest_unique_constraint_column_mismatch");
    if (constraint.name !== objectName(constraint.table, constraint.columns.join("_"), "key")) fail("manifest_unique_constraint_name_mismatch");
    const identity = `${constraint.table}:${constraint.columns.join(",")}:${constraint.predicate_sql ?? ""}`;
    if (uniqueIdentities.has(identity)) fail("manifest_unique_constraint_duplicate");
    uniqueIdentities.add(identity);
  }
  for (const table of value.tables) {
    const chain = table.transition_rules.find((transition: any) => transition.action_source === "insert_only_version_chain");
    if (!chain) continue;
    if (!uniqueIdentities.has(`${table.table}:${[...chain.scope_columns,"version"].join(",")}:`) || !uniqueIdentities.has(`${table.table}:supersedes_id:supersedes_id IS NOT NULL`)) fail("manifest_vchain_unique_expansion_mismatch");
  }
  if (!Array.isArray(value.foreign_keys) || value.foreign_keys.length < 170) fail("manifest_foreign_key_closure_mismatch");
  if (!Array.isArray(value.indexes) || value.indexes.length < value.foreign_keys.length) fail("manifest_index_closure_mismatch");
  if (!Array.isArray(value.checks) || value.checks.length < 200) fail("manifest_check_closure_mismatch");
  if (!Array.isArray(value.ranges) || value.ranges.some((entry: any) => entry.bounds !== "[)" || typeof entry.check_sql !== "string")) fail("manifest_range_closure_mismatch");
  for (const object of [...value.primary_keys, ...value.foreign_keys, ...value.indexes, ...value.checks]) {
    if (typeof object.name !== "string" || Buffer.byteLength(object.name, "utf8") > 63) fail("manifest_object_name_invalid");
  }
  for (const primaryKey of value.primary_keys) if (primaryKey.name !== canonicalObjectName(`${primaryKey.table}_pkey`)) fail("manifest_primary_key_name_mismatch");
  for (const foreignKey of value.foreign_keys) if (foreignKey.columns.length !== 1 || foreignKey.name !== canonicalObjectName(`${foreignKey.table}_${foreignKey.columns[0]}_fkey`)) fail("manifest_foreign_key_name_mismatch");
  for (const index of value.indexes) if (index.name !== objectName(index.table, index.columns.join("_"), "idx")) fail("manifest_index_name_mismatch");
  for (const check of value.checks) if (typeof check.rule !== "string" || check.name !== objectName(check.table, check.rule, "check")) fail("manifest_check_name_mismatch");
  const indexKeys = new Set(value.indexes.map((entry: any) => `${entry.table}:${entry.columns.join(",")}`));
  for (const fk of value.foreign_keys) {
    if (!indexKeys.has(`${fk.table}:${fk.columns.join(",")}`)) fail("manifest_fk_index_missing");
  }
  if (!Array.isArray(value.account_delete_user_fk_registry) || value.account_delete_user_fk_registry.length < 90) fail("manifest_user_fk_registry_not_expanded");
  if (new Set(value.account_delete_user_fk_registry.map((entry: any) => `${entry.table}.${entry.column}`)).size !== value.account_delete_user_fk_registry.length) fail("manifest_user_fk_registry_duplicate");
  if (value.account_delete_user_fk_registry.some((entry: any) => ["session","pending_registrations","kakao_identity_terminations"].includes(entry.table))) fail("manifest_user_fk_registry_contains_non_fk");
  const userFkProjection = value.foreign_keys
    .filter((entry: any) => entry.referenced_table === "users" && JSON.stringify(entry.referenced_columns) === '["id"]')
    .map((entry: any) => `${entry.table}.${entry.columns[0]}.${entry.on_delete}.${entry.on_update}`)
    .sort();
  const registryProjection = value.account_delete_user_fk_registry
    .map((entry: any) => `${entry.table}.${entry.column}.${entry.on_delete}.${entry.on_update}`)
    .sort();
  if (JSON.stringify(userFkProjection) !== JSON.stringify(registryProjection)) fail("manifest_user_fk_registry_catalog_projection_mismatch");
  if (!Array.isArray(value.account_delete_non_fk_registry) || value.account_delete_non_fk_registry.length !== 3) fail("manifest_non_fk_registry_closure_mismatch");
  const nonFkTables = value.account_delete_non_fk_registry.map((entry: any) => entry.table).sort();
  if (JSON.stringify(nonFkTables) !== JSON.stringify(["kakao_identity_terminations","pending_registrations","session"])) fail("manifest_non_fk_registry_identity_mismatch");
  const receipts = value.tables.find((entry: any) => entry.table === "business_operation_receipts");
  const expectedReceiptColumns = [
    ["action","text",false],["actor_name_snapshot","text",false],["actor_scope","text",false],
    ["actor_target_user_id","integer",true],["actor_target_user_id_snapshot","integer",true],
    ["actor_uid_snapshot","uuid",false],["actor_user_id","integer",true],["actor_user_id_snapshot","integer",false],
    ["authorization_version","char(64)",false],["canonical_payload","jsonb",false],["entity_type","text",false],
    ["id","bigint",false],["operation_uid","uuid",false],["payload_sha256","char(64)",false],
    ["recorded_at","timestamptz",false],["result_entity_keys","jsonb",false],["root_correlation_uid","uuid",false],
    ["target_fingerprint","char(64)",false],
  ];
  const receiptColumns = receipts?.columns.map((column: any) => [column.name,column.type,column.nullable]);
  if (JSON.stringify(receiptColumns) !== JSON.stringify(expectedReceiptColumns)) fail("manifest_receipt_column_contract_mismatch");
  const payload = receipts?.columns.find((column: any) => column.name === "canonical_payload");
  if (!payload || payload.type !== "jsonb" || payload.nullable) fail("manifest_receipt_payload_contract_mismatch");
  const receiptPayloadCheck = value.checks.find((entry: any) => entry.table === "business_operation_receipts" && entry.name === "business_operation_receipts__canonical_payload__check");
  if (receiptPayloadCheck?.expression_sql !== "jsonb_typeof(canonical_payload) = 'object' AND canonical_payload->>'schema_version' = 'business-operation-payload-v2' AND payload_sha256 ~ '^[0-9a-f]{64}$' AND jsonb_typeof(canonical_payload->'expected_results') = 'array' AND jsonb_typeof(canonical_payload->'reservation_slots') = 'array'") fail("manifest_receipt_check_contract_mismatch");
  if (!Array.isArray(value.digest_test_vectors) || value.digest_test_vectors.length !== 7) fail("manifest_digest_vector_count_mismatch");
  const digestNames = new Set<string>();
  for (const vector of value.digest_test_vectors) {
    if (digestNames.has(vector.digest_name)) fail("manifest_digest_vector_duplicate");
    digestNames.add(vector.digest_name);
    const positive = JSON.parse(vector.canonical_preimage_json);
    if (canonicalJson(positive) !== vector.canonical_preimage_json || sha256(vector.canonical_preimage_json) !== vector.canonical_preimage_sha256) fail("manifest_digest_positive_vector_mismatch");
    const negative = JSON.parse(vector.negative_preimage_json);
    if (canonicalJson(negative) === vector.negative_preimage_json || negative.digest_version !== null || JSON.stringify(vector.negative_reason_codes) !== '["noncanonical_key_order","null_contract_violation"]') fail("manifest_digest_negative_vector_mismatch");
  }
  const sequence15Rules = value.sequence_15_rule_registry?.rules;
  if (!Array.isArray(sequence15Rules) || sequence15Rules.length !== 25 || new Set(sequence15Rules.map((rule: any) => rule.rule_code)).size !== 25) fail("manifest_sequence_15_rule_closure_mismatch");
  if (sequence15Rules.filter((rule: any) => rule.exception_class === "legacy_not_valid").length !== 4 || sequence15Rules.some((rule: any) => !["pre_anchor_blocking","legacy_not_valid"].includes(rule.exception_class) || typeof rule.predicate_sql !== "string" || rule.predicate_sql.length === 0)) fail("manifest_sequence_15_rule_class_mismatch");
  const receiptInvariants = value.round_38_closure?.receipt_catalog_invariants;
  if (receiptInvariants?.payload_hash_equality !== "payload_sha256 = sha256(RFC8785(canonical_payload))" || receiptInvariants?.result_equality !== "RFC8785(canonical_payload.expected_results) = RFC8785(result_entity_keys) = RFC8785(ordered business_operation_entities)" || receiptInvariants?.reservation_slot_fields?.length !== 7 || receiptInvariants?.reservation_slot_sort?.length !== 5) fail("manifest_receipt_catalog_invariants_mismatch");
  if (value.round_38_closure?.receipt_payload?.schema_version !== "business-operation-payload-v2" || value.round_38_closure?.nullable_correction_code_columns?.length !== 2 || value.round_38_closure?.receipt_refund_input_pair?.fields?.length !== 2) fail("manifest_round_38_closure_mismatch");
  if (value.kakao_identity_lock?.rank !== 15 || value.kakao_identity_lock?.routes?.length !== 8) fail("manifest_kakao_identity_lock_mismatch");
  const businessReasonRegistry=value.business_reason_registry;
  if(!Array.isArray(businessReasonRegistry)||businessReasonRegistry.length!==8||businessReasonRegistry.reduce((count:number,entry:any)=>count+entry.tuples.length,0)!==48)fail("manifest_business_reason_registry_closure_mismatch");
  for(const entry of businessReasonRegistry){const check=value.checks.find((candidate:any)=>candidate.table===entry.table&&candidate.rule==="reason_code");if(entry.column!=="reason_code"||entry.nullable!==false||!Array.isArray(entry.reason_codes)||new Set(entry.reason_codes).size!==entry.reason_codes.length||check?.validation_state!=="validated_at_sequence_110")fail("manifest_business_reason_registry_projection_mismatch");}
  const transitionEnforcement=value.business_reason_transition_enforcement;
  if(transitionEnforcement?.function!=="public.dgkma_validate_business_reason_transition_v1()"||transitionEnforcement?.rejection_sqlstate!=="23514"||JSON.stringify(transitionEnforcement?.operations)!=='["INSERT","UPDATE"]'||JSON.stringify(transitionEnforcement?.tables)!==JSON.stringify(businessReasonRegistry.map((entry:any)=>entry.table).sort())||!Array.isArray(transitionEnforcement?.triggers)||transitionEnforcement.triggers.length!==8||transitionEnforcement.triggers.some((entry:any)=>typeof entry.table!=="string"||typeof entry.name!=="string"||Buffer.byteLength(entry.name,"utf8")>63))fail("manifest_business_reason_transition_enforcement_mismatch");
  const descriptors = readArtifactDescriptors();
  if (descriptors.some((entry) => entry.materialization_state !== "materialized" || entry.artifact_sha256 === null)) fail("manifest_artifact_not_materialized");
  if (descriptors.filter((entry) => entry.sequence_no === 65).some((entry) => entry.required_for_startup || !entry.required_for_production)) fail("manifest_sequence_65_route_mismatch");
  const sequence70 = descriptors.filter((entry) => entry.sequence_no === 70);const sequence80=descriptors.filter((entry)=>entry.sequence_no===80);const sequence90=descriptors.filter((entry)=>entry.sequence_no===90);const sequence100=descriptors.filter((entry)=>entry.sequence_no===100);const sequence110=descriptors.filter((entry)=>entry.sequence_no===110);const sequence120=descriptors.filter((entry)=>entry.sequence_no===120);
  const parentManifest=readManifest((manifest.value.manifest_lineage as {parent_manifest_path:string}).parent_manifest_path);
  const grandparentManifest=readManifest((parentManifest.value.manifest_lineage as {parent_manifest_path:string}).parent_manifest_path);
  const greatGrandparentManifest=readManifest((grandparentManifest.value.manifest_lineage as {parent_manifest_path:string}).parent_manifest_path);
  const greatGreatGrandparentManifest=readManifest((greatGrandparentManifest.value.manifest_lineage as {parent_manifest_path:string}).parent_manifest_path);
  const greatGreatGreatGrandparentManifest=readManifest((greatGreatGrandparentManifest.value.manifest_lineage as {parent_manifest_path:string}).parent_manifest_path);
  if (sequence70.length !== 1 || !sequence70[0].required_for_startup || !sequence70[0].required_for_production || sequence70[0].manifest_sha256 !== greatGreatGreatGrandparentManifest.sha256) fail("manifest_sequence_70_route_mismatch");
  if(sequence80.length!==1||!sequence80[0].required_for_startup||!sequence80[0].required_for_production||sequence80[0].manifest_sha256!==greatGreatGrandparentManifest.sha256)fail("manifest_sequence_80_route_mismatch");
  if(sequence90.length!==1||!sequence90[0].required_for_startup||!sequence90[0].required_for_production||sequence90[0].manifest_sha256!==greatGrandparentManifest.sha256)fail("manifest_sequence_90_route_mismatch");
  if(sequence100.length!==1||!sequence100[0].required_for_startup||!sequence100[0].required_for_production||sequence100[0].manifest_sha256!==grandparentManifest.sha256)fail("manifest_sequence_100_route_mismatch");
  if(sequence110.length!==1||!sequence110[0].required_for_startup||!sequence110[0].required_for_production||sequence110[0].manifest_sha256!==parentManifest.sha256)fail("manifest_sequence_110_route_mismatch");
  if(sequence120.length!==1||!sequence120[0].required_for_startup||!sequence120[0].required_for_production||sequence120[0].manifest_sha256!==manifest.sha256)fail("manifest_sequence_120_route_mismatch");
  const claimCoordinate = value.unique_constraints.find((entry: any) => entry.table === "economic_event_claims" && JSON.stringify(entry.columns) === '["coordinate_id"]');
  if (claimCoordinate?.predicate_sql !== "version=1" || claimCoordinate?.source !== "sequence_70_materialization_correction") fail("manifest_claim_coordinate_root_mismatch");
  const groupMemberSource=value.unique_constraints.find((entry:any)=>entry.table==="dues_group_members"&&JSON.stringify(entry.columns)==='["group_id","source_row_version_id"]');
  if(groupMemberSource?.predicate_sql!=="version=1"||groupMemberSource?.source!=="sequence_80_materialization_correction")fail("manifest_group_member_source_root_mismatch");
  const legacyCutoverCode=value.unique_constraints.find((entry:any)=>entry.table==="legacy_cutover_states"&&JSON.stringify(entry.columns)==='["cutover_code"]');
  if(legacyCutoverCode?.predicate_sql!=="version=1"||legacyCutoverCode?.source!=="sequence_90_materialization_correction")fail("manifest_legacy_cutover_code_root_mismatch");
  const writeFence=value.legacy_payments_write_fence;
  if(writeFence?.table!=="payments"||writeFence?.cutover_code!=="payments-v1"||JSON.stringify(writeFence?.writable_phases)!=='["legacy"]'||JSON.stringify(writeFence?.rejected_operations)!=='["INSERT","UPDATE","DELETE"]'||writeFence?.trigger!=="legacy_payments_write_fence_v1"||writeFence?.rejection_sqlstate!=="55000")fail("manifest_legacy_payments_write_fence_mismatch");
  console.log(JSON.stringify({
    schema_version: "dgkma-database-manifest-validation-v1",
    manifest_sha256: manifest.sha256,
    tables: 68,
    actor_actions: value.actor_action_registry.length,
    account_delete_user_fks: value.account_delete_user_fk_registry.length,
    account_delete_non_fks: value.account_delete_non_fk_registry.length,
    artifact_descriptors: descriptors.length,
    materialized_artifacts: descriptors.length,
    result: "approved",
  }));
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "manifest_validation_unknown_error";
  console.error(JSON.stringify({ schema_version: "dgkma-database-manifest-validation-v1", error_code: message, result: "rejected" }));
  process.exitCode = 1;
}
