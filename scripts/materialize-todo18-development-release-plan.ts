import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";
import { DEFERRED_SOURCE_CODES } from "../server/accounting/adapters/deferred-source-normalization-v1";

const actor = JSON.parse(readFileSync("docs/database-targets/development-admin-approved.json", "utf8")) as Record<string, CanonicalValue>;
const slug = (code: string) => code.toLowerCase().replaceAll("_", "-");
const operations = [...DEFERRED_SOURCE_CODES].sort().map((sourceCode) => {
  const descriptorPath = `docs/source-contracts/releases/${slug(sourceCode)}-v1.json`;
  return {
    action_correlation_uid: randomUUID(), descriptor_sha256: sha256(readFileSync(descriptorPath)),
    event_uid: randomUUID(), operation_uid: randomUUID(), release_uid: randomUUID(), root_correlation_uid: randomUUID(), source_code: sourceCode,
  };
});
const preimage = {
  actor_authorization_version: actor.authorization_version,
  actor_user_id: actor.candidate_user_id,
  actor_user_uid: actor.candidate_user_uid,
  operations,
  schema_version: "dgkma-todo18-development-source-release-plan-v1",
  target_fingerprint: actor.target_fingerprint,
};
const plan = { ...preimage, plan_sha256: sha256(canonicalJson(preimage as CanonicalValue)) };
writeFileSync("docs/source-contracts/releases/development-source-release-plan-v1.json", `${canonicalJson(plan as CanonicalValue)}\n`, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ result: "materialized", source_count: operations.length, plan_sha256: plan.plan_sha256, database_writes: 0 }));
