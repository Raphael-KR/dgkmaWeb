import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeDeferredSourceRow, type DeferredMapping } from "./adapters/deferred-source-normalization-v1";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";

const mapping = (name: string) => JSON.parse(readFileSync(`docs/source-contracts/mappings/${name}-v1.json`, "utf8")) as DeferredMapping;

test("foreign faculty normalization preserves candidate-only semantics", () => {
  const result = normalizeDeferredSourceRow(mapping("group-foreign-faculty-2025"), {
    coordinateKey: "1501009351:3",
    recordKind: "allocation_roster",
    values: { "졸업기수": "12기", "성  명": "비식별 테스트" },
  }, Buffer.alloc(32, 7));
  assert.equal(result.envelope.normalized_payload.proposed_amount, "50000");
  assert.equal(result.envelope.normalized_payload.allocation_status, "candidate_only");
  assert.match(String(result.envelope.normalized_payload.member_name_digest), /^[0-9a-f]{64}$/);
  assert.equal(result.contentDigest, sha256(canonicalJson(result.envelope as unknown as CanonicalValue)));
});

test("normalization refuses weak HMAC keys and unknown record kinds", () => {
  const source = mapping("group-foreign-faculty-2025");
  assert.throws(() => normalizeDeferredSourceRow(source, { coordinateKey: "x", recordKind: "allocation_roster", values: {} }, Buffer.alloc(8)), /deferred_source_hmac_key_too_short/);
  assert.throws(() => normalizeDeferredSourceRow(source, { coordinateKey: "x", recordKind: "economic", values: {} }, Buffer.alloc(32)), /deferred_source_record_kind_unknown/);
});

test("all release descriptors bind the current mapping approval, schema, and implementation", () => {
  const schemaSha = sha256(readFileSync("docs/source-contracts/schemas/deferred-source-normalized-row-v1.schema.json"));
  const implementationSha = sha256(readFileSync("server/accounting/adapters/deferred-source-normalization-v1.ts"));
  for (const sourceCode of ["AGM36_PERIOD_BOUNDARY", "BANK_IBK_2026", "BANK_TOSS_2026", "GROUP_FOREIGN_FACULTY_2025", "LEDGER_DUES_POLICY_2024_2025", "LEDGER_FINAL_2022_2025", "LEGACY_PAYMENTS", "NOTION_DUES_REGULATION_DRAFT"]) {
    const slug = sourceCode.toLowerCase().replaceAll("_", "-");
    const bytes = readFileSync(`docs/source-contracts/releases/${slug}-v1.json`, "utf8");
    const descriptor = JSON.parse(bytes) as Record<string, CanonicalValue>;
    const approval = JSON.parse(readFileSync(`docs/source-contracts/approvals/${slug}-v1.json`, "utf8")) as Record<string, CanonicalValue>;
    assert.equal(bytes, `${canonicalJson(descriptor)}\n`);
    assert.equal(descriptor.source_code, sourceCode);
    assert.equal(descriptor.mapping_approval_receipt_sha256, approval.receipt_sha256);
    assert.equal(descriptor.mapping_table_sha256, approval.mapping_sha256);
    assert.equal(descriptor.normalized_schema_sha256, schemaSha);
    assert.equal(descriptor.normalization_implementation_sha256, implementationSha);
  }
});

test("Development release plan is self-bound and preallocates unique UUIDv4 identities", () => {
  const plan = JSON.parse(readFileSync("docs/source-contracts/releases/development-source-release-plan-v1.json", "utf8")) as Record<string, CanonicalValue>;
  const preimage = { ...plan }; delete preimage.plan_sha256;
  assert.equal(plan.plan_sha256, sha256(canonicalJson(preimage)));
  const operations = plan.operations as Array<Record<string, CanonicalValue>>;
  assert.equal(operations.length, 8);
  assert.equal(new Set(operations.map((entry) => entry.source_code)).size, 8);
  const uuids = operations.flatMap((entry) => [entry.action_correlation_uid, entry.event_uid, entry.operation_uid, entry.release_uid, entry.root_correlation_uid].map(String));
  assert.equal(new Set(uuids).size, 40);
  for (const uid of uuids) assert.match(uid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
