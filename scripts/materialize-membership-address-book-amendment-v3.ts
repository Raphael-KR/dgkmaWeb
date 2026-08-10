import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";

type Json = Record<string, CanonicalValue>;
const profilePath = "docs/source-contracts/profiles/membership-integrated-address-book-v3.json";
const mappingPath = "docs/source-contracts/mappings/membership-integrated-address-book-v3.json";
const approvalPath = "docs/source-contracts/approvals/membership-integrated-address-book-v3.json";
const descriptorPath = "docs/source-contracts/releases/membership-integrated-address-book-v3.json";
const planPath = "docs/source-contracts/releases/membership-address-book-development-release-plan-v3.json";

const profilePreimage = {
  database_columns: [],
  locator: "spreadsheet:1YBu0MtJ3lt2AB1-DB3-u7NP-TSgehKmGK3Ox4PJCzLw;sheet:876761083",
  observed_at: "2026-08-10T09:25:27Z",
  schema_version: "source-profile-v1",
  source_code: "MEMBERSHIP_INTEGRATED_ADDRESS_BOOK",
  source_revision: "drive-version:2130;modified:2026-08-09T15:49:34.017Z",
  surface: "google_sheet",
  tabs: [{
    header_candidates: [
      { row: 1, values_sha256: "cab20700275c81b7b69c405fe1aa8e8c766c4e7e9395a45ff8b4d54f7fdc213f" },
      { row: 2, values_sha256: "3a3f90d17514c38b1685e9a4fe8a606c51629f982ee9c9d96e71a728adc25703" },
      { row: 3, values_sha256: "6b484cae314dec22e83deed8b4351ce6e9c7ccc80d47f6cd168f67dd4c85747f" },
      { row: 4, values_sha256: "21412c67304040b10e9180808610c93202880075fb7f33668ef502f6ba361c55" },
      { row: 5, values_sha256: "ef5f40621160f4627803f0420ea255d7dd74d698a6439be777777e77e381b78f" },
      { row: 6, values_sha256: "3d4d1dcb2775ae409995514b7e55923f2b5c6fb89780deec493306bd39e5d487" },
      { row: 7, values_sha256: "66489487a30d66a0c7beee69cda142b34a5077ddc9872ab1deead2865ce679bf" },
      { row: 8, values_sha256: "b6371d6b84f68c0b17ef16770abb587b4176e6555bb7234104d9dfecd1bce86a" },
      { row: 9, values_sha256: "7b66ba4e096d1d338662cc4e08f74ea868a3933225167207fea119fc1cb29cce" },
      { row: 10, values_sha256: "670a167166c9ca7f5f4e1fae4f519d6b28700833781d7c0091d697ea74d3efa0" },
    ],
    max_column: 12, max_row: 3459, tab_id: "876761083", title: "통합주소록",
  }],
} as Json;
const profile = { ...profilePreimage, profile_sha256: sha256(canonicalJson(profilePreimage)) } as Json;
writeFileSync(profilePath, `${canonicalJson(profile)}\n`, { flag: "wx" });

const mapping = JSON.parse(readFileSync("docs/source-contracts/mappings/membership-integrated-address-book-v2.json", "utf8")) as Json;
mapping.adapter_code = "membership-integrated-address-book-v3"; mapping.source_profile_sha256 = profile.profile_sha256;
const parsers = mapping.parsers as Json;
parsers.korean_generation_nullable_v1 = { nullable: true, operation: "generation_integer", source_formats: ["integer", "numeric_string", "korean_generation"] } as CanonicalValue;
parsers.date_serial_or_iso_nullable_v1 = { operation: "date_nullable", source_formats: ["google_serial", "iso_date", "dotted_date"], timezone: "Asia/Seoul" } as CanonicalValue;
writeFileSync(mappingPath, `${canonicalJson(mapping)}\n`, { flag: "wx" });

