import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function canonicalJson(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

export function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const SHA = { type: "string", pattern: "^[0-9a-f]{64}$" };
const NONEMPTY = { type: "string", minLength: 1 };
const RESULT = { enum: ["approved", "rejected"] };
const RFC3339 = { type: "string", format: "date-time" };
const NONNEGATIVE_INTEGER = { type: "integer", minimum: 0 };

const digest = {
  type: "object",
  additionalProperties: false,
  required: ["path", "sha256"],
  properties: { path: NONEMPTY, sha256: SHA },
};

const digestList = { type: "array", items: digest };

const verifierIdentity = {
  type: "object",
  additionalProperties: false,
  required: ["provider", "model", "reasoning_effort", "project_id", "thread_id", "host_id_or_null"],
  properties: {
    provider: { const: "codex-app" },
    model: { const: "gpt-5.6-sol" },
    reasoning_effort: { const: "xhigh" },
    project_id: NONEMPTY,
    thread_id: NONEMPTY,
    host_id_or_null: { oneOf: [NONEMPTY, { type: "null" }] },
  },
};

const platformReceipt = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "provider",
    "model",
    "reasoning_effort",
    "project_id",
    "thread_id",
    "host_id_or_null",
    "create_request_sha256",
    "list_projects_response_sha256",
    "create_response_sha256",
    "list_threads_response_sha256",
    "wait_response_sha256",
    "read_response_sha256",
    "prompt_sha256",
    "projection_sha256",
    "provider_resolution_sha256",
    "receipt_sha256",
  ],
  properties: {
    schema_version: { const: "dgkma-platform-receipt-v2" },
    provider: { const: "codex-app" },
    model: { const: "gpt-5.6-sol" },
    reasoning_effort: { const: "xhigh" },
    project_id: NONEMPTY,
    thread_id: NONEMPTY,
    host_id_or_null: { oneOf: [NONEMPTY, { type: "null" }] },
    create_request_sha256: SHA,
    list_projects_response_sha256: SHA,
    create_response_sha256: SHA,
    list_threads_response_sha256: SHA,
    wait_response_sha256: SHA,
    read_response_sha256: SHA,
    prompt_sha256: SHA,
    projection_sha256: SHA,
    provider_resolution_sha256: SHA,
    receipt_sha256: SHA,
  },
};

const targetFingerprints = {
  type: "object",
  additionalProperties: false,
  required: ["development", "disposable_runs", "production_readonly"],
  properties: {
    development: SHA,
    disposable_runs: { type: "array", minItems: 1, uniqueItems: true, items: SHA },
    production_readonly: { oneOf: [SHA, { const: "unverified" }] },
  },
};

const laneAssertions: Record<string, string[]> = {
  F1: ["plan_manifest_traceability", "catalog_equality", "scope_guards", "source_authority"],
  F2: ["physical_schema", "actor_authorization", "lock_order", "append_only_invariants", "security_privacy"],
  F3: ["bootstrap_upgrade_restore", "repository_commands", "browser_receipt", "negative_authorization"],
  F4: [
    "source_reconciliation",
    "officer_assignments",
    "draft_policy_nonpersistence",
    "legacy_crosswalk",
    "sheet_fidelity",
    "production_unchanged",
  ],
  A1: [
    "owner_approval",
    "verifier_receipts",
    "evidence_archive",
    "staged_path_set",
    "marker_boundaries",
    "protected_tree_digest",
  ],
};

function assertionsSchema(lane: string): Json {
  const keys = laneAssertions[lane];
  return {
    type: "object",
    additionalProperties: false,
    required: keys,
    properties: Object.fromEntries(keys.map((key) => [key, RESULT])),
  };
}

function approvalImplication(lane: string): Json {
  return {
    if: { required: ["result"], properties: { result: { const: "approved" } } },
    then: {
      properties: {
        assertions: {
          properties: Object.fromEntries(laneAssertions[lane].map((key) => [key, { const: "approved" }])),
        },
      },
    },
  };
}

function assertionPayload(lane: string): Json {
  const properties: Record<string, Json> = {
    schema_version: { const: "dgkma-verifier-assertion-payload-v1" },
    lane: { const: lane },
    prompt_sha256: SHA,
    implementation_sha: SHA,
    manifest_sha256: SHA,
    protected_tree_digest_v1: SHA,
    target_fingerprints: targetFingerprints,
    assertions: assertionsSchema(lane),
    attachment_digests: digestList,
    result: RESULT,
    payload_sha256: SHA,
  };
  const required = Object.keys(properties);
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties,
    allOf: [approvalImplication(lane)],
  };
}

function finalEvidenceSchema(lane: string): Json {
  const properties: Record<string, Json> = {
    schema_version: { const: "dgkma-final-evidence-v1" },
    verifier_identity: verifierIdentity,
    platform_receipt: platformReceipt,
    assertion_payload_sha256: SHA,
    committed_prompt_path: { const: `docs/verifier-prompts/${lane}.md` },
    prompt_sha256: SHA,
    implementation_sha: SHA,
    manifest_sha256: SHA,
    protected_tree_digest_v1: SHA,
    target_fingerprints: targetFingerprints,
    assertions: assertionsSchema(lane),
    attachment_digests: digestList,
    result: RESULT,
    evidence_sha256: SHA,
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: { assertion_payload: assertionPayload(lane) },
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
    allOf: [approvalImplication(lane)],
  };
}

