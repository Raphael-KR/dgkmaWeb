import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type CanonicalValue = null | boolean | number | string | CanonicalValue[] | { [key: string]: CanonicalValue };

export const TODO_14_MANIFEST_SHA256 = "5c02b1f62fdd172ed24ef20d046631793b85dcfcd06e13d6d22ac2d8d85bc88c";

export const TODO_14_LIVE_SOURCES = Object.freeze({
  MEMBERSHIP_INTEGRATED_ADDRESS_BOOK: Object.freeze({
    sourceUid: "5a47bd83-4d99-59bf-8525-7d0f4667ec75",
    sourceKind: "google_sheet",
    authorityRole: "member_identity",
    authorityRank: 0,
    adapterCode: "membership-integrated-address-book-v1",
    outputFamily: "member-identity-row-v1",
  }),
  NOTION_ORGANIZATION_ROLE_HISTORY: Object.freeze({
    sourceUid: "75dd7485-9c2b-51a9-845f-e7baa6ba8dc1",
    sourceKind: "notion",
    authorityRole: "role_history",
    authorityRank: 0,
    adapterCode: "notion-organization-role-history-v1",
    outputFamily: "role-row-v2",
  }),
});

const PROFILE_KEYS = [
  "database_columns", "locator", "observed_at", "profile_sha256", "schema_version", "source_code",
  "source_revision", "surface", "tabs",
].sort();
const MAPPING_KEYS = [
  "adapter_code", "columns", "constants", "locator", "output_family", "parsers", "record_selectors",
  "schema_version", "source_code", "source_profile_sha256", "surface",
].sort();
const APPROVAL_KEYS = [
  "approval_text_sha256", "approved_at", "host_id_or_null", "mapping_sha256", "platform_message_created_at",
  "platform_message_id", "platform_message_timestamp_source", "platform_thread_id", "project_id", "provider",
  "read_response_sha256", "receipt_sha256", "schema_version", "source_code", "source_profile_sha256",
].sort();

