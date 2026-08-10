import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeBankRowV3 } from "./adapters/bank-sources-2026-v3";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";

function implementationDigest(paths: string[]): string { return sha256(canonicalJson({ schema_version: "normalization-implementation-closure-v1", files: [...paths].sort().map((path) => ({ path, sha256: sha256(readFileSync(path)) })) })); }

test("Toss and IBK v3 retain readable work snapshots without account fields", () => {
  const toss = normalizeBankRowV3("BANK_TOSS_2026", { coordinateKey: "toss:10", values: { "거래 일시": "2026. 1. 2. 03:04", "거래 금액": "50,000", "거래 후 잔액": "100,000", 적요: "입금자", "거래 유형": "입금", "거래 기관": "은행", 메모: null } });
  assert.equal(toss.direction, "credit"); assert.equal(toss.amount, "50000"); assert.equal(toss.payer_name_snapshot, "입금자"); assert.equal(Object.hasOwn(toss, "계좌번호"), false);
  const ibk = normalizeBankRowV3("BANK_IBK_2026", { coordinateKey: "ibk:3", values: { 거래일시: "2026-03-17 10:20", 출금: "10,000", 입금: null, "거래후 잔액": "90,000", 상대계좌예금주명: "상대", 거래내용: "이체", 상대은행: "은행", 메모: null } });
  assert.equal(ibk.direction, "debit"); assert.equal(ibk.amount, "10000");
});

test("IBK opening-balance shape cannot become an economic row", () => {
  assert.throws(() => normalizeBankRowV3("BANK_IBK_2026", { coordinateKey: "ibk:2", values: { 거래일시: "2026-03-16", 출금: "-", 입금: "-", "거래후 잔액": "100000" } }), /bank_v3_(money_invalid|direction_exclusive_required)/);
});

test("bank v3 mappings bind reproducible profiles and explicit normalization versions", () => {
  for (const slug of ["bank-toss-2026", "bank-ibk-2026"]) {
    const profilePath = `docs/source-contracts/profiles/${slug}-v3.json`;
    const profile = JSON.parse(readFileSync(profilePath, "utf8")) as Record<string, CanonicalValue>;
    const profilePreimage = { ...profile };
    delete profilePreimage.profile_sha256;
    assert.equal(profile.profile_sha256, sha256(canonicalJson(profilePreimage)));
    const mapping = JSON.parse(readFileSync(`docs/source-contracts/mappings/${slug}-v3.json`, "utf8")) as {
      constants: { excluded_anchor_evidence?: { row: number }; normalization_version: string };
      source_profile_sha256: string;
    };
    assert.equal(mapping.source_profile_sha256, profile.profile_sha256);
    assert.match(mapping.constants.normalization_version, /^.+-v3@3\.0\.0\+reproducible-profile-v1$/);
    if (slug === "bank-ibk-2026") assert.equal(mapping.constants.excluded_anchor_evidence?.row, 2);
  }
});

test("bank v3 approvals, descriptors, and Development plan are immutable and self-bound", () => {
  const operations = new Map<string, Record<string, CanonicalValue>>();
  const planBytes = readFileSync("docs/source-contracts/releases/bank-development-release-plan-v3.json", "utf8");
  const plan = JSON.parse(planBytes) as Record<string, CanonicalValue>; const planPreimage = { ...plan }; delete planPreimage.plan_sha256;
  assert.equal(planBytes, `${canonicalJson(plan)}\n`); assert.equal(plan.plan_sha256, sha256(canonicalJson(planPreimage)));
  for (const operation of plan.operations as Array<Record<string, CanonicalValue>>) operations.set(String(operation.source_code), operation);
  assert.equal(operations.size, 2);
  for (const slug of ["bank-toss-2026", "bank-ibk-2026"]) {
    const sourceCode = slug === "bank-toss-2026" ? "BANK_TOSS_2026" : "BANK_IBK_2026";
    const mappingBytes = readFileSync(`docs/source-contracts/mappings/${slug}-v3.json`);
    const approvalBytes = readFileSync(`docs/source-contracts/approvals/${slug}-v3.json`, "utf8"); const approval = JSON.parse(approvalBytes) as Record<string, CanonicalValue>; const approvalPreimage = { ...approval }; delete approvalPreimage.receipt_sha256;
    const descriptorBytes = readFileSync(`docs/source-contracts/releases/${slug}-v3.json`); const descriptor = JSON.parse(descriptorBytes.toString("utf8")) as Record<string, CanonicalValue>;
    assert.equal(approvalBytes, `${canonicalJson(approval)}\n`); assert.equal(approval.mapping_sha256, sha256(mappingBytes)); assert.equal(approval.receipt_sha256, sha256(canonicalJson(approvalPreimage)));
    assert.equal(descriptor.mapping_approval_receipt_sha256, approval.receipt_sha256); assert.equal(descriptor.mapping_table_sha256, sha256(mappingBytes));
    assert.equal(descriptor.normalized_schema_sha256, sha256(readFileSync("docs/source-contracts/schemas/deferred-source-normalized-row-v2.schema.json")));
    assert.equal(descriptor.normalization_implementation_sha256, implementationDigest(["server/accounting/adapters/admin-readable-source-v2.ts", "server/accounting/adapters/bank-sources-2026-v3.ts", "server/accounting/source-contracts.ts"]));
    assert.equal(operations.get(sourceCode)?.descriptor_sha256, sha256(descriptorBytes));
  }
});