const ownerReceipt = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "platform_thread_id",
    "platform_message_id",
    "received_at",
    "approval_text_sha256",
    "pre_attestation_sha",
    "manifest_sha256",
    "f_evidence_commit_sha",
    "provider_resolution_sha256",
    "receipt_sha256",
  ],
  properties: {
    schema_version: { const: "dgkma-owner-approval-v1" },
    platform_thread_id: NONEMPTY,
    platform_message_id: NONEMPTY,
    received_at: RFC3339,
    approval_text_sha256: SHA,
    pre_attestation_sha: SHA,
    manifest_sha256: SHA,
    f_evidence_commit_sha: SHA,
    provider_resolution_sha256: SHA,
    receipt_sha256: SHA,
  },
};

function a1Payload(): Json {
  const properties: Record<string, Json> = {
    schema_version: { const: "dgkma-verifier-assertion-payload-v1" },
    lane: { const: "A1" },
    prompt_sha256: SHA,
    owner_receipt_sha256: SHA,
    pre_attestation_sha: SHA,
    manifest_sha256: SHA,
    f_evidence_commit_sha: SHA,
    f1_sha256: SHA,
    f2_sha256: SHA,
    f3_sha256: SHA,
    f4_sha256: SHA,
    protected_tree_digest_v1: SHA,
    staged_paths: { type: "array", uniqueItems: true, items: NONEMPTY },
    marker_hunks: { type: "array", uniqueItems: true, items: NONEMPTY },
    assertions: assertionsSchema("A1"),
    attachment_digests: digestList,
    result: RESULT,
    payload_sha256: SHA,
  };
  return {
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
    allOf: [approvalImplication("A1")],
  };
}

function a1EvidenceSchema(): Json {
  const properties: Record<string, Json> = {
    schema_version: { const: "dgkma-attestation-evidence-v1" },
    verifier_identity: verifierIdentity,
    platform_receipt: platformReceipt,
    assertion_payload_sha256: SHA,
    committed_prompt_path: { const: "docs/verifier-prompts/A1.md" },
    prompt_sha256: SHA,
    owner_receipt_sha256: SHA,
    pre_attestation_sha: SHA,
    manifest_sha256: SHA,
    f_evidence_commit_sha: SHA,
    f1_sha256: SHA,
    f2_sha256: SHA,
    f3_sha256: SHA,
    f4_sha256: SHA,
    protected_tree_digest_v1: SHA,
    staged_paths: { type: "array", uniqueItems: true, items: NONEMPTY },
    marker_hunks: { type: "array", uniqueItems: true, items: NONEMPTY },
    assertions: assertionsSchema("A1"),
    attachment_digests: digestList,
    result: RESULT,
    evidence_sha256: SHA,
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: { assertion_payload: a1Payload(), owner_receipt: ownerReceipt },
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
    allOf: [approvalImplication("A1")],
  };
}

const browserRoutes = [
  ["public_home", "GET", "/", "browser", 200],
  ["profile_self", "GET", "/api/auth/me", "browser", 200],
  ["admin_dashboard", "GET", "/admin", "browser", 200],
  ["alumni_sync_preview", "POST", "/api/admin/sync-alumni/preview", "browser", 200],
  ["member_accounting_self", "GET", "/api/accounting/me", "browser", 200],
  ["account_deletion_fixture", "DELETE", "/api/users/me", "isolated_fixture", 204],
] as const;