export function canonicalJson(value: CanonicalValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fail(code: string): never {
  throw new Error(code);
}

function objectValue(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: string[], code: string): void {
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function selfHash(value: Record<string, unknown>, field: string): string {
  const preimage = { ...value };
  delete preimage[field];
  return sha256(canonicalJson(preimage as CanonicalValue));
}

function parseCanonicalFile(filePath: string): { bytes: Buffer; value: Record<string, unknown> } {
  const bytes = readFileSync(filePath);
  const value = objectValue(JSON.parse(bytes.toString("utf8")), "source_contract_object_required");
  if (`${canonicalJson(value as CanonicalValue)}\n` !== bytes.toString("utf8")) fail("source_contract_not_canonical_json_lf");
  return { bytes, value };
}

export function validateSourceContract(
  profilePath: string,
  mappingPath: string,
  approvalPath: string,
): { sourceCode: string; adapterCode: string; outputFamily: string; profileSha256: string; mappingSha256: string; approvalReceiptSha256: string } {
  const profileFile = parseCanonicalFile(profilePath);
  const mappingFile = parseCanonicalFile(mappingPath);
  const approvalFile = parseCanonicalFile(approvalPath);
  const profile = profileFile.value;
  const mapping = mappingFile.value;
  const approval = approvalFile.value;
  exactKeys(profile, PROFILE_KEYS, "source_profile_key_mismatch");
  exactKeys(mapping, MAPPING_KEYS, "source_mapping_key_mismatch");
  exactKeys(approval, APPROVAL_KEYS, "source_approval_key_mismatch");
  if (profile.schema_version !== "source-profile-v1" || profile.profile_sha256 !== selfHash(profile, "profile_sha256")) {
    fail("source_profile_self_hash_mismatch");
  }
  if (mapping.schema_version !== "source-input-map-v1" || mapping.source_code !== profile.source_code || mapping.locator !== profile.locator || mapping.surface !== profile.surface || mapping.source_profile_sha256 !== profile.profile_sha256) {
    fail("source_mapping_profile_binding_mismatch");
  }
  const source = TODO_14_LIVE_SOURCES[String(profile.source_code) as keyof typeof TODO_14_LIVE_SOURCES];
  if (!source || mapping.adapter_code !== source.adapterCode || mapping.output_family !== source.outputFamily) {
    fail("source_mapping_live_source_mismatch");
  }
  const columns = Array.isArray(mapping.columns) ? mapping.columns.map((entry) => objectValue(entry, "source_mapping_column_invalid")) : fail("source_mapping_columns_invalid");
  const targets = columns.map((column) => String(column.target_field));
  if (targets.length === 0 || new Set(targets).size !== targets.length || targets.some((target, index) => index > 0 && target.localeCompare(targets[index - 1]) < 0)) {
    fail("source_mapping_target_coverage_mismatch");
  }
  const parsers = objectValue(mapping.parsers, "source_mapping_parsers_invalid");
  if (columns.some((column) => typeof column.parser_code !== "string" || !Object.hasOwn(parsers, column.parser_code))) {
    fail("source_mapping_parser_missing");
  }
  if (approval.schema_version !== "source-mapping-approval-v1" || approval.provider !== "codex-app" || approval.source_code !== profile.source_code || approval.source_profile_sha256 !== profile.profile_sha256 || approval.mapping_sha256 !== sha256(mappingFile.bytes) || approval.receipt_sha256 !== selfHash(approval, "receipt_sha256")) {
    fail("source_mapping_approval_binding_mismatch");
  }
  if (approval.platform_message_id !== "item-156" || approval.platform_message_created_at !== "2026-08-09T16:44:37Z" || approval.approved_at !== approval.platform_message_created_at || approval.platform_message_timestamp_source !== "parent_turn_started_at_projection_v1") {
    fail("source_mapping_approval_timestamp_mismatch");
  }
  return {
    sourceCode: String(profile.source_code),
    adapterCode: String(mapping.adapter_code),
    outputFamily: String(mapping.output_family),
    profileSha256: String(profile.profile_sha256),
    mappingSha256: sha256(mappingFile.bytes),
    approvalReceiptSha256: String(approval.receipt_sha256),
  };
}

export type CoordinateVersion = Readonly<{
  sourceCode: string;
  coordinateKey: string;
  version: number;
  contentDigest: string;
  supersedesVersion: number | null;
  normalizedPayload: CanonicalValue;
}>;

export class ImmutableCoordinateVersionStore {
  readonly #versions = new Map<string, CoordinateVersion[]>();

  apply(sourceCode: string, coordinateKey: string, normalizedPayload: CanonicalValue): { result: "created" | "verified_noop" | "superseded"; row: CoordinateVersion } {
    if (!TODO_14_LIVE_SOURCES[sourceCode as keyof typeof TODO_14_LIVE_SOURCES]) fail("coordinate_source_not_live");
    const identity = `${sourceCode}\u0000${coordinateKey.normalize("NFC").trim()}`;
    const versions = this.#versions.get(identity) ?? [];
    const contentDigest = sha256(canonicalJson(normalizedPayload));
    const current = versions.at(-1);
    if (current?.contentDigest === contentDigest) return { result: "verified_noop", row: current };
    const row = Object.freeze({
      sourceCode,
      coordinateKey: coordinateKey.normalize("NFC").trim(),
      version: versions.length + 1,
      contentDigest,
      supersedesVersion: current?.version ?? null,
      normalizedPayload,
    });
    versions.push(row);
    this.#versions.set(identity, versions);
    return { result: current ? "superseded" : "created", row };
  }

  history(sourceCode: string, coordinateKey: string): readonly CoordinateVersion[] {
    return this.#versions.get(`${sourceCode}\u0000${coordinateKey.normalize("NFC").trim()}`) ?? [];
  }
}
