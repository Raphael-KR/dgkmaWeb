import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";

const contracts = [
  { name: "membership-integrated-address-book", schema: "docs/source-contracts/schemas/member-identity-row-v2.schema.json", implementation: ["server/accounting/adapters/admin-readable-source-v2.ts", "server/accounting/adapters/membership-integrated-address-book-v2.ts", "server/accounting/source-contracts.ts"] },
  { name: "notion-organization-role-history", schema: "docs/source-contracts/schemas/role-row-v3.schema.json", implementation: ["server/accounting/adapters/admin-readable-source-v2.ts", "server/accounting/adapters/notion-organization-role-history-v2.ts", "server/accounting/source-contracts.ts"] },
  ...["agm36-period-boundary", "bank-ibk-2026", "bank-toss-2026", "group-foreign-faculty-2025", "ledger-dues-policy-2024-2025", "ledger-final-2022-2025", "legacy-payments", "notion-dues-regulation-draft"].map((name) => ({ name, schema: "docs/source-contracts/schemas/deferred-source-normalized-row-v2.schema.json", implementation: ["server/accounting/adapters/admin-readable-source-v2.ts", "server/accounting/adapters/deferred-source-normalization-v2.ts", "server/accounting/source-contracts.ts"] })),
];
function historicalImplementationDigest(commit: string, paths: string[]): string {
  return sha256(canonicalJson({ schema_version: "normalization-implementation-closure-v1", files: [...paths].sort().map((path) => ({ path, sha256: sha256(execFileSync("git", ["show", `${commit}:${path}`])) })) }));
}

test("ten v2 release descriptors bind approved mappings, schemas, and secret-free implementation closures", () => {
  for (const contract of contracts) {
    const descriptorBytes = readFileSync(`docs/source-contracts/releases/${contract.name}-v2.json`, "utf8");
    const descriptor = JSON.parse(descriptorBytes) as Record<string, CanonicalValue>;
    const mappingBytes = readFileSync(`docs/source-contracts/mappings/${contract.name}-v2.json`);
    const approval = JSON.parse(readFileSync(`docs/source-contracts/approvals/${contract.name}-v2.json`, "utf8")) as Record<string, CanonicalValue>;
    assert.equal(descriptorBytes, `${canonicalJson(descriptor)}\n`);
    assert.equal(descriptor.adapter_version, "2.0.0");
    assert.equal(descriptor.mapping_table_sha256, sha256(mappingBytes));
    assert.equal(descriptor.mapping_approval_receipt_sha256, approval.receipt_sha256);
    assert.equal(descriptor.normalized_schema_sha256, sha256(readFileSync(contract.schema)));
    assert.equal(descriptor.normalization_implementation_sha256, historicalImplementationDigest("06dadbb", contract.implementation));
    for (const path of contract.implementation) assert.doesNotMatch(readFileSync(path, "utf8"), /createHmac|ACCOUNTING_PII_HMAC_KEY_V1|source-row-hmac/i);
  }
});

test("v2 Development plan is self-bound and preallocates 50 unique UUIDv4 values", () => {
  const bytes = readFileSync("docs/source-contracts/releases/admin-readable-development-source-release-plan-v2.json", "utf8");
  const plan = JSON.parse(bytes) as Record<string, CanonicalValue>;
  const preimage = { ...plan }; delete preimage.plan_sha256;
  assert.equal(bytes, `${canonicalJson(plan)}\n`);
  assert.equal(plan.plan_sha256, sha256(canonicalJson(preimage)));
  const operations = plan.operations as Array<Record<string, CanonicalValue>>;
  assert.equal(operations.length, 10);
  assert.equal(new Set(operations.map((entry) => entry.source_code)).size, 10);
  const uuids = operations.flatMap((entry) => [entry.action_correlation_uid, entry.event_uid, entry.operation_uid, entry.release_uid, entry.root_correlation_uid].map(String));
  assert.equal(new Set(uuids).size, 50);
  for (const uid of uuids) assert.match(uid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