const approvalPreimage = {
  authority_basis: "owner-delegated-safe-development-decision-v1",
  continuation_text_sha256: sha256("그래. 잘 해라. 그리고 왜 진행하지 또 중단했어?\n"),
  decided_at: "2026-08-10T09:25:27Z",
  decision_scope: ["refresh_profile_after_unrelated_tab_deletion", "accept_integer_generation_cells", "accept_dotted_date_cells", "forced_name_only_quarantine", "development_release_and_preview_only", "no_sheet_write", "no_source_apply", "no_production"],
  delegation_text_sha256: sha256("이런건 네가 판단해서 승인해도 될 것 같은데? 나에게 시키는 이유가 있나?\n"),
  discovery_counts: { data_rows: 3458, dotted_admission_dates: 3458, dotted_graduation_dates: 3458, integer_generations: 3458 },
  mapping_sha256: sha256(readFileSync(mappingPath)),
  project_id: "local-fcb170b4427ba4e258ce8af48e487c64",
  schema_version: "source-mapping-delegated-decision-v1",
  source_code: "MEMBERSHIP_INTEGRATED_ADDRESS_BOOK",
  source_profile_sha256: profile.profile_sha256,
  thread_id: "019fe3d1-7669-7911-b30f-2ebc99d3245a",
} as Json;
const approval = { ...approvalPreimage, receipt_sha256: sha256(canonicalJson(approvalPreimage)) } as Json;
writeFileSync(approvalPath, `${canonicalJson(approval)}\n`, { flag: "wx" });

const implementationPaths = ["server/accounting/adapters/admin-readable-source-v2.ts", "server/accounting/adapters/membership-integrated-address-book-v3.ts", "server/accounting/source-contracts.ts"];
const closure = { schema_version: "normalization-implementation-closure-v1", files: implementationPaths.sort().map((path) => ({ path, sha256: sha256(readFileSync(path)) })) } as CanonicalValue;
const descriptor = { adapter_code: "membership-integrated-address-book-v3", adapter_version: "3.0.0", mapping_approval_receipt_sha256: approval.receipt_sha256, mapping_table_sha256: approval.mapping_sha256, normalization_implementation_sha256: sha256(canonicalJson(closure)), normalized_schema_sha256: sha256(readFileSync("docs/source-contracts/schemas/member-identity-row-v2.schema.json")), output_family: "member-identity-row-v2", schema_version: "admin-readable-source-release-descriptor-v3", source_code: "MEMBERSHIP_INTEGRATED_ADDRESS_BOOK", source_profile_file_sha256: sha256(readFileSync(profilePath)), source_profile_sha256: profile.profile_sha256 } as Json;
writeFileSync(descriptorPath, `${canonicalJson(descriptor)}\n`, { flag: "wx" });

const actor = JSON.parse(readFileSync("docs/database-targets/development-admin-approved.json", "utf8")) as Json;
const planPreimage = { action_correlation_uid: randomUUID(), actor_authorization_version: actor.authorization_version, actor_user_id: actor.candidate_user_id, actor_user_uid: actor.candidate_user_uid, descriptor_sha256: sha256(readFileSync(descriptorPath)), event_uid: randomUUID(), operation_uid: randomUUID(), release_uid: randomUUID(), root_correlation_uid: randomUUID(), schema_version: "membership-address-book-development-release-plan-v3", source_code: "MEMBERSHIP_INTEGRATED_ADDRESS_BOOK", target_fingerprint: actor.target_fingerprint } as Json;
const plan = { ...planPreimage, plan_sha256: sha256(canonicalJson(planPreimage)) } as Json;
writeFileSync(planPath, `${canonicalJson(plan)}\n`, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ result: "materialized", profile_sha256: profile.profile_sha256, mapping_sha256: approval.mapping_sha256, receipt_sha256: approval.receipt_sha256, descriptor_sha256: plan.descriptor_sha256, plan_sha256: plan.plan_sha256, external_writes: 0, database_writes: 0 }));
