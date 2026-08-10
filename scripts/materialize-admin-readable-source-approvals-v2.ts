import { readFileSync, writeFileSync } from "node:fs";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";

type Json = Record<string, CanonicalValue>;
const sources = [
  "membership-integrated-address-book", "notion-organization-role-history", "agm36-period-boundary",
  "bank-ibk-2026", "bank-toss-2026", "group-foreign-faculty-2025", "ledger-dues-policy-2024-2025",
  "ledger-final-2022-2025", "legacy-payments", "notion-dues-regulation-draft",
] as const;
const platformReceipt = {
  author: "user",
  created_at: "2026-08-10T06:43:28Z",
  message_id: "item-418",
  text_sha256: sha256("승인\n"),
  thread_id: "019fe3d1-7669-7911-b30f-2ebc99d3245a",
};
const readResponseSha256 = sha256(canonicalJson(platformReceipt));

for (const name of sources) {
  const profile = JSON.parse(readFileSync(`docs/source-contracts/profiles/${name}.json`, "utf8")) as Json;
  const mappingBytes = readFileSync(`docs/source-contracts/mappings/${name}-v2.json`);
  const mapping = JSON.parse(mappingBytes.toString("utf8")) as Json;
  if (profile.source_code !== mapping.source_code || profile.profile_sha256 !== mapping.source_profile_sha256) throw new Error(`approval_binding_mismatch:${name}`);
  const preimage = {
    approval_text_sha256: platformReceipt.text_sha256,
    approved_at: platformReceipt.created_at,
    host_id_or_null: "local",
    mapping_sha256: sha256(mappingBytes),
    platform_message_created_at: platformReceipt.created_at,
    platform_message_id: platformReceipt.message_id,
    platform_message_timestamp_source: "parent_turn_started_at_projection_v1",
    platform_thread_id: platformReceipt.thread_id,
    project_id: "local-fcb170b4427ba4e258ce8af48e487c64",
    provider: "codex-app",
    read_response_sha256: readResponseSha256,
    schema_version: "source-mapping-approval-v1",
    source_code: mapping.source_code,
    source_profile_sha256: profile.profile_sha256,
  } as Json;
  const approval = { ...preimage, receipt_sha256: sha256(canonicalJson(preimage)) };
  writeFileSync(`docs/source-contracts/approvals/${name}-v2.json`, `${canonicalJson(approval)}\n`);
}

console.log(JSON.stringify({ approval_count: sources.length, message_id: platformReceipt.message_id, read_response_sha256: readResponseSha256, result: "materialized" }));