function browserEvidenceSchema(): Json {
  const routeSchemas = browserRoutes.map(([id, method, routePath, mode, expectedStatus]) => ({
    type: "object",
    additionalProperties: false,
    required: ["id", "method", "path", "mode", "expected_status", "observed_status", "result"],
    properties: {
      id: { const: id },
      method: { const: method },
      path: { const: routePath },
      mode: { const: mode },
      expected_status: { const: expectedStatus },
      observed_status: NONNEGATIVE_INTEGER,
      result: RESULT,
    },
  }));
  const properties: Record<string, Json> = {
    schema_version: { const: "dgkma-f3-browser-v1" },
    implementation_sha: SHA,
    platform_session_id: NONEMPTY,
    session_user_uid: {
      type: "string",
      pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    },
    is_admin: { const: true },
    admin_receipt_sha256: SHA,
    started_at: RFC3339,
    finished_at: RFC3339,
    routes: { type: "array", minItems: 6, maxItems: 6, prefixItems: routeSchemas, items: false },
    masking: {
      type: "object",
      additionalProperties: false,
      required: ["mask_version", "masked_selectors", "ocr_scan_sha256", "pii_regex_scan_sha256", "pii_finding_count"],
      properties: {
        mask_version: { const: "dgkma-browser-mask-v1" },
        masked_selectors: {
          const: [
            "[data-pii='account']",
            "[data-pii='address']",
            "[data-pii='email']",
            "[data-pii='name']",
            "[data-pii='phone']",
          ],
        },
        ocr_scan_sha256: SHA,
        pii_regex_scan_sha256: SHA,
        pii_finding_count: { const: 0 },
      },
    },
    screenshot_digests: { type: "array", minItems: 5, maxItems: 5, items: digest },
    console_error_count: { const: 0 },
    server_error_count: { const: 0 },
    result: RESULT,
    receipt_sha256: SHA,
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: { assertion_payload: assertionPayload("F3") },
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

const roles: Record<string, string> = {
  F1: "Verify plan, manifest, catalog, scope, and source-authority traceability.",
  F2: "Verify physical schema, authorization, lock order, append-only invariants, security, and privacy.",
  F3: "Verify Development bootstrap, restore, repository commands, browser flows, and negative authorization.",
  F4: "Verify source reconciliation, officer assignments, draft-policy nonpersistence, legacy crosswalk, Sheet fidelity, and Production unchanged.",
  A1: "Resolve provider-owned F receipts and owner approval, then verify marker-only attestation staging.",
};

function prompt(lane: string): string {
  return [
    "schema_version: dgkma-verifier-prompt-v1",
    `lane: ${lane}`,
    `role: ${roles[lane]}`,
    "input: Verify only the supplied frozen implementation SHA, manifest SHA, protected-tree digest, target fingerprints, and attachments.",
    "method: Independently recompute every lane assertion; repository harness verdicts are untrusted evidence.",
    "output: Emit only the receipt-free dgkma-verifier-assertion-payload-v1 JSON and APPROVE only when every assertion is approved.",
    "",
  ].join("\n");
}

const piiRegex: Json = {
  schema_version: "dgkma-browser-pii-regex-v1",
  flags: "iu",
  patterns: [
    { name: "secret", source: "(password|secret|token|authorization|api[_-]?key)\\s*[:=]\\s*\\S+" },
    { name: "email", source: "[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}" },
    { name: "phone", source: "(?:\\+?82[- ]?)?0?10[- ]?[0-9]{4}[- ]?[0-9]{4}" },
    { name: "account", source: "\\b[0-9]{2,6}[- ][0-9]{2,6}[- ][0-9]{2,8}\\b" },
    {
      name: "address",
      source: "(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\\n]{0,40}(시|군|구|로|길)\\b",
    },
  ],
};

export const verifierInventoryPaths = [
  "docs/verifier-prompts/A1.md",
  "docs/verifier-prompts/F1.md",
  "docs/verifier-prompts/F2.md",
  "docs/verifier-prompts/F3.md",
  "docs/verifier-prompts/F4.md",
  "docs/verifier-schemas/A1.schema.json",
  "docs/verifier-schemas/F1.schema.json",
  "docs/verifier-schemas/F2.schema.json",
  "docs/verifier-schemas/F3-browser.schema.json",
  "docs/verifier-schemas/F3.schema.json",
  "docs/verifier-schemas/F4.schema.json",
  "docs/verifier-schemas/browser-pii-regex-v1.json",
] as const;

export function materializeVerifierContracts(root: string): void {
  mkdirSync(path.join(root, "docs/verifier-prompts"), { recursive: true });
  mkdirSync(path.join(root, "docs/verifier-schemas"), { recursive: true });
  for (const lane of Object.keys(roles)) {
    writeFileSync(path.join(root, `docs/verifier-prompts/${lane}.md`), prompt(lane));
  }
  for (const lane of ["F1", "F2", "F3", "F4"]) {
    writeFileSync(
      path.join(root, `docs/verifier-schemas/${lane}.schema.json`),
      `${canonicalJson(finalEvidenceSchema(lane))}\n`,
    );
  }
  writeFileSync(
    path.join(root, "docs/verifier-schemas/F3-browser.schema.json"),
    `${canonicalJson(browserEvidenceSchema())}\n`,
  );
  writeFileSync(
    path.join(root, "docs/verifier-schemas/A1.schema.json"),
    `${canonicalJson(a1EvidenceSchema())}\n`,
  );
  writeFileSync(
    path.join(root, "docs/verifier-schemas/browser-pii-regex-v1.json"),
    `${canonicalJson(piiRegex)}\n`,
  );
  const files = Object.fromEntries(
    verifierInventoryPaths.map((relativePath) => [
      relativePath,
      sha256(readFileSync(path.join(root, relativePath))),
    ]),
  );
  const inventoryWithoutHash: Json = {
    schema_version: "dgkma-verifier-inventory-v1",
    files,
  };
  const inventory: Json = {
    ...inventoryWithoutHash,
    inventory_sha256: sha256(canonicalJson(inventoryWithoutHash)),
  };
  writeFileSync(path.join(root, "docs/verifier-inventory.json"), `${canonicalJson(inventory)}\n`);
}
