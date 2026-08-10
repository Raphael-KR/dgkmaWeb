import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const ACCOUNTING_MANIFEST_SHA256 = "31671836f8550190c38f27b15ec3d3e45e330e5fa3c256f3db48cdf059fe64f6";
export const ACCOUNTING_MANIFEST_COMMIT = "47a9cf63545371ea258fc1c2264acf531fe5facf";
export const ACCOUNTING_MANIFEST_PATH = "docs/database-manifest.yaml";
export const GATE_BEGIN = "<!-- ARCHITECTURE_ATTESTATION_GATE_BEGIN v1 -->";
export const GATE_END = "<!-- ARCHITECTURE_ATTESTATION_GATE_END v1 -->";

export const OWNER_DECISION_IDS = [
  "bookkeeping-basis",
  "transaction-allocation",
  "period-separation",
  "membership-monthly-current",
  "dues-policy-table",
  "compliance-vs-rights",
  "dues-start-year",
  "role-tier-replacement",
  "rights-not-member-type",
  "legacy-member-labels",
  "honorary-dues-policy",
  "member-pledge",
  "annual-role-recalculation",
  "default-member-pledge",
  "prospective-pledge-change",
  "highest-annual-role-tier",
  "refund-rights-effect",
  "correction-retroactivity",
  "pledge-role-independence",
  "annual-payment-immediate-rights",
  "association-member-uuid",
  "bigint-decimal-wire",
  "provider-neutral-receipt",
  "server-only-db-boundary",
  "agm36-close",
  "appointment-effective-separation",
  "overlapping-organizational-roles",
  "director-tier-map",
  "secondary-role-no-dues",
  "assembly-chair-position-tier",
  "logical-source-stability",
  "source-coordinate-versioning",
  "economic-event-canonical-root",
  "close-completeness",
  "additive-forward-rollout",
] as const;

type RuleViolation = { rule: string; count: number };

export type AccountingPlanValidation = {
  schema_version: "dgkma-accounting-plan-lint-v1";
  plan_path: string;
  plan_sha256: string;
  manifest_path: string;
  manifest_sha256: string;
  manifest_commit: string;
  owner_decision_count: number;
  architecture_gate_pairs: number;
  accounting_gate_pairs: number;
  violations: RuleViolation[];
  result: "approved" | "rejected";
};

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function countLiteral(text: string, literal: string): number {
  return text.split(literal).length - 1;
}

function markerCount(text: string, marker: string): number {
  return text.split("\n").filter((line) => line === marker).length;
}

function add(violations: RuleViolation[], rule: string, count: number): void {
  if (count > 0) violations.push({ rule, count });
}

