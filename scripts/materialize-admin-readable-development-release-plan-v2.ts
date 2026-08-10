import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";

const actor = JSON.parse(readFileSync("docs/database-targets/development-admin-approved.json", "utf8")) as Record<string, CanonicalValue>;
const names = [
  "agm36-period-boundary", "bank-ibk-2026", "bank-toss-2026", "group-foreign-faculty-2025",
  "ledger-dues-policy-2024-2025", "ledger-final-2022-2025", "legacy-payments",
  "membership-integrated-address-book", "notion-dues-regulation-draft", "notion-organization-role-history",
];
const operations = names.map((name) => {
  const descriptor = JSON.parse(readFileSync(`docs/source-contracts/releases/${name}-v2.json`, "utf8")) as Record<string, CanonicalValue>;
  return {
    action_correlation_uid: randomUUID(),
    descriptor_sha256: sha256(readFileSync(`docs/source-contracts/releases/${name}-v2.json`)),
    event_uid: randomUUID(), operation_uid: randomUUID(), release_uid: randomUUID(), root_correlation_uid: randomUUID(),
    source_code: descriptor.source_code,
  };
});
const preimage = {
  actor_authorization_version: actor.authorization_version,
  actor_user_id: actor.candidate_user_id,
  actor_user_uid: actor.candidate_user_uid,
  operations,
  schema_version: "dgkma-admin-readable-development-source-release-plan-v2",
  target_fingerprint: actor.target_fingerprint,
};
const plan = { ...preimage, plan_sha256: sha256(canonicalJson(preimage as CanonicalValue)) };
writeFileSync("docs/source-contracts/releases/admin-readable-development-source-release-plan-v2.json", `${canonicalJson(plan as CanonicalValue)}\n`, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ result: "materialized", source_count: operations.length, plan_sha256: plan.plan_sha256, database_writes: 0 }));
