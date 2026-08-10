import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeBankRowV3 } from "./adapters/bank-sources-2026-v3";

function sha256(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }

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
    const mapping = JSON.parse(readFileSync(`docs/source-contracts/mappings/${slug}-v3.json`, "utf8")) as {
      constants: { excluded_anchor_evidence?: { row: number }; normalization_version: string };
      source_profile_sha256: string;
    };
    assert.equal(mapping.source_profile_sha256, sha256(readFileSync(profilePath)));
    assert.match(mapping.constants.normalization_version, /^.+-v3@3\.0\.0\+reproducible-profile-v1$/);
    if (slug === "bank-ibk-2026") assert.equal(mapping.constants.excluded_anchor_evidence?.row, 2);
  }
});