export function validateAccountingPlan(planPath: string): AccountingPlanValidation {
  const bytes = readFileSync(planPath);
  const text = bytes.toString("utf8");
  const architectureText = readFileSync("docs/plans/database-architecture-audit.md", "utf8");
  const manifestBytes = readFileSync(ACCOUNTING_MANIFEST_PATH);
  const violations: RuleViolation[] = [];

  add(violations, "fixed-new-table-count", (text.match(/(?:exactly\s+22\s+new\s+(?:logical\s+)?tables|all\s+22\s+tables|22-table|22개[^\n]{0,40}테이블)/gi) ?? []).length);
  add(violations, "obsolete-overlap-role", (text.match(/(?:role|position|직책)[^\n]{0,100}(?:cannot|must\s+not)[^\n]{0,30}overlap|(?:role|position|직책)[^\n]{0,100}overlap[^\n]{0,30}(?:forbidden|prohibited)|직책[^\n]{0,100}중첩[^\n]{0,30}(?:금지|불가)/gi) ?? []).length);
  add(violations, "obsolete-actor-contract", (text.match(/actor[_ -]member(?:_id)?/gi) ?? []).length);
  add(violations, "obsolete-source-contract", (text.match(/\b(?:accounting_sources|accounting_import_rows)\b/g) ?? []).length);

  const manifestReferences = countLiteral(text, ACCOUNTING_MANIFEST_PATH);
  if (manifestReferences !== 1) add(violations, "canonical-manifest-reference", Math.abs(manifestReferences - 1) || 1);
  const manifestLikePaths = text.match(/[a-z0-9_./-]*manifest\.(?:json|ya?ml)/gi) ?? [];
  if (manifestLikePaths.length !== 1 || manifestLikePaths[0] !== ACCOUNTING_MANIFEST_PATH) {
    add(violations, "second-manifest-reference", 1);
  }
  if (countLiteral(text, ACCOUNTING_MANIFEST_SHA256) !== 1 || sha256(manifestBytes) !== ACCOUNTING_MANIFEST_SHA256) {
    add(violations, "canonical-manifest-sha", 1);
  }
  if (countLiteral(text, ACCOUNTING_MANIFEST_COMMIT) !== 1) add(violations, "canonical-manifest-commit", 1);

  const accountingBegin = markerCount(text, GATE_BEGIN);
  const accountingEnd = markerCount(text, GATE_END);
  const architectureBegin = markerCount(architectureText, GATE_BEGIN);
  const architectureEnd = markerCount(architectureText, GATE_END);
  if (accountingBegin !== 1 || accountingEnd !== 1 || !text.includes(`${GATE_BEGIN}\n${GATE_END}\n`)) {
    add(violations, "accounting-attestation-gate", 1);
  }
  if (architectureBegin !== 1 || architectureEnd !== 1 || !architectureText.includes(`${GATE_BEGIN}\n${GATE_END}\n`)) {
    add(violations, "architecture-attestation-gate", 1);
  }

  for (const decisionId of OWNER_DECISION_IDS) {
    if (countLiteral(text, `\`${decisionId}\``) !== 1) add(violations, `owner-decision:${decisionId}`, 1);
  }
  const traceRows = text.split("\n").filter((line) => /^\| `[^`]+` \|/.test(line));
  if (traceRows.length !== OWNER_DECISION_IDS.length) add(violations, "owner-decision-table-closure", 1);

  for (const heading of [
    "### Authority and actors",
    "### Durable identity",
    "### Logical sources and immutable versions",
    "### Organizational role overlap and dues derivation",
    "### Economic-event identity and provenance",
    "### Period reconciliation and close",
    "### Rollout and recovery",
  ]) {
    if (countLiteral(text, heading) !== 1) add(violations, "architecture-contract-coverage", 1);
  }
  if (
    !text.includes("`monthly_minimum` and `annual_minimum` are independent policy inputs.") ||
    /annual[^\n]{0,80}(?:monthly[^\n]{0,30}\*\s*12|12\s*\*\s*monthly)|annual_minimum\s*=\s*monthly_minimum/gi.test(text)
  ) {
    add(violations, "monthly-annual-independence", 1);
  }

  violations.sort((left, right) => left.rule.localeCompare(right.rule));
  return {
    schema_version: "dgkma-accounting-plan-lint-v1",
    plan_path: planPath,
    plan_sha256: sha256(bytes),
    manifest_path: ACCOUNTING_MANIFEST_PATH,
    manifest_sha256: ACCOUNTING_MANIFEST_SHA256,
    manifest_commit: ACCOUNTING_MANIFEST_COMMIT,
    owner_decision_count: OWNER_DECISION_IDS.length,
    architecture_gate_pairs: architectureBegin === 1 && architectureEnd === 1 ? 1 : 0,
    accounting_gate_pairs: accountingBegin === 1 && accountingEnd === 1 ? 1 : 0,
    violations,
    result: violations.length === 0 ? "approved" : "rejected",
  };
}

if (process.argv[1]?.endsWith("validate-accounting-plan.ts")) {
  const planIndex = process.argv.indexOf("--plan");
  if (planIndex < 0 || !process.argv[planIndex + 1]) throw new Error("--plan is required");
  const result = validateAccountingPlan(process.argv[planIndex + 1]);
  console.log(JSON.stringify(result));
  if (result.result !== "approved") process.exitCode = 1;
}
