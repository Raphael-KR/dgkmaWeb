import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";
import { DEFERRED_SOURCE_CODES } from "../server/accounting/adapters/deferred-source-normalization-v1";

const outDir = "docs/source-contracts/releases";
const schemaPath = "docs/source-contracts/schemas/deferred-source-normalized-row-v1.schema.json";
const implementationPath = "server/accounting/adapters/deferred-source-normalization-v1.ts";
const slug = (code: string) => code.toLowerCase().replaceAll("_", "-");
const read = (path: string) => readFileSync(path);
const json = (path: string) => JSON.parse(read(path).toString("utf8")) as Record<string, CanonicalValue>;
mkdirSync(outDir, { recursive: true });

const normalizedSchemaSha256 = sha256(read(schemaPath));
const normalizationImplementationSha256 = sha256(read(implementationPath));
const descriptors = [];
for (const sourceCode of [...DEFERRED_SOURCE_CODES].sort()) {
  const name = slug(sourceCode);
  const profilePath = `docs/source-contracts/profiles/${name}.json`;
  const mappingPath = `docs/source-contracts/mappings/${name}-v1.json`;
  const approvalPath = `docs/source-contracts/approvals/${name}-v1.json`;
  const profile = json(profilePath);
  const mapping = json(mappingPath);
  const approval = json(approvalPath);
  if (profile.source_code !== sourceCode || mapping.source_code !== sourceCode || approval.source_code !== sourceCode) throw new Error("source_release_identity_mismatch");
  if (mapping.source_profile_sha256 !== profile.profile_sha256 || approval.source_profile_sha256 !== profile.profile_sha256) throw new Error("source_release_profile_binding_mismatch");
  if (approval.mapping_sha256 !== sha256(read(mappingPath))) throw new Error("source_release_mapping_binding_mismatch");
  const descriptor = {
    adapter_code: mapping.adapter_code,
    adapter_version: "1.0.0",
    mapping_approval_receipt_sha256: approval.receipt_sha256,
    mapping_table_sha256: approval.mapping_sha256,
    normalization_implementation_sha256: normalizationImplementationSha256,
    normalized_schema_sha256: normalizedSchemaSha256,
    output_family: mapping.output_family,
    schema_version: "deferred-source-release-descriptor-v1",
    source_code: sourceCode,
    source_profile_file_sha256: sha256(read(profilePath)),
    source_profile_sha256: profile.profile_sha256,
  } as Record<string, CanonicalValue>;
  const bytes = `${canonicalJson(descriptor)}\n`;
  writeFileSync(`${outDir}/${name}-v1.json`, bytes);
  descriptors.push({ source_code: sourceCode, descriptor_sha256: sha256(bytes) });
}
console.log(JSON.stringify({ result: "materialized", source_count: descriptors.length, normalized_schema_sha256: normalizedSchemaSha256, normalization_implementation_sha256: normalizationImplementationSha256, descriptors }));
