import { readFileSync, writeFileSync } from "node:fs";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";

type Json = Record<string, CanonicalValue>;
const contracts = [
  { name: "membership-integrated-address-book", schema: "docs/source-contracts/schemas/member-identity-row-v2.schema.json", implementation: ["server/accounting/adapters/admin-readable-source-v2.ts", "server/accounting/adapters/membership-integrated-address-book-v2.ts", "server/accounting/source-contracts.ts"] },
  { name: "notion-organization-role-history", schema: "docs/source-contracts/schemas/role-row-v3.schema.json", implementation: ["server/accounting/adapters/admin-readable-source-v2.ts", "server/accounting/adapters/notion-organization-role-history-v2.ts", "server/accounting/source-contracts.ts"] },
  ...["agm36-period-boundary", "bank-ibk-2026", "bank-toss-2026", "group-foreign-faculty-2025", "ledger-dues-policy-2024-2025", "ledger-final-2022-2025", "legacy-payments", "notion-dues-regulation-draft"].map((name) => ({ name, schema: "docs/source-contracts/schemas/deferred-source-normalized-row-v2.schema.json", implementation: ["server/accounting/adapters/admin-readable-source-v2.ts", "server/accounting/adapters/deferred-source-normalization-v2.ts", "server/accounting/source-contracts.ts"] })),
];

function implementationDigest(paths: string[]): string {
  const closure = { schema_version: "normalization-implementation-closure-v1", files: [...paths].sort().map((path) => ({ path, sha256: sha256(readFileSync(path)) })) };
  return sha256(canonicalJson(closure));
}

const descriptors: Array<{ source_code: string; descriptor_sha256: string }> = [];
for (const contract of contracts) {
  const profilePath = `docs/source-contracts/profiles/${contract.name}.json`;
  const mappingPath = `docs/source-contracts/mappings/${contract.name}-v2.json`;
  const approvalPath = `docs/source-contracts/approvals/${contract.name}-v2.json`;
  const profile = JSON.parse(readFileSync(profilePath, "utf8")) as Json;
  const mappingBytes = readFileSync(mappingPath);
  const mapping = JSON.parse(mappingBytes.toString("utf8")) as Json;
  const approval = JSON.parse(readFileSync(approvalPath, "utf8")) as Json;
  if (profile.source_code !== mapping.source_code || mapping.source_code !== approval.source_code) throw new Error(`release_identity_mismatch:${contract.name}`);
  if (profile.profile_sha256 !== mapping.source_profile_sha256 || profile.profile_sha256 !== approval.source_profile_sha256) throw new Error(`release_profile_binding_mismatch:${contract.name}`);
  if (approval.mapping_sha256 !== sha256(mappingBytes)) throw new Error(`release_mapping_binding_mismatch:${contract.name}`);
  const descriptor = {
    adapter_code: mapping.adapter_code,
    adapter_version: "2.0.0",
    mapping_approval_receipt_sha256: approval.receipt_sha256,
    mapping_table_sha256: approval.mapping_sha256,
    normalization_implementation_sha256: implementationDigest(contract.implementation),
    normalized_schema_sha256: sha256(readFileSync(contract.schema)),
    output_family: mapping.output_family,
    schema_version: "admin-readable-source-release-descriptor-v2",
    source_code: mapping.source_code,
    source_profile_file_sha256: sha256(readFileSync(profilePath)),
    source_profile_sha256: profile.profile_sha256,
  } as Json;
  const bytes = `${canonicalJson(descriptor)}\n`;
  writeFileSync(`docs/source-contracts/releases/${contract.name}-v2.json`, bytes);
  descriptors.push({ source_code: String(mapping.source_code), descriptor_sha256: sha256(bytes) });
}
console.log(JSON.stringify({ result: "materialized", source_count: descriptors.length, descriptors }));
