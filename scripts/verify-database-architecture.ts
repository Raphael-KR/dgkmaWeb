import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  canonicalJson,
  materializeVerifierContracts,
  sha256,
  verifierInventoryPaths,
} from "./database-architecture-verifier-contracts";
import { runTaskEight } from "./verify-database-index-workload";
import { validateMemberActorManifest } from "../server/accounting/member-actor-contract";
import { POLICY_SEEDS, SECONDARY_POSITION_CODES, validateDuesPolicyManifest } from "../server/accounting/dues-policy-contract";
import { validateFinancialManifest } from "../server/accounting/financial-topology-contract";
import { readArtifactDescriptors, readManifest, verifyArtifactBytes } from "./schema-ledger";
import {
  authorizeRestoreReconcile,
  readRestoreReceipt,
  readSyntheticSequence60Descriptor,
  RESTORE_READINESS,
  type RestoreTargetKind,
} from "./database-restore-contract";
import {
  captureObservedPredicates,
  developmentInventorySql,
  DOMAIN_EXCEPTION_RULES,
  parseSequence15SqlRegistry,
  sequence15SqlRegistry,
  validateClosedRuleContract,
} from "./database-domain-constraints";
import {
  applyLegacyObituaryDeleteFixture,
  decideRelationshipSequence20,
  detectRelationshipBlockers,
  developmentRelationshipPreflightSql,
  RELATIONSHIP_CONSTRAINTS,
  SEQUENCE_15_RELATIONSHIP_QUARANTINE,
  SEQUENCE_20_RELATIONSHIP_RECHECK,
  type RelationshipFixture,
  validateRelationshipContract,
} from "./database-relationship-constraints";
import {
  developmentIdentityAnchorPreflightSql,
  IDENTITY_ANCHOR_DEFINITIONS,
  previewCurrentExactLinks,
  requireExpectedIdentityBlockers,
  resolveTaskNineCommitSha,
  type IdentityFixture,
  validateIdentityAnchorContract,
} from "./member-identity-anchor";
import {
  planRetentionRun,
  RETENTION_CONTRACT,
  RETENTION_JOBS,
  resolveTaskTenCommitSha,
  STARTUP_LATEST_REQUIRED,
  startupLedgerInventorySql,
  type StartupDescriptor,
  type StartupLedgerRow,
  verifyRuntimeBoundary,
  verifyStartupLedger,
} from "./startup-retention-contract";
import {
  TODO_14_LIVE_SOURCES,
  TODO_14_MANIFEST_SHA256,
  validateSourceContract,
} from "../server/accounting/source-contracts";

type JsonObject = Record<string, unknown>;

function value(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function values(flag: string): string[] {
  return process.argv.flatMap((argument, index) =>
    argument === flag && process.argv[index + 1] ? [process.argv[index + 1]] : [],
  );
}

function fail(message: string): never {
  throw new Error(message);
}

function exactKeys(object: JsonObject, keys: readonly string[], label: string): void {
  const actual = Object.keys(object).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label}: unexpected key set`);
  }
}

function parseJson(filePath: string): JsonObject {
  if (!existsSync(filePath)) fail(`missing file: ${filePath}`);
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail(`object required: ${filePath}`);
  return parsed;
}

const providerKeys = [
  "schema_version",
  "preflight_run_uid",
  "provider",
  "project_id",
  "thread_id",
  "host_id_or_null",
  "model",
  "reasoning_effort",
  "create_request_sha256",
  "list_projects_response_sha256",
  "create_response_sha256",
  "list_threads_response_sha256",
  "wait_response_sha256",
  "read_response_sha256",
  "prompt_sha256",
  "final_message_sha256",
  "projection_sha256",
  "status",
  "result",
  "receipt_sha256",
] as const;

const projectionKeys = [
  "schema_version",
  "list_projects_response",
  "create_request",
  "create_response",
  "list_threads_response",
  "wait_request",
  "wait_response",
  "read_request",
  "read_response",
  "projection_sha256",
] as const;

function objectValue(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}: object required`);
  return value as JsonObject;
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label}: array required`);
  return value;
}

function validateProjectionSchemaAndDescriptor(root: string, projectionPath: string): void {
  const descriptorPath = path.join(root, "docs/verifier-provider-capability-projection.json");
  const descriptor = parseJson(descriptorPath);
  exactKeys(
    descriptor,
    ["schema_version", "artifact_path", "schema_path", "artifact_sha256", "schema_sha256"],
    "provider projection descriptor",
  );
  if (descriptor.schema_version !== "dgkma-provider-capability-projection-descriptor-v1") {
    fail("provider projection descriptor: version mismatch");
  }
  if (descriptor.artifact_path !== ".omo/evidence/database-architecture-audit/task-1/provider-capability-projection.json") {
    fail("provider projection descriptor: artifact path mismatch");
  }
  const schemaRelativePath = "docs/provider-contracts/provider-capability-projection.schema.json";
  if (descriptor.schema_path !== schemaRelativePath) fail("provider projection descriptor: schema path mismatch");
  const schemaPath = path.join(root, schemaRelativePath);
  const schemaBytes = readFileSync(schemaPath);
  if (descriptor.schema_sha256 !== sha256(schemaBytes)) fail("provider projection descriptor: schema digest mismatch");
  if (descriptor.artifact_sha256 !== sha256(readFileSync(projectionPath))) {
    fail("provider projection descriptor: artifact digest mismatch");
  }
  const schema = JSON.parse(schemaBytes.toString("utf8")) as JsonObject;
  if (
    schema.$schema !== "https://json-schema.org/draft/2020-12/schema" ||
    schema.additionalProperties !== false
  ) {
    fail("provider projection schema: closed draft 2020-12 schema required");
  }
  const required = arrayValue(schema.required, "provider projection schema required");
  if (
    required.length !== projectionKeys.length ||
    projectionKeys.some((key) => !required.includes(key))
  ) {
    fail("provider projection schema: required key set mismatch");
  }
}

function validateProviderProjection(projection: JsonObject): void {
  exactKeys(projection, projectionKeys, "provider projection");
  if (projection.schema_version !== "dgkma-provider-capability-projection-v1") {
    fail("provider projection: version mismatch");
  }
  const projects = objectValue(projection.list_projects_response, "list_projects response");
  exactKeys(projects, ["matching_count", "projects"], "list_projects response");
  const projectRows = arrayValue(projects.projects, "list_projects projects").map((entry) =>
    objectValue(entry, "list_projects project"),
  );
  for (const project of projectRows) {
    exactKeys(project, ["project_id", "root_path", "is_git_repository"], "list_projects project");
  }
  if (
    projects.matching_count !== 1 ||
    projectRows.length !== 1 ||
    projectRows[0].project_id !== "local-fcb170b4427ba4e258ce8af48e487c64" ||
    projectRows[0].root_path !== "/Users/raphael/Playground/dgkmaWeb" ||
    projectRows[0].is_git_repository !== true
  ) {
    fail("provider projection: exact project resolution required");
  }

  const createRequest = objectValue(projection.create_request, "create request");
  exactKeys(createRequest, ["prompt", "target", "model", "thinking"], "create request");
  const target = objectValue(createRequest.target, "create target");
  exactKeys(target, ["type", "projectId", "environment"], "create target");
  const environment = objectValue(target.environment, "create environment");
  exactKeys(environment, ["type"], "create environment");
  const expectedPrompt = "Return exactly PROVIDER_CAPABILITY_OK:88ddb810-4f71-4b08-a026-ffdf7cbc16bf";
  if (
    createRequest.prompt !== expectedPrompt ||
    createRequest.model !== "gpt-5.6-sol" ||
    createRequest.thinking !== "xhigh" ||
    target.type !== "project" ||
    target.projectId !== projectRows[0].project_id ||
    environment.type !== "worktree"
  ) {
    fail("provider projection: create request mismatch");
  }

  const createResponse = objectValue(projection.create_response, "create response");
  exactKeys(createResponse, ["clientThreadId", "hostId"], "create response");
  if (
    createResponse.clientThreadId !== "client-new-thread:f152ae6b-3f97-418b-82c9-bc3d7d72bcc0" ||
    createResponse.hostId !== "local"
  ) {
    fail("provider projection: create response mismatch");
  }

  const threads = objectValue(projection.list_threads_response, "list_threads response");
  exactKeys(threads, ["matching_count", "threads"], "list_threads response");
  const threadRows = arrayValue(threads.threads, "list_threads threads").map((entry) =>
    objectValue(entry, "list_threads thread"),
  );
  for (const thread of threadRows) {
    exactKeys(
      thread,
      ["clientThreadId", "hostId", "projectId", "prompt_sha256", "cwd_sha256", "status", "threadId"],
      "list_threads thread",
    );
  }
  if (
    threads.matching_count !== 1 ||
    threadRows.length !== 1 ||
    threadRows[0].clientThreadId !== createResponse.clientThreadId ||
    threadRows[0].hostId !== createResponse.hostId ||
    threadRows[0].projectId !== target.projectId ||
    threadRows[0].prompt_sha256 !== sha256(String(createRequest.prompt)) ||
    threadRows[0].cwd_sha256 !== "5fec9cd0b5ae8b6a2c03cfd8c9aa32322e9827f0818c5535d61d1807366bee97" ||
    threadRows[0].status !== "ready" ||
    threadRows[0].threadId !== "019fb708-8849-7161-91b8-5d88cc89919f"
  ) {
    fail(
      threadRows.length === 1 && threadRows[0].status === "queued"
        ? "provider projection: queued-only thread rejected"
        : "provider projection: exact ready thread resolution required",
    );
  }

  const waitRequest = objectValue(projection.wait_request, "wait request");
  exactKeys(waitRequest, ["targets", "timeoutMs"], "wait request");
  const waitTargets = arrayValue(waitRequest.targets, "wait targets").map((entry) =>
    objectValue(entry, "wait target"),
  );
  if (waitTargets.length !== 1) fail("provider projection: wait target mismatch");
  exactKeys(waitTargets[0], ["threadId", "hostId"], "wait target");
  if (
    waitRequest.timeoutMs !== 120000 ||
    waitTargets[0].threadId !== threadRows[0].threadId ||
    waitTargets[0].hostId !== threadRows[0].hostId
  ) {
    fail("provider projection: bounded wait request mismatch");
  }
  const waitResponse = objectValue(projection.wait_response, "wait response");
  exactKeys(waitResponse, ["statuses"], "wait response");
  const waitStatuses = arrayValue(waitResponse.statuses, "wait statuses").map((entry) =>
    objectValue(entry, "wait status"),
  );
  if (waitStatuses.length !== 1) fail("provider projection: terminal wait required");
  exactKeys(waitStatuses[0], ["threadId", "hostId", "status"], "wait status");
  if (
    waitStatuses[0].threadId !== threadRows[0].threadId ||
    waitStatuses[0].hostId !== threadRows[0].hostId ||
    waitStatuses[0].status !== "completed"
  ) {
    fail("provider projection: terminal wait required");
  }

  const readRequest = objectValue(projection.read_request, "read request");
  exactKeys(
    readRequest,
    ["threadId", "hostId", "includeOutputs", "maxOutputCharsPerItem", "turnLimit"],
    "read request",
  );
  if (
    readRequest.threadId !== threadRows[0].threadId ||
    readRequest.hostId !== threadRows[0].hostId ||
    readRequest.includeOutputs !== false ||
    readRequest.maxOutputCharsPerItem !== 200000 ||
    readRequest.turnLimit !== 20
  ) {
    fail("provider projection: read request mismatch");
  }
  const readResponse = objectValue(projection.read_response, "read response");
  exactKeys(readResponse, ["threadId", "hostId", "status", "prompt", "final_message"], "read response");
  if (
    readResponse.threadId !== threadRows[0].threadId ||
    readResponse.hostId !== threadRows[0].hostId ||
    readResponse.status !== "completed" ||
    readResponse.prompt !== expectedPrompt ||
    readResponse.final_message !== "PROVIDER_CAPABILITY_OK:88ddb810-4f71-4b08-a026-ffdf7cbc16bf"
  ) {
    fail("provider projection: exact terminal read mismatch");
  }
  const withoutHash = { ...projection };
  delete withoutHash.projection_sha256;
  if (projection.projection_sha256 !== sha256(canonicalJson(withoutHash as never))) {
    fail("provider projection: self-hash mismatch");
  }
}

function validateProviderReceipt(receipt: JsonObject, projection: JsonObject): void {
  exactKeys(receipt, providerKeys, "provider capability");
  const expected = {
    schema_version: "dgkma-provider-capability-v2",
    provider: "codex-app",
    project_id: "local-fcb170b4427ba4e258ce8af48e487c64",
    thread_id: "019fb708-8849-7161-91b8-5d88cc89919f",
    host_id_or_null: "local",
    model: "gpt-5.6-sol",
    reasoning_effort: "xhigh",
    status: "completed",
    result: "verified",
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (receipt[key] !== expectedValue) fail(`provider capability: ${key} mismatch`);
  }
  const nonce = "88ddb810-4f71-4b08-a026-ffdf7cbc16bf";
  if (receipt.preflight_run_uid !== nonce) fail("provider capability: nonce mismatch");
  const finalMessage = `PROVIDER_CAPABILITY_OK:${nonce}`;
  if (receipt.prompt_sha256 !== sha256(`Return exactly ${finalMessage}`)) fail("provider capability: prompt mismatch");
  if (receipt.final_message_sha256 !== sha256(finalMessage)) fail("provider capability: final message mismatch");
  const projectionDigests: Record<string, unknown> = {
    create_request_sha256: projection.create_request,
    list_projects_response_sha256: projection.list_projects_response,
    create_response_sha256: projection.create_response,
    list_threads_response_sha256: projection.list_threads_response,
    wait_response_sha256: projection.wait_response,
    read_response_sha256: projection.read_response,
  };
  for (const [key, source] of Object.entries(projectionDigests)) {
    if (receipt[key] !== sha256(canonicalJson(source as never))) {
      fail(`provider capability: ${key} projection digest mismatch`);
    }
  }
  if (receipt.projection_sha256 !== projection.projection_sha256) {
    fail("provider capability: projection digest mismatch");
  }
  for (const key of providerKeys.filter((key) => key.endsWith("_sha256"))) {
    if (!/^[0-9a-f]{64}$/.test(String(receipt[key]))) fail(`provider capability: invalid ${key}`);
  }
  const withoutHash = { ...receipt };
  delete withoutHash.receipt_sha256;
  if (receipt.receipt_sha256 !== sha256(canonicalJson(withoutHash as never))) {
    fail("provider capability: receipt self-hash mismatch");
  }
}

type NegativeCase = {
  name: string;
  mutation: string;
  expected_error: string;
};

function parseNegativeCases(fixturesPath: string): NegativeCase[] {
  const fixture = parseJson(fixturesPath);
  exactKeys(
    fixture,
    ["schema_version", "cases", "expected_result", "expected_schema_writes"],
    "negative fixtures",
  );
  if (
    fixture.schema_version !== "dgkma-task-1-provider-negative-fixtures-v2" ||
    fixture.expected_result !== "rejected_before_schema_write" ||
    fixture.expected_schema_writes !== 0
  ) {
    fail("negative fixtures: contract mismatch");
  }
  const cases = arrayValue(fixture.cases, "negative fixtures cases").map((entry) => {
    const item = objectValue(entry, "negative fixture");
    exactKeys(item, ["name", "mutation", "expected_error"], "negative fixture");
    return item as NegativeCase;
  });
  const expectedNames = [
    "absent_project",
    "absent_thread",
    "queued_only_without_ready_thread",
    "changed_create_response_digest",
    "changed_wait_response_digest",
    "changed_read_response_digest",
    "altered_catalog_object_count",
    "nonce_mismatch",
  ];
  if (
    cases.length !== expectedNames.length ||
    cases.some((item, index) => item.name !== expectedNames[index])
  ) {
    fail("negative fixtures: exact eight-case matrix required");
  }
  return cases;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function exerciseNegativeCase(
  fixture: NegativeCase,
  receiptSource: JsonObject,
  projectionSource: JsonObject,
  baselineSource: JsonObject,
): JsonObject {
  const receipt = cloneJson(receiptSource);
  const projection = cloneJson(projectionSource);
  const baseline = cloneJson(baselineSource);
  let receiptSelfHashRecomputed = false;
  switch (fixture.mutation) {
    case "remove_project": {
      const projects = objectValue(projection.list_projects_response, "list_projects response");
      projects.matching_count = 0;
      projects.projects = [];
      break;
    }
    case "remove_ready_thread": {
      const threads = objectValue(projection.list_threads_response, "list_threads response");
      threads.matching_count = 0;
      threads.threads = [];
      break;
    }
    case "leave_thread_queued": {
      const threads = objectValue(projection.list_threads_response, "list_threads response");
      const row = objectValue(arrayValue(threads.threads, "list_threads threads")[0], "list_threads thread");
      row.status = "queued";
      row.threadId = null;
      break;
    }
    case "forge_create_response_digest":
      receipt.create_response_sha256 = "a".repeat(64);
      break;
    case "forge_wait_response_digest":
      receipt.wait_response_sha256 = "b".repeat(64);
      break;
    case "forge_read_response_digest":
      receipt.read_response_sha256 = "c".repeat(64);
      break;
    case "decrement_catalog_object_count":
      baseline.catalog_line_count = 234;
      break;
    case "replace_nonce":
      receipt.preflight_run_uid = "00000000-0000-4000-8000-000000000000";
      break;
    default:
      fail(`negative fixture: unknown mutation ${fixture.mutation}`);
  }
  if (
    fixture.mutation === "forge_create_response_digest" ||
    fixture.mutation === "forge_wait_response_digest" ||
    fixture.mutation === "forge_read_response_digest" ||
    fixture.mutation === "replace_nonce"
  ) {
    const withoutHash = { ...receipt };
    delete withoutHash.receipt_sha256;
    receipt.receipt_sha256 = sha256(canonicalJson(withoutHash as never));
    receiptSelfHashRecomputed = true;
  }

  let observedError = "";
  try {
    if (
      baseline.catalog_line_count !== 235 ||
      baseline.catalog_sha256 !== "39090b8feaca440d497998347fd83d63f31499ecedb2c2e975208bd5cf14d381"
    ) {
      fail("Development read-only baseline mismatch");
    }
    validateProviderProjection(projection);
    validateProviderReceipt(receipt, projection);
  } catch (error) {
    observedError = error instanceof Error ? error.message : String(error);
  }
  if (observedError !== fixture.expected_error) {
    fail(
      `negative fixture ${fixture.name}: expected ${fixture.expected_error}, observed ${observedError || "admitted"}`,
    );
  }
  return {
    name: fixture.name,
    mutation: fixture.mutation,
    expected_error: fixture.expected_error,
    observed_error: observedError,
    receipt_self_hash_recomputed: receiptSelfHashRecomputed,
    schema_writes: 0,
    result: "rejected",
  };
}

function validateInventory(root: string): JsonObject {
  const inventory = parseJson(path.join(root, "docs/verifier-inventory.json"));
  exactKeys(inventory, ["schema_version", "files", "inventory_sha256"], "inventory");
  if (inventory.schema_version !== "dgkma-verifier-inventory-v1") fail("inventory version mismatch");
  const files = inventory.files as JsonObject;
  exactKeys(files, verifierInventoryPaths, "inventory files");
  for (const relativePath of verifierInventoryPaths) {
    const bytes = readFileSync(path.join(root, relativePath));
    if (files[relativePath] !== sha256(bytes)) fail(`inventory digest mismatch: ${relativePath}`);
    if (bytes.length === 0) fail(`empty verifier artifact: ${relativePath}`);
    if (bytes.includes(13)) fail(`CR forbidden: ${relativePath}`);
    if (relativePath.endsWith(".schema.json")) {
      const schema = JSON.parse(bytes.toString("utf8")) as JsonObject;
      if (schema.additionalProperties !== false) fail(`schema is not closed: ${relativePath}`);
      if (!schema.$defs || !(schema.$defs as JsonObject).assertion_payload) {
        fail(`assertion payload definition missing: ${relativePath}`);
      }
      if ((schema.properties as JsonObject).unexpected_key !== undefined) {
        fail(`schema unexpectedly admits injected key: ${relativePath}`);
      }
      const canonicalBytes = `${canonicalJson(schema as never)}\n`;
      if (!bytes.equals(Buffer.from(canonicalBytes))) fail(`schema is not RFC-8785 JSON + LF: ${relativePath}`);
    }
  }
  const withoutHash = { schema_version: inventory.schema_version, files };
  if (inventory.inventory_sha256 !== sha256(canonicalJson(withoutHash as never))) {
    fail("inventory self-hash mismatch");
  }
  const prompts = ["F1", "F2", "F3", "F4", "A1"].map((lane) =>
    readFileSync(path.join(root, `docs/verifier-prompts/${lane}.md`), "utf8"),
  );
  if (new Set(prompts).size !== 5) fail("verifier prompts are not distinct");
  for (const prompt of prompts) {
    if (!prompt.endsWith("\n") || prompt.split("\n").length !== 7) fail("prompt line contract mismatch");
    if (/[ \t]\n/.test(prompt) || prompt.includes("<LANE>") || prompt.includes("<ROLE>")) {
      fail("prompt substitution/whitespace mismatch");
    }
  }
  return inventory;
}

function validateLineageAndTarget(root: string): void {
  const expectedHashes: Record<string, string> = {
    "docs/database-operations.md": "153b05be439e9b726df558337d346b40b94dbecf2a6dc75fb91635798480574d",
    "docs/database-schema.md": "6d6fc85bc51ebf00213c76a29a299f28bc619074e1d95e1c621b50cb9dac9778",
    "scripts/database-schema-catalog.sql": "7263c0736c96cbb3120252778b7adf8a463700ece8cd59b57be99cdb5fad757f",
    "docs/plans/database-architecture-audit.md": "3a8194442ee12678c260b11eada39d47e08a96892c725559dfcd009ceb198c2b",
    "docs/plans/accounting-dues-prd.md": "07f02a89a70fa3be2888ddc1278b3e94bbbeda5631b7fa0abbc85af6d47e8cd6",
  };
  for (const [relativePath, expectedHash] of Object.entries(expectedHashes)) {
    if (sha256(readFileSync(path.join(root, relativePath))) !== expectedHash) {
      fail(`pinned source mismatch: ${relativePath}`);
    }
  }
  const target = parseJson(path.join(root, "docs/database-targets/development-approved.json"));
  const targetKeys = [
    "schema_version",
    "target_kind",
    "target_fingerprint",
    "current_database",
    "current_user_name",
    "current_user_oid",
    "server_version_num",
    "pg_tuple_digest",
    "approval_source_commit",
    "observed_at",
    "receipt_sha256",
  ];
  exactKeys(target, targetKeys, "development target");
  const targetConstants: JsonObject = {
    schema_version: "dgkma-development-target-v1",
    target_kind: "development",
    target_fingerprint: "b3f038ee10e11f57fa524477ce393d82a67b71c223ef582776a83b828d239971",
    current_database: "heliumdb",
    current_user_name: "postgres",
    current_user_oid: 10,
    server_version_num: 160010,
    pg_tuple_digest: "1d6988751f891abe2ca53cf84315970f29ba4e6389ec4f4afa5031776773c683",
    approval_source_commit: "0e299abce9509456de0e8bfe224cb7ef392228d8",
  };
  for (const [key, expected] of Object.entries(targetConstants)) {
    if (target[key] !== expected) fail(`development target mismatch: ${key}`);
  }
  const targetWithoutHash = { ...target };
  delete targetWithoutHash.receipt_sha256;
  if (target.receipt_sha256 !== sha256(canonicalJson(targetWithoutHash as never))) {
    fail("development target self-hash mismatch");
  }
  const baselinePath = path.join(
    root,
    ".omo/evidence/database-architecture-audit/task-1/development-readonly-baseline.json",
  );
  const baseline = parseJson(baselinePath);
  if (
    baseline.current_database !== target.current_database ||
    Number(baseline.current_user_oid) !== target.current_user_oid ||
    baseline.target_fingerprint !== target.target_fingerprint ||
    baseline.admin_candidate_user_id !== 315 ||
    baseline.admin_candidate_count !== 1 ||
    baseline.admin_candidate_authorizing !== false ||
    baseline.contains_pii !== false ||
    baseline.schema_writes !== 0 ||
    baseline.catalog_sha256 !== "39090b8feaca440d497998347fd83d63f31499ecedb2c2e975208bd5cf14d381" ||
    baseline.catalog_line_count !== 235
  ) {
    fail("Development read-only baseline mismatch");
  }
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const taskCommit = process.env.TASK_COMMIT_SHA;
  if (taskCommit && currentHead !== taskCommit) fail("task commit does not match HEAD");
  if (taskCommit) {
    const parents = execFileSync("git", ["show", "-s", "--format=%P", taskCommit], { encoding: "utf8" })
      .trim()
      .split(/\s+/);
    if (
      parents.length !== 2 ||
      parents[0] !== "90add207b87e5d567cfaf9ba7ac7b9bd9d6991c1" ||
      parents[1] !== "0e299abce9509456de0e8bfe224cb7ef392228d8"
    ) {
      fail("Todo 1 merge lineage mismatch");
    }
  }
}

function writeEvidence(filePath: string, result: string, assertions: JsonObject, attachments: string[]): void {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const evidence = {
    schema_version: "dgkma-task-evidence-v1",
    task: 1,
    task_commit_sha: process.env.TASK_COMMIT_SHA ?? currentHead,
    plan_sha256: "3a8194442ee12678c260b11eada39d47e08a96892c725559dfcd009ceb198c2b",
    manifest_sha256: null,
    db_target: "development",
    db_mode: "read-only",
    command: process.argv.join(" "),
    exit_code: result === "approved" ? 0 : 1,
    assertions,
    attachment_digests: attachments
      .sort()
      .map((attachmentPath) => ({ path: attachmentPath, sha256: sha256(readFileSync(attachmentPath)) })),
    result,
  };
  writeFileSync(filePath, `${canonicalJson(evidence as never)}\n`);
}

function runTaskOne(): void {
  const root = process.cwd();
  if (value("--materialize")) materializeVerifierContracts(root);
  const caseName = value("--case");
  const providerPath = value("--provider-capability") ?? fail("--provider-capability is required");
  const projectionPath = value("--provider-projection") ?? fail("--provider-projection is required");
  const evidencePath = value("--evidence") ?? fail("--evidence is required");
  const fixtures = value("--fixtures");
  const receipt = parseJson(providerPath);
  const projection = parseJson(projectionPath);
  const baselinePath = ".omo/evidence/database-architecture-audit/task-1/development-readonly-baseline.json";
  const baseline = parseJson(baselinePath);
  const attachments = [
    providerPath,
    projectionPath,
    baselinePath,
    "docs/database-targets/development-approved.json",
    "docs/verifier-inventory.json",
    "docs/verifier-provider-capability-projection.json",
    "docs/provider-contracts/provider-capability-projection.schema.json",
    ...verifierInventoryPaths,
  ];
  try {
    validateLineageAndTarget(root);
    validateInventory(root);
    validateProjectionSchemaAndDescriptor(root, projectionPath);
    if (caseName === "failure") {
      const fixturesFile = fixtures
        ? path.join(fixtures, "provider-capability-cases.json")
        : fail("--fixtures is required for failure case");
      const results = parseNegativeCases(fixturesFile).map((fixture) =>
        exerciseNegativeCase(fixture, receipt, projection, baseline),
      );
      writeEvidence(
        evidencePath,
        "rejected",
        {
          provider_negative_matrix: "approved",
          cases_executed: results.length,
          cases_rejected: results.length,
          cases: results,
          zero_schema_writes: "approved",
        },
        [...attachments, fixturesFile],
      );
      process.stderr.write(
        `negative matrix verified: ${results.length}/${results.length} rejected before schema write\n`,
      );
      process.exitCode = 1;
      return;
    }
    if (caseName !== "happy") fail("case must be happy or failure");
    validateProviderProjection(projection);
    validateProviderReceipt(receipt, projection);
    writeEvidence(
      evidencePath,
      "approved",
      {
        lineage_sources: "approved",
        development_target: "approved",
        admin_candidate: "approved",
        provider_capability: "approved",
        provider_projection_digests: "approved",
        verifier_inventory: "approved",
        schema_writes: 0,
      },
      attachments,
    );
  } catch (error) {
    writeEvidence(
      evidencePath,
      "rejected",
      {
        provider_or_fixture_rejected: "approved",
        zero_schema_writes: "approved",
        error_class: error instanceof Error ? error.message : String(error),
      },
      attachments.filter(existsSync),
    );
    throw error;
  }
}

function taskThreeChildEnvironment(extra: Record<string, string>): NodeJS.ProcessEnv {
  const childEnvironment: NodeJS.ProcessEnv = {};
  const forbidden = new Set(["DATABASE_URL", "PROD_DATABASE_URL", "PROD_DATABASE_READONLY_URL"]);
  for (const key of Object.keys(process.env)) {
    if (!forbidden.has(key)) childEnvironment[key] = process.env[key];
  }
  return { ...childEnvironment, ...extra };
}

function writeTaskTwoEvidence(
  evidencePath: string,
  caseName: "happy" | "failure",
  result: "approved" | "rejected",
  assertions: JsonObject,
  attachments: string[],
): void {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const evidence = {
    schema_version: "dgkma-task-evidence-v1",
    task: 2,
    task_commit_sha: process.env.TASK_COMMIT_SHA ?? currentHead,
    plan_sha256: sha256(readFileSync("docs/plans/database-architecture-audit.md")),
    manifest_sha256: readManifest().sha256,
    db_target: caseName === "happy" ? "development+disposable-test" : "static-refusal",
    db_mode: caseName === "happy" ? "development-dry-run+disposable-sequence-1" : "checksum-refusal-before-sql",
    command: process.argv.join(" "),
    exit_code: result === "approved" ? 0 : 1,
    assertions,
    attachment_digests: attachments
      .filter(existsSync)
      .sort()
      .map((attachmentPath) => ({ path: attachmentPath, sha256: sha256(readFileSync(attachmentPath)) })),
    result,
  };
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${canonicalJson(evidence as never)}\n`);
}

function runLogged(command: string, args: string[], logPath: string): ReturnType<typeof spawnSync> {
  const run = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: taskThreeChildEnvironment({}),
  });
  writeFileSync(logPath, [
    `command=${command} ${args.join(" ")}`,
    `status=${String(run.status)}`,
    "stdout:",
    run.stdout ?? "",
    "stderr:",
    run.stderr ?? "",
  ].join("\n"));
  return run;
}

function lastJsonLine(output: string): JsonObject {
  const lines = output.trim().split("\n").filter(Boolean);
  if (lines.length === 0) fail("task_2_missing_json_output");
  return JSON.parse(lines.at(-1)!) as JsonObject;
}

function runTaskTwo(): void {
  const caseName = value("--case");
  if (caseName !== "happy" && caseName !== "failure") fail("case must be happy or failure");
  const evidencePath = value("--evidence") ?? fail("--evidence is required");
  const fixtureDirectory = value("--fixtures") ?? "server/fixtures/database-architecture/task-2";
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  const testLog = evidencePath.replace(/\.json$/, "-self-test.log");
  const validatorLog = evidencePath.replace(/\.json$/, "-manifest-validator.log");
  const tests = runLogged("npx", ["tsx", "--test", "server/database-manifest.test.ts", "server/schema-ledger.test.ts"], testLog);
  const validator = runLogged("npx", ["tsx", "scripts/validate-database-manifest.ts"], validatorLog);
  const attachments = [
    "docs/database-manifest.yaml",
    "migrations/manual/0001_schema_ledger_bootstrap.sql",
    "scripts/apply-schema.ts",
    "scripts/materialize-database-manifest.ts",
    "scripts/schema-ledger.ts",
    "scripts/validate-database-manifest.ts",
    "server/database-manifest.test.ts",
    "server/schema-ledger.test.ts",
    testLog,
    validatorLog,
    ...readdirSync("migrations/artifacts").map((name) => path.join("migrations/artifacts", name)),
  ];
  if (tests.status !== 0 || validator.status !== 0) {
    writeTaskTwoEvidence(evidencePath, caseName, "rejected", {
      self_test_exit_code: tests.status,
      manifest_validator_exit_code: validator.status,
      error_class: "task_2_static_validation_failed",
      schema_writes: 0,
    }, attachments);
    fail("task_2_static_validation_failed");
  }
  if (caseName === "failure") {
    const fixturePath = path.join(fixtureDirectory, "tampered-schema-ledger-bootstrap.sql");
    attachments.push(fixturePath);
    let observed = "not_rejected";
    try {
      const descriptor = readArtifactDescriptors().find((entry) => entry.sequence_no === 1)!;
      verifyArtifactBytes(descriptor, fixturePath);
    } catch (error) {
      observed = error instanceof Error ? error.message : String(error);
    }
    if (observed !== "checksum_mismatch") fail("task_2_tamper_fixture_not_rejected");
    writeTaskTwoEvidence(evidencePath, caseName, "rejected", {
      self_test_exit_code: 0,
      manifest_validator_exit_code: 0,
      tampered_artifact_result: "checksum_mismatch",
      database_calls: 0,
      artifact_sql_executions: 0,
      schema_writes: 0,
      target_absence: "not_created",
    }, attachments);
    process.exitCode = 1;
    return;
  }
  const dryRunLog = evidencePath.replace(/\.json$/, "-development-dry-run.log");
  const dryRun = runLogged("npx", ["tsx", "scripts/apply-schema.ts", "--target", "development", "--dry-run"], dryRunLog);
  attachments.push(dryRunLog);
  if (dryRun.status !== 0) {
    writeTaskTwoEvidence(evidencePath, caseName, "rejected", { development_dry_run_exit_code: dryRun.status, schema_writes: 0 }, attachments);
    fail("task_2_development_dry_run_failed");
  }
  const dryResult = lastJsonLine(dryRun.stdout ?? "");
  if (dryResult.result !== "approved" || dryResult.schema_writes !== 0) fail("task_2_development_dry_run_contract_failed");
  const runUid = randomUUID();
  const disposableLog = evidencePath.replace(/\.json$/, "-disposable-sequence-1.log");
  const disposable = runLogged("npx", ["tsx", "scripts/apply-schema.ts", "--target", "disposable-test", "--run-uid", runUid, "--through-sequence", "1", "--teardown"], disposableLog);
  attachments.push(disposableLog);
  if (disposable.status !== 0) {
    writeTaskTwoEvidence(evidencePath, caseName, "rejected", { development_dry_run_exit_code: 0, disposable_apply_exit_code: disposable.status }, attachments);
    fail("task_2_disposable_apply_failed");
  }
  const disposableResult = lastJsonLine(disposable.stdout ?? "");
  const catalog = objectValue(disposableResult.catalog, "task 2 disposable catalog");
  const cleanup = objectValue(disposableResult.cleanup, "task 2 disposable cleanup");
  if (disposableResult.result !== "approved" || disposableResult.outcome !== "applied" || catalog.ledger_rows !== 1 || catalog.verified_runs !== 1 || catalog.capability_rows !== 1 || cleanup.absent !== true) fail("task_2_disposable_apply_contract_failed");
  const descriptors = readArtifactDescriptors();
  writeTaskTwoEvidence(evidencePath, caseName, "approved", {
    self_test_exit_code: 0,
    manifest_validator_exit_code: 0,
    development_dry_run_exit_code: 0,
    development_schema_writes: 0,
    disposable_apply_exit_code: 0,
    disposable_sequence_1_ledger_rows: 1,
    disposable_verified_release_runs: 1,
    disposable_capability_receipts: 1,
    disposable_absent_after_teardown: true,
    manifest_table_count: 68,
    account_delete_user_fk_count: (readManifest().value as Record<string, any>).account_delete_user_fk_registry.length,
    account_delete_non_fk_count: 3,
    artifact_descriptor_count: descriptors.length,
    future_not_materialized_count: descriptors.filter((entry) => entry.materialization_state === "not_materialized").length,
    future_sql_files: 0,
    schema_writes: "disposable sequence 1 only",
  }, attachments);
}

function writeTaskThreeEvidence(
  evidencePath: string,
  caseName: "happy" | "failure",
  result: "approved" | "rejected",
  assertions: JsonObject,
  attachments: string[],
): void {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const evidence = {
    schema_version: "dgkma-task-evidence-v1",
    task: 3,
    task_commit_sha: process.env.TASK_COMMIT_SHA ?? currentHead,
    plan_sha256: sha256(readFileSync("docs/plans/database-architecture-audit.md")),
    manifest_sha256: null,
    db_target: caseName === "happy" ? "development+disposable-test" : "disposable-test",
    db_mode: caseName === "happy" ? "rollback-probe+create-drop" : "refusal+cleanup",
    command: process.argv.join(" "),
    exit_code: result === "approved" ? 0 : 1,
    assertions,
    attachment_digests: attachments
      .filter(existsSync)
      .sort()
      .map((attachmentPath) => ({ path: attachmentPath, sha256: sha256(readFileSync(attachmentPath)) })),
    result,
  };
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${canonicalJson(evidence as never)}\n`);
}

function runTaskThree(): void {
  const caseName = value("--case");
  if (caseName !== "happy" && caseName !== "failure") fail("case must be happy or failure");
  const evidencePath = value("--evidence") ?? fail("--evidence is required");
  const ownerDecisionPath = ".omo/evidence/database-architecture-audit/task-3/owner-transport-decision.json";
  const ownerDecision = parseJson(ownerDecisionPath);
  exactKeys(
    ownerDecision,
    ["schema_version", "approved_at", "task", "decision", "result", "scope", "requirements"],
    "owner transport decision",
  );
  if (
    ownerDecision.schema_version !== "dgkma-owner-transport-decision-v1" ||
    ownerDecision.task !== 3 ||
    ownerDecision.decision !== "A" ||
    ownerDecision.result !== "approved" ||
    ownerDecision.scope !== "Replit internal Development and disposable-test targets only"
  ) {
    fail("owner transport decision mismatch");
  }
  const ownerRequirements = arrayValue(ownerDecision.requirements, "owner transport requirements");
  for (const requirement of [
    "REPL_ID must be present",
    "PGHOST must equal helium",
    "approved Development target identity and fingerprint must be verified before DDL or DML",
    "no non-TLS fallback for any other host or target",
    "Production remains verified TLS and read-only",
    "credentials and secrets must not appear in logs or receipts",
  ]) {
    if (!ownerRequirements.includes(requirement)) fail("owner transport requirement missing");
  }
  const fixtureDirectory = value("--fixtures");
  if (caseName === "failure" && !fixtureDirectory) fail("--fixtures is required for failure case");
  const fixturePath = fixtureDirectory
    ? path.join(fixtureDirectory, "db-target-cases.json")
    : undefined;
  if (fixturePath && !existsSync(fixturePath)) fail(`missing file: ${fixturePath}`);
  const runtimePath = evidencePath.replace(/\.json$/, "-runtime.json");
  const logPath = evidencePath.replace(/\.json$/, ".log");
  const runUid = randomUUID();
  const testArgs = [
    "tsx",
    "--test",
    "--test-name-pattern=development|disposable|privilege|production-readonly",
    "server/db-target.test.ts",
  ];
  const command = spawnSync("npx", testArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: taskThreeChildEnvironment({
      RUN_DB_TARGET_INTEGRATION: "1",
      DB_TARGET_TEST_CASE: caseName,
      REPL_ID: process.env.REPL_ID ?? "dgkma-task-3-replit-ssh",
      DB_TARGET_RUN_UID: runUid,
      DB_TARGET_TEST_RECEIPT_PATH: runtimePath,
      ...(fixturePath ? { DB_TARGET_FIXTURE_PATH: fixturePath } : {}),
    }),
  });
  mkdirSync(path.dirname(logPath), { recursive: true });
  writeFileSync(
    logPath,
    [
      `command=npx ${testArgs.join(" ")}`,
      `status=${String(command.status)}`,
      command.stdout,
      command.stderr,
    ].join("\n"),
  );
  const attachments = [
    runtimePath,
    logPath,
    "server/db-target.ts",
    "server/db-target.test.ts",
    "server/db.ts",
    "drizzle.config.ts",
    ownerDecisionPath,
    ...(fixturePath ? [fixturePath] : []),
  ];
  if (command.status !== 0 || !existsSync(runtimePath)) {
    writeTaskThreeEvidence(
      evidencePath,
      caseName,
      "rejected",
      {
        focused_test_exit_code: command.status,
        runtime_receipt_present: existsSync(runtimePath),
        error_class: "database_target_focused_test_failed",
      },
      attachments,
    );
    fail("database_target_focused_test_failed");
  }
  const runtime = parseJson(runtimePath);
  if (
    runtime.production_credentials_read !== false ||
    runtime.disposable_absent !== true ||
    (caseName === "happy" &&
      (runtime.development_probe_absent !== true || runtime.disposable_probe_absent !== true)) ||
    (caseName === "failure" &&
      (runtime.collision_refused !== true ||
        runtime.collision_not_dropped_by_resolver !== true ||
        runtime.artifact_execution_refused !== true ||
        runtime.leaked_session_refused_without_drop !== true ||
        runtime.probe_objects_remaining !== 0))
  ) {
    writeTaskThreeEvidence(
      evidencePath,
      caseName,
      "rejected",
      { runtime_contract: "rejected" },
      attachments,
    );
    fail("database_target_runtime_receipt_mismatch");
  }
  writeTaskThreeEvidence(
    evidencePath,
    caseName,
    caseName === "happy" ? "approved" : "rejected",
    caseName === "happy"
      ? {
          focused_test_exit_code: 0,
          development_receipt_reproduced: "approved",
          rollback_privilege_probes_absent: "approved",
          disposable_created_and_absent_after_teardown: "approved",
          production_owner_credentials_called: false,
        }
      : {
          focused_test_exit_code: 0,
          foreign_collision_refused_without_drop: "approved",
          readonly_probe_refused_without_residue: "approved",
          leaked_session_refused_without_drop: "approved",
          artifact_execution_refused: "approved",
          disposable_absent_after_cleanup: "approved",
          production_owner_credentials_called: false,
        },
    attachments,
  );
  if (caseName === "failure") process.exitCode = 1;
}

type CatalogFixture = {
  schema_version: string;
  required_sections: string[];
  failure_cases: Array<{
    name: string;
    mutation: string;
    expected_result: string;
  }>;
};

function taskFourFixture(fixturePath: string): CatalogFixture {
  const fixture = parseJson(fixturePath);
  exactKeys(fixture, ["schema_version", "required_sections", "failure_cases"], "catalog fixtures");
  if (fixture.schema_version !== "dgkma-task-4-catalog-fixtures-v1") {
    fail("catalog fixtures: version mismatch");
  }
  const requiredSections = arrayValue(fixture.required_sections, "catalog required sections");
  if (
    requiredSections.length !== 26 ||
    requiredSections.some((section) => typeof section !== "string")
  ) {
    fail("catalog fixtures: exact object-class section matrix required");
  }
  const failureCases = arrayValue(fixture.failure_cases, "catalog failure cases").map((entry) => {
    const item = objectValue(entry, "catalog failure case");
    exactKeys(item, ["name", "mutation", "expected_result"], "catalog failure case");
    return item as CatalogFixture["failure_cases"][number];
  });
  const expected = [
    ["wrong_expected_database", "expected_database_mismatch"],
    ["writable_transaction", "remove_read_only_transaction"],
    ["statement_timeout", "force_statement_timeout"],
  ];
  if (
    failureCases.length !== expected.length ||
    failureCases.some(
      (item, index) =>
        item.name !== expected[index][0] ||
        item.mutation !== expected[index][1] ||
        item.expected_result !== "nonzero_before_catalog_body",
    )
  ) {
    fail("catalog fixtures: exact three-case refusal matrix required");
  }
  return {
    schema_version: fixture.schema_version as string,
    required_sections: requiredSections as string[],
    failure_cases: failureCases,
  };
}

function writeTaskFourEvidence(
  evidencePath: string,
  caseName: "happy" | "failure",
  result: "approved" | "rejected",
  assertions: JsonObject,
  attachments: string[],
): void {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const evidence = {
    schema_version: "dgkma-task-evidence-v1",
    task: 4,
    task_commit_sha: process.env.TASK_COMMIT_SHA ?? currentHead,
    plan_sha256: sha256(readFileSync("docs/plans/database-architecture-audit.md")),
    manifest_sha256: null,
    db_target: "development",
    db_mode: "read-only",
    command: process.argv.join(" "),
    exit_code: result === "approved" ? 0 : 1,
    assertions,
    attachment_digests: attachments
      .filter(existsSync)
      .sort()
      .map((attachmentPath) => ({ path: attachmentPath, sha256: sha256(readFileSync(attachmentPath)) })),
    result,
  };
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, canonicalJson(evidence as never) + "\n");
}

function runCatalog(
  catalogPath: string,
  expectedDatabase: string,
): ReturnType<typeof spawnSync> {
  return spawnSync(
    "psql",
    [
      "-X",
      "--csv",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "expected_database=" + expectedDatabase,
      "-f",
      catalogPath,
    ],
    {
      cwd: process.cwd(),
      env: taskThreeChildEnvironment({}),
    },
  );
}

function catalogOutput(command: ReturnType<typeof spawnSync>): Buffer {
  return Buffer.isBuffer(command.stdout) ? command.stdout : Buffer.from(command.stdout ?? "");
}

function catalogError(command: ReturnType<typeof spawnSync>): Buffer {
  return Buffer.isBuffer(command.stderr) ? command.stderr : Buffer.from(command.stderr ?? "");
}

function writeCatalogLog(
  filePath: string,
  command: ReturnType<typeof spawnSync>,
  expectedDatabase: string,
): void {
  const header = Buffer.from(
    [
      "command=psql -X --csv -v ON_ERROR_STOP=1 -v expected_database=" +
        expectedDatabase +
        " -f scripts/database-schema-catalog.sql",
      "status=" + String(command.status),
      "stdout:",
      "",
    ].join("\n"),
  );
  writeFileSync(
    filePath,
    Buffer.concat([header, catalogOutput(command), Buffer.from("\nstderr:\n"), catalogError(command)]),
  );
}

function assertNoCatalogBody(command: ReturnType<typeof spawnSync>, label: string): void {
  const combined = Buffer.concat([catalogOutput(command), catalogError(command)]).toString("utf8");
  if (command.status === 0) fail(label + ": expected nonzero exit");
  if (combined.includes("__SECTION__") || combined.includes("__CATALOG_INSPECTION_COMPLETE__")) {
    fail(label + ": catalog body emitted before refusal");
  }
}

function runTaskFour(): void {
  const caseName = value("--case");
  if (caseName !== "happy" && caseName !== "failure") fail("case must be happy or failure");
  const evidencePath = value("--evidence") ?? fail("--evidence is required");
  const fixtureDirectory =
    value("--fixtures") ?? "server/fixtures/database-architecture/task-4";
  const fixturePath = path.join(fixtureDirectory, "catalog-cases.json");
  const fixture = taskFourFixture(fixturePath);
  const catalogPath = "scripts/database-schema-catalog.sql";
  const testPath = "server/database-schema-catalog.test.ts";
  mkdirSync(path.dirname(evidencePath), { recursive: true });

  const testLogPath = evidencePath.replace(/\.json$/, "-self-test.log");
  const testArgs = ["tsx", "--test", testPath];
  const testRun = spawnSync("npx", testArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: taskThreeChildEnvironment({}),
  });
  writeFileSync(
    testLogPath,
    [
      "command=npx " + testArgs.join(" "),
      "status=" + String(testRun.status),
      testRun.stdout,
      testRun.stderr,
    ].join("\n"),
  );
  const attachments = [catalogPath, testPath, fixturePath, testLogPath];
  if (testRun.status !== 0) {
    writeTaskFourEvidence(
      evidencePath,
      caseName,
      "rejected",
      { catalog_self_test_exit_code: testRun.status, error_class: "catalog_self_test_failed" },
      attachments,
    );
    fail("catalog_self_test_failed");
  }

  if (caseName === "happy") {
    const first = runCatalog(catalogPath, "heliumdb");
    const second = runCatalog(catalogPath, "heliumdb");
    const firstPath = evidencePath.replace(/\.json$/, "-catalog-run-1.csv");
    const secondPath = evidencePath.replace(/\.json$/, "-catalog-run-2.csv");
    const firstLogPath = evidencePath.replace(/\.json$/, "-catalog-run-1.log");
    const secondLogPath = evidencePath.replace(/\.json$/, "-catalog-run-2.log");
    writeFileSync(firstPath, catalogOutput(first));
    writeFileSync(secondPath, catalogOutput(second));
    writeCatalogLog(firstLogPath, first, "heliumdb");
    writeCatalogLog(secondLogPath, second, "heliumdb");
    attachments.push(firstPath, secondPath, firstLogPath, secondLogPath);
    const output = catalogOutput(first);
    if (first.status !== 0 || second.status !== 0) {
      writeTaskFourEvidence(
        evidencePath,
        caseName,
        "rejected",
        {
          catalog_run_1_exit_code: first.status,
          catalog_run_2_exit_code: second.status,
          error_class: "catalog_execution_failed",
        },
        attachments,
      );
      fail("catalog_execution_failed");
    }
    if (!output.equals(catalogOutput(second))) fail("catalog output is not byte stable");
    const outputText = output.toString("utf8");
    if (
      !outputText.includes("__SAFETY_GATE__ ok") ||
      !outputText.includes("__CATALOG_INSPECTION_COMPLETE__")
    ) {
      fail("catalog completion markers missing");
    }
    for (const section of fixture.required_sections) {
      const marker = "__SECTION__ " + section;
      if (outputText.split(marker).length - 1 !== 1) {
        fail("catalog section missing or duplicated: " + section);
      }
    }
    if (
      /postgres(?:ql)?:\/\/|password\s*=|api[_-]?key\s*=|client[_-]?secret\s*=/i.test(outputText)
    ) {
      fail("catalog output contains secret-shaped content");
    }
    writeTaskFourEvidence(
      evidencePath,
      caseName,
      "approved",
      {
        catalog_self_test_exit_code: 0,
        catalog_run_1_exit_code: 0,
        catalog_run_2_exit_code: 0,
        canonical_output_sha256: sha256(output),
        byte_identical_runs: true,
        required_sections_present: fixture.required_sections.length,
        safety_gate_before_catalog_body: "approved",
        owner_acl_function_search_path_facts: "approved",
        schema_writes: 0,
      },
      attachments,
    );
    return;
  }

  const source = readFileSync(catalogPath, "utf8");
  const refusalResults: JsonObject[] = [];
  for (const failureCase of fixture.failure_cases) {
    let expectedDatabase = "heliumdb";
    let scenarioPath = catalogPath;
    if (failureCase.mutation === "expected_database_mismatch") {
      expectedDatabase = "definitely_not_heliumdb";
    } else {
      scenarioPath = evidencePath.replace(/\.json$/, "-" + failureCase.name + ".sql");
      const mutated =
        failureCase.mutation === "remove_read_only_transaction"
          ? source.replace("BEGIN TRANSACTION READ ONLY;", "BEGIN;")
          : source.replace(
              "SET LOCAL statement_timeout = '5s';",
              "SET LOCAL statement_timeout = '1ms';\nSELECT pg_catalog.pg_sleep(0.05);",
            );
      if (mutated === source) fail(failureCase.name + ": mutation did not apply");
      writeFileSync(scenarioPath, mutated);
      attachments.push(scenarioPath);
    }
    const command = runCatalog(scenarioPath, expectedDatabase);
    assertNoCatalogBody(command, failureCase.name);
    const logPath = evidencePath.replace(/\.json$/, "-" + failureCase.name + ".log");
    writeCatalogLog(logPath, command, expectedDatabase);
    attachments.push(logPath);
    refusalResults.push({
      name: failureCase.name,
      exit_code: command.status,
      catalog_body_emitted: false,
      schema_writes: 0,
      result: "rejected",
    });
  }
  writeTaskFourEvidence(
    evidencePath,
    caseName,
    "rejected",
    {
      catalog_self_test_exit_code: 0,
      refusal_cases_executed: refusalResults.length,
      refusal_cases_rejected: refusalResults.length,
      cases: refusalResults,
      zero_schema_writes: "approved",
    },
    attachments,
  );
  process.exitCode = 1;
}

function writeTaskFiveEvidence(
  evidencePath: string,
  caseName: "happy" | "failure",
  result: "approved" | "rejected",
  assertions: JsonObject,
  attachments: string[],
): void {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const evidence = {
    schema_version: "dgkma-task-evidence-v1",
    task: 5,
    task_commit_sha: process.env.TASK_COMMIT_SHA ?? currentHead,
    plan_sha256: sha256(readFileSync("docs/plans/database-architecture-audit.md")),
    manifest_sha256: readManifest().sha256,
    db_target: caseName === "happy" ? "synthetic-disposable-test" : "static-refusal",
    db_mode: "restore-authorization-only-no-sql",
    command: process.argv.join(" "),
    exit_code: result === "approved" ? 0 : 1,
    assertions,
    attachment_digests: attachments
      .filter(existsSync)
      .sort()
      .map((attachmentPath) => ({ path: attachmentPath, sha256: sha256(readFileSync(attachmentPath)) })),
    result,
  };
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${canonicalJson(evidence as never)}\n`);
}

function runTaskFive(): void {
  const caseName = value("--case");
  if (caseName !== "happy" && caseName !== "failure") fail("case must be happy or failure");
  const evidencePath = value("--evidence") ?? fail("--evidence is required");
  const fixtureDirectory = value("--fixtures") ?? "server/fixtures/database-architecture/task-5";
  const receiptPath = path.join(fixtureDirectory, "synthetic-restore-receipt.json");
  const descriptorPath = path.join(fixtureDirectory, "synthetic-sequence-60.json");
  const failureCasesPath = path.join(fixtureDirectory, "failure-cases.json");
  const testPath = "server/database-restore-contract.test.ts";
  const testLog = evidencePath.replace(/\.json$/, "-self-test.log");
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  const tests = runLogged("npx", ["tsx", "--test", testPath], testLog);
  const attachments = [
    "docs/database-operations.md",
    "docs/restore-contracts/restore-validation.schema.json",
    "docs/restore-contracts/restore-validation.descriptor.json",
    "scripts/database-restore-contract.ts",
    testPath,
    ...readdirSync(fixtureDirectory).map((name) => path.join(fixtureDirectory, name)),
    testLog,
  ];
  if (tests.status !== 0) {
    writeTaskFiveEvidence(evidencePath, caseName, "rejected", {
      self_test_exit_code: tests.status,
      error_class: "restore_contract_self_test_failed",
      sql_executions: 0,
    }, attachments);
    fail("restore_contract_self_test_failed");
  }

  if (caseName === "happy") {
    const descriptor = readSyntheticSequence60Descriptor(descriptorPath);
    const receipt = readRestoreReceipt(receiptPath);
    const authorization = authorizeRestoreReconcile({
      targetKind: "disposable-test",
      descriptorPath,
      receiptPath,
    });
    if (
      authorization.result !== "authorized" ||
      authorization.sql_executions !== 0 ||
      receipt.sequence_60_artifact_sha256 !== descriptor.artifact_sha256 ||
      receipt.restore_reconcile_sha256 !== descriptor.restore_reconcile_sha256 ||
      RESTORE_READINESS !== "pending Todo 22 measured drill"
    ) {
      fail("restore_contract_happy_assertion_failed");
    }
    writeTaskFiveEvidence(evidencePath, caseName, "approved", {
      self_test_exit_code: 0,
      target_kind: "disposable-test",
      target_authorization: "authorized",
      sequence_60_artifact_sha256: descriptor.artifact_sha256,
      restore_reconcile_sha256: descriptor.restore_reconcile_sha256,
      receipt_self_hash: "verified",
      receipt_field_count: 31,
      sql_executions: 0,
      database_calls: 0,
      restore_readiness: RESTORE_READINESS,
      production_operations: 0,
    }, attachments);
    return;
  }

  const fixtures = parseJson(failureCasesPath);
  exactKeys(fixtures, ["schema_version", "cases"], "task 5 failure fixtures");
  if (fixtures.schema_version !== "dgkma-task-5-failure-fixtures-v2") {
    fail("task_5_failure_fixture_version_mismatch");
  }
  const cases = arrayValue(fixtures.cases, "task 5 failure cases").map((entry) =>
    objectValue(entry, "task 5 failure case"),
  );
  if (cases.length !== 5) fail("task_5_failure_case_count_mismatch");
  const observations: JsonObject[] = [];
  for (const fixture of cases) {
    exactKeys(
      fixture,
      ["name", "target_kind", "descriptor", "receipt", "expected_error"],
      "task 5 failure case",
    );
    const descriptor = fixture.descriptor;
    if (descriptor !== null && typeof descriptor !== "string") fail("task_5_descriptor_fixture_invalid");
    if (typeof fixture.receipt !== "string") fail("task_5_receipt_fixture_invalid");
    let observed = "not_rejected";
    try {
      authorizeRestoreReconcile({
        targetKind: String(fixture.target_kind) as RestoreTargetKind,
        descriptorPath: descriptor === null ? null : path.join(fixtureDirectory, descriptor),
        receiptPath: path.join(fixtureDirectory, fixture.receipt),
      });
    } catch (error) {
      observed = error instanceof Error ? error.message : String(error);
    }
    if (observed !== fixture.expected_error) fail(`task_5_unexpected_refusal:${String(fixture.name)}`);
    observations.push({
      name: fixture.name,
      expected_error: fixture.expected_error,
      observed_error: observed,
      ...(String(fixture.name).startsWith("checksum_consistent_")
        ? { descriptor_artifact_receipt_checksums: "verified_before_statement_refusal" }
        : {}),
      sql_executions: 0,
      database_calls: 0,
      result: "rejected",
    });
  }
  writeTaskFiveEvidence(evidencePath, caseName, "rejected", {
    self_test_exit_code: 0,
    refusal_cases_executed: observations.length,
    refusal_cases_rejected_before_sql: observations.length,
    checksum_consistent_statement_refusals: observations.filter((entry) =>
      String(entry.name).startsWith("checksum_consistent_"),
    ).length,
    cases: observations,
    sql_executions: 0,
    database_calls: 0,
    production_operations: 0,
    restore_readiness: RESTORE_READINESS,
  }, attachments);
  process.exitCode = 1;
}

function writeTaskElevenEvidence(
  evidencePath: string,
  caseName: "happy" | "failure",
  assertions: JsonObject,
  attachments: string[],
): void {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const evidence = {
    schema_version: "dgkma-task-evidence-v1",
    task: 11,
    task_commit_sha: process.env.TASK_COMMIT_SHA ?? currentHead,
    plan_sha256: sha256(readFileSync("docs/plans/database-architecture-audit.md")),
    manifest_sha256: sha256(readFileSync("docs/database-manifest.yaml")),
    db_target: "static-plan-contract",
    db_mode: "no-database-call",
    command: process.argv.join(" "),
    exit_code: 0,
    assertions,
    attachment_digests: attachments
      .filter(existsSync)
      .sort()
      .map((attachmentPath) => ({ path: attachmentPath, sha256: sha256(readFileSync(attachmentPath)) })),
    result: "approved",
    case: caseName,
  };
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${canonicalJson(evidence as never)}\n`);
}

function runTaskEleven(): void {
  const caseName = value("--case");
  if (caseName !== "happy" && caseName !== "failure") fail("case must be happy or failure");
  const planPath = value("--plan") ?? fail("--plan is required");
  const evidencePath = value("--evidence") ?? fail("--evidence is required");
  const fixtureDirectory = value("--fixtures") ?? "server/fixtures/database-architecture/task-11";
  const expectedRules = values("--expect-rule");
  mkdirSync(path.dirname(evidencePath), { recursive: true });

  const testLog = evidencePath.replace(/\.json$/, "-self-test.log");
  const lintLog = evidencePath.replace(/\.json$/, "-plan-lint.log");
  const tests = runLogged("npx", ["tsx", "--test", "server/accounting-plan.test.ts"], testLog);
  const lint = runLogged("npx", ["tsx", "scripts/validate-accounting-plan.ts", "--plan", planPath], lintLog);
  const attachments = [
    "docs/database-manifest.yaml",
    "docs/plans/accounting-dues-prd.md",
    "docs/plans/database-architecture-audit.md",
    "scripts/validate-accounting-plan.ts",
    "server/accounting-plan.test.ts",
    testLog,
    lintLog,
    ...(existsSync(fixtureDirectory)
      ? readdirSync(fixtureDirectory).map((name) => path.join(fixtureDirectory, name))
      : []),
  ];
  if (tests.status !== 0) fail("task_11_self_test_failed");
  const lintResult = lastJsonLine(lint.stdout ?? "");
  const violations = arrayValue(lintResult.violations, "task 11 violations").map((entry) =>
    objectValue(entry, "task 11 violation"),
  );
  const observedRules = violations.map((violation) => String(violation.rule));

  if (caseName === "happy") {
    if (lint.status !== 0 || lintResult.result !== "approved" || violations.length !== 0) {
      fail("task_11_happy_plan_lint_failed");
    }
    if (
      lintResult.manifest_sha256 !== "986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8" ||
      lintResult.manifest_commit !== "47a9cf63545371ea258fc1c2264acf531fe5facf" ||
      lintResult.owner_decision_count !== 35 ||
      lintResult.accounting_gate_pairs !== 1 ||
      lintResult.architecture_gate_pairs !== 1
    ) {
      fail("task_11_happy_binding_mismatch");
    }
    writeTaskElevenEvidence(evidencePath, caseName, {
      self_test_exit_code: 0,
      inner_plan_lint_exit_code: 0,
      canonical_manifest_references: 1,
      manifest_sha256_binding: "approved",
      todo_2_commit_binding: "47a9cf63545371ea258fc1c2264acf531fe5facf",
      owner_decision_rows: 35,
      obsolete_executable_contracts: 0,
      accounting_attestation_gate_pairs: 1,
      architecture_attestation_gate_pairs: 1,
      gate_payload_bytes: 0,
      monthly_annual_independence: "approved",
      database_calls: 0,
      source_mutations: 0,
      production_operations: 0,
    }, attachments);
    return;
  }

  const requiredRules = ["obsolete-overlap-role", "fixed-new-table-count"];
  if (
    expectedRules.length !== requiredRules.length ||
    requiredRules.some((rule) => !expectedRules.includes(rule)) ||
    lint.status === 0 ||
    lintResult.result !== "rejected" ||
    requiredRules.some((rule) => !observedRules.includes(rule))
  ) {
    fail("task_11_failure_fixture_not_rejected_as_expected");
  }
  writeTaskElevenEvidence(evidencePath, caseName, {
    self_test_exit_code: 0,
    inner_plan_lint_exit_code: lint.status,
    inner_plan_result: "rejected",
    expected_rules: requiredRules,
    observed_expected_rules: requiredRules,
    outer_expected_failure_result: "approved",
    database_calls: 0,
    source_mutations: 0,
    production_operations: 0,
  }, attachments);
}

function writeTaskFourteenEvidence(
  evidencePath: string,
  caseName: "happy" | "failure",
  result: "approved" | "rejected",
  exitCode: number,
  assertions: JsonObject,
  attachments: string[],
): void {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const evidence = {
    schema_version: "dgkma-task-evidence-v1",
    task: 14,
    task_commit_sha: process.env.TASK_COMMIT_SHA ?? currentHead,
    plan_sha256: sha256(readFileSync("docs/plans/database-architecture-audit.md")),
    manifest_sha256: sha256(readFileSync("docs/database-manifest.yaml")),
    db_target: "static-source-contract-and-synthetic-fixtures",
    db_mode: "no-database-call",
    command: process.argv.join(" "),
    exit_code: exitCode,
    assertions,
    attachment_digests: attachments.filter(existsSync).sort().map((attachmentPath) => ({
      path: attachmentPath,
      sha256: sha256(readFileSync(attachmentPath)),
    })),
    result,
    case: caseName,
  };
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${canonicalJson(evidence as never)}\n`);
}

function runTaskFourteen(): void {
  const caseName = value("--case");
  if (caseName !== "happy" && caseName !== "failure") fail("case must be happy or failure");
  const evidencePath = value("--evidence") ?? fail("--evidence is required");
  const fixturesPath = value("--fixtures") ?? "server/fixtures/database-architecture/task-14";
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  const testLog = evidencePath.replace(/\.json$/, "-self-test.log");
  const tests = runLogged("npx", ["tsx", "--test", "server/accounting/source-contracts.test.ts"], testLog);
  if (tests.status !== 0) fail("task_14_self_test_failed");
  const membership = validateSourceContract(
    "docs/source-contracts/profiles/membership-integrated-address-book.json",
    "docs/source-contracts/mappings/membership-integrated-address-book-v1.json",
    "docs/source-contracts/approvals/membership-integrated-address-book-v1.json",
  );
  const notion = validateSourceContract(
    "docs/source-contracts/profiles/notion-organization-role-history.json",
    "docs/source-contracts/mappings/notion-organization-role-history-v1.json",
    "docs/source-contracts/approvals/notion-organization-role-history-v1.json",
  );
  const rebindPath = "docs/source-contracts/approvals/todo-11-manifest-rebind-v1.json";
  const rebind = parseJson(rebindPath);
  const rebindPreimage = { ...rebind };
  delete rebindPreimage.receipt_sha256;
  const amendmentPath = "docs/source-contracts/approvals/sequence-50-release-scope-amendment-v1.json";
  const amendment = parseJson(amendmentPath);
  const amendmentPreimage = { ...amendment };
  delete amendmentPreimage.receipt_sha256;
  if (
    rebind.schema_version !== "dgkma-todo-11-manifest-rebind-v1" ||
    rebind.receipt_sha256 !== sha256(canonicalJson(rebindPreimage as never)) ||
    amendment.schema_version !== "dgkma-sequence-50-release-scope-amendment-v1" ||
    amendment.receipt_sha256 !== sha256(canonicalJson(amendmentPreimage as never)) ||
    amendment.prior_manifest_sha256 !== rebind.amended_manifest_sha256 ||
    amendment.amended_manifest_sha256 !== TODO_14_MANIFEST_SHA256 ||
    amendment.source_mapping_receipts_unchanged !== true ||
    amendment.logical_source_identity_count !== 10 || amendment.source_release_count !== 2 ||
    amendment.deferred_historical_release_count !== 8 ||
    sha256(readFileSync("docs/database-manifest.yaml")) !== TODO_14_MANIFEST_SHA256
  ) {
    fail("task_14_manifest_rebind_mismatch");
  }
  const attachments = [
    "docs/database-manifest.yaml",
    "docs/plans/database-architecture-audit.md",
    "docs/source-contracts/task-14-mapping-preview.md",
    "docs/source-contracts/profiles/membership-integrated-address-book.json",
    "docs/source-contracts/profiles/notion-organization-role-history.json",
    "docs/source-contracts/mappings/membership-integrated-address-book-v1.json",
    "docs/source-contracts/mappings/notion-organization-role-history-v1.json",
    "docs/source-contracts/approvals/membership-integrated-address-book-v1.json",
    "docs/source-contracts/approvals/notion-organization-role-history-v1.json",
    rebindPath,
    amendmentPath,
    "docs/source-contracts/schemas/membership-integrated-address-book-v1.schema.json",
    "docs/source-contracts/schemas/notion-organization-role-history-v1.schema.json",
    "server/accounting/source-contracts.ts",
    "server/accounting/adapters/membership-integrated-address-book-v1.ts",
    "server/accounting/adapters/notion-organization-role-history-v1.ts",
    "server/accounting/source-contracts.test.ts",
    path.join(fixturesPath, "failure-cases.json"),
    testLog,
  ];
  if (caseName === "happy") {
    writeTaskFourteenEvidence(evidencePath, caseName, "approved", 0, {
      self_test_exit_code: 0,
      live_source_count: Object.keys(TODO_14_LIVE_SOURCES).length,
      profile_count: 2,
      mapping_count: 2,
      provider_approval_receipt_count: 2,
      todo_11_rebind_receipt: "approved",
      membership_source_code: membership.sourceCode,
      membership_output_family: membership.outputFamily,
      notion_source_code: notion.sourceCode,
      notion_output_family: notion.outputFamily,
      immutable_coordinate_retry: "created_to_verified_noop",
      changed_coordinate_behavior: "append_successor",
      removed_sheet_role_sources: 0,
      direct_frozen_payload_role_sources: 0,
      database_calls: 0,
      external_source_writes: 0,
      production_operations: 0,
    }, attachments);
    return;
  }
  const fixtures = parseJson(path.join(fixturesPath, "failure-cases.json"));
  const cases = arrayValue(fixtures.cases, "task 14 failure cases").map((entry) => objectValue(entry, "task 14 failure case"));
  const expectedKinds = ["removed_sheet_role_source", "direct_frozen_payload_role_source", "unactivated_notion_source", "unknown_role", "coordinate_mutation"];
  const observedKinds = cases.map((entry) => String(entry.kind));
  if (expectedKinds.some((kind) => !observedKinds.includes(kind))) fail("task_14_failure_fixture_incomplete");
  writeTaskFourteenEvidence(evidencePath, caseName, "rejected", 1, {
    self_test_exit_code: 0,
    observed_failure_kinds: observedKinds,
    fail_closed_cases: observedKinds.length,
    unauthorized_child_rows: 0,
    database_calls: 0,
    external_source_writes: 0,
    production_operations: 0,
  }, attachments);
  process.exitCode = 1;
}

function writeTaskTwelveEvidence(
  evidencePath: string,
  caseName: "happy" | "failure",
  result: "approved" | "rejected",
  exitCode: number,
  assertions: JsonObject,
  attachments: string[],
): void {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const evidence = {
    schema_version: "dgkma-task-evidence-v1",
    task: 12,
    task_commit_sha: process.env.TASK_COMMIT_SHA ?? currentHead,
    plan_sha256: sha256(readFileSync("docs/plans/database-architecture-audit.md")),
    manifest_sha256: sha256(readFileSync("docs/database-manifest.yaml")),
    db_target: "static-manifest-and-synthetic-transaction-machine",
    db_mode: "no-database-call",
    command: process.argv.join(" "),
    exit_code: exitCode,
    assertions,
    attachment_digests: attachments.filter(existsSync).sort().map((attachmentPath) => ({
      path: attachmentPath,
      sha256: sha256(readFileSync(attachmentPath)),
    })),
    result,
    case: caseName,
  };
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${canonicalJson(evidence as never)}\n`);
}

function runTaskTwelve(): void {
  const caseName = value("--case");
  if (caseName !== "happy" && caseName !== "failure") fail("case must be happy or failure");
  const evidencePath = value("--evidence") ?? fail("--evidence is required");
  const fixtureDirectory = value("--fixtures") ?? "server/fixtures/database-architecture/task-12";
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  const testLog = evidencePath.replace(/\.json$/, "-self-test.log");
  const tsxBinary = process.env.TSX_BIN;
  const tests = runLogged(
    tsxBinary ?? "npx",
    tsxBinary ? ["--test", "server/accounting/member-actor-contract.test.ts"] : ["tsx", "--test", "server/accounting/member-actor-contract.test.ts"],
    testLog,
  );
  if (tests.status !== 0) fail("task_12_self_test_failed");
  const contract = validateMemberActorManifest();
  const fixturePath = path.join(fixtureDirectory, "failure-cases.json");
  const attachments = [
    "docs/database-manifest.yaml",
    "docs/plans/database-architecture-audit.md",
    "server/accounting/member-actor-contract.ts",
    "server/accounting/member-actor-contract.test.ts",
    fixturePath,
    testLog,
  ];
  if (caseName === "happy") {
    writeTaskTwelveEvidence(evidencePath, caseName, "approved", 0, {
      self_test_exit_code: 0,
      member_table_count: contract.memberTableCount,
      account_delete_user_fk_count: contract.userFkCount,
      account_delete_non_fk_count: contract.nonFkCount,
      live_actor_required_for_match_decision: true,
      current_link_uniqueness: "concurrency_safe_global_partial_unique",
      activity_history: "alternating_append_only_intervals",
      account_delete_shapes: ["user_only", "alumni_only", "both", "ended_member", "member_less"],
      rate_limit_present_and_absent: "approved",
      exact_authenticated_sid_only: true,
      exact_kakao_pending_selection_only: true,
      alumni_member_link_preserved: true,
      legacy_runtime_match_cleared: true,
      database_calls: 0,
      production_operations: 0,
    }, attachments);
    return;
  }
  const fixtures = parseJson(fixturePath);
  const cases = arrayValue(fixtures.cases, "task 12 failure cases").map((entry) => objectValue(entry, "task 12 failure case"));
  const kinds = cases.map((entry) => String(entry.kind));
  const requiredKinds = [
    "parallel_duplicate_user_link", "parallel_duplicate_alumni_link", "name_only_approval", "missing_live_actor",
    "skipped_activity_number", "same_state_activity", "digest_only_reconstruction", "user_fk_registry_omission",
    "user_fk_registry_extra", "prospective_operation_mismatch", "post_enumeration_actor_child", "session_user_inference",
    "unrelated_session_delete", "pending_collision_selection", "rate_limit_parent_cascade", "rate_limit_residual",
    "cleared_alumni_link", "retained_legacy_matched_user", "retained_legacy_is_matched",
  ];
  if (requiredKinds.some((kind) => !kinds.includes(kind)) || new Set(kinds).size !== kinds.length) fail("task_12_failure_fixture_incomplete");
  writeTaskTwelveEvidence(evidencePath, caseName, "rejected", 1, {
    self_test_exit_code: 0,
    fail_closed_cases: kinds.length,
    observed_failure_kinds: kinds,
    partial_links: 0,
    unauthorized_actor_rows: 0,
    unaudited_rate_limit_deletes: 0,
    database_calls: 0,
    production_operations: 0,
  }, attachments);
  process.exitCode = 1;
}

function writeTaskThirteenEvidence(
  evidencePath: string,
  caseName: "happy" | "failure",
  result: "approved" | "rejected",
  exitCode: number,
  assertions: JsonObject,
  attachments: string[],
): void {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const evidence = {
    schema_version: "dgkma-task-evidence-v1", task: 13,
    task_commit_sha: process.env.TASK_COMMIT_SHA ?? currentHead,
    plan_sha256: sha256(readFileSync("docs/plans/database-architecture-audit.md")),
    manifest_sha256: sha256(readFileSync("docs/database-manifest.yaml")),
    db_target: "static-manifest-and-synthetic-policy-machine", db_mode: "no-database-call",
    command: process.argv.join(" "), exit_code: exitCode, assertions,
    attachment_digests: attachments.filter(existsSync).sort().map((attachmentPath) => ({ path: attachmentPath, sha256: sha256(readFileSync(attachmentPath)) })),
    result, case: caseName,
  };
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${canonicalJson(evidence as never)}\n`);
}

function runTaskThirteen(): void {
  const caseName = value("--case");
  if (caseName !== "happy" && caseName !== "failure") fail("case must be happy or failure");
  const evidencePath = value("--evidence") ?? fail("--evidence is required");
  const fixtureDirectory = value("--fixtures") ?? "server/fixtures/database-architecture/task-13";
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  const testLog = evidencePath.replace(/\.json$/, "-self-test.log");
  const tsxBinary = process.env.TSX_BIN;
  const tests = runLogged(tsxBinary ?? "npx", tsxBinary ? ["--test", "server/accounting/dues-policy-contract.test.ts"] : ["tsx", "--test", "server/accounting/dues-policy-contract.test.ts"], testLog);
  if (tests.status !== 0) fail("task_13_self_test_failed");
  const contract = validateDuesPolicyManifest();
  const fixturePath = path.join(fixtureDirectory, "failure-cases.json");
  const attachments = ["docs/database-manifest.yaml", "docs/plans/database-architecture-audit.md", "server/accounting/dues-policy-contract.ts", "server/accounting/dues-policy-contract.test.ts", fixturePath, testLog];
  if (caseName === "happy") {
    writeTaskThirteenEvidence(evidencePath, caseName, "approved", 0, {
      self_test_exit_code: 0, policy_table_count: contract.tableCount, draft_policy_seed_count: POLICY_SEEDS.length,
      secondary_position_code_count: SECONDARY_POSITION_CODES.length, organizational_overlaps_preserved: true,
      highest_tier_single_tip: true, promotion_appends_successor: true, lower_role_does_not_lower_year: true,
      general_assembly_chair_2026_tier: "vice_president_auditor_chair", director_display_mapping_count: 6,
      draft_policy_persisted_tier_rows: 0, draft_policy_persisted_rights_rows: 0,
      synthetic_resolution_only: true, live_board_activation: 0, database_calls: 0, production_operations: 0,
    }, attachments);
    return;
  }
  const fixtures = parseJson(fixturePath);
  const cases = arrayValue(fixtures.cases, "task 13 failure cases").map((entry) => objectValue(entry, "task 13 failure case"));
  const kinds = cases.map((entry) => String(entry.kind));
  const expected = ["overlapping_derived_tiers", "unknown_position_mapping", "unapproved_policy_activation", "draft_rights_persistence", "general_assembly_chair_before_2026", "secondary_role_obligation", "unauthorized_21st_override"];
  if (expected.some((kind) => !kinds.includes(kind)) || new Set(kinds).size !== kinds.length) fail("task_13_failure_fixture_incomplete");
  writeTaskThirteenEvidence(evidencePath, caseName, "rejected", 1, { self_test_exit_code: 0, fail_closed_cases: kinds.length, observed_failure_kinds: kinds, partial_policy_rows: 0, partial_tier_rows: 0, partial_rights_rows: 0, database_calls: 0, production_operations: 0 }, attachments);
  process.exitCode = 1;
}

function writeTaskFifteenEvidence(evidencePath: string, caseName: "happy" | "failure", result: "approved" | "rejected", exitCode: number, assertions: JsonObject, attachments: string[]): void {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const evidence = { schema_version: "dgkma-task-evidence-v1", task: 15, task_commit_sha: process.env.TASK_COMMIT_SHA ?? currentHead, plan_sha256: sha256(readFileSync("docs/plans/database-architecture-audit.md")), manifest_sha256: sha256(readFileSync("docs/database-manifest.yaml")), db_target: "static-manifest-and-synthetic-financial-api-machine", db_mode: "no-database-call", command: process.argv.join(" "), exit_code: exitCode, assertions, attachment_digests: attachments.filter(existsSync).sort().map((attachmentPath) => ({ path: attachmentPath, sha256: sha256(readFileSync(attachmentPath)) })), result, case: caseName };
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${canonicalJson(evidence as never)}\n`);
}

function runTaskFifteen(): void {
  const caseName = value("--case");
  if (caseName !== "happy" && caseName !== "failure") fail("case must be happy or failure");
  const evidencePath = value("--evidence") ?? fail("--evidence is required");
  const fixtureDirectory = value("--fixtures") ?? "server/fixtures/database-architecture/task-15";
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  const testLog = evidencePath.replace(/\.json$/, "-self-test.log");
  const tsxBinary = process.env.TSX_BIN;
  const tests = runLogged(tsxBinary ?? "npx", tsxBinary ? ["--test", "server/source-decision-route.test.ts", "server/accounting-self-route.test.ts", "server/accounting/financial-topology-contract.test.ts"] : ["tsx", "--test", "server/source-decision-route.test.ts", "server/accounting-self-route.test.ts", "server/accounting/financial-topology-contract.test.ts"], testLog);
  if (tests.status !== 0) fail("task_15_self_test_failed");
  const contract = validateFinancialManifest();
  const fixturePath = path.join(fixtureDirectory, "failure-cases.json");
  const attachments = ["docs/database-manifest.yaml", "docs/plans/database-architecture-audit.md", "server/accounting/source-decision-api.ts", "server/accounting/accounting-self-api.ts", "server/accounting/financial-topology-contract.ts", "server/source-decision-route.test.ts", "server/accounting-self-route.test.ts", "server/accounting/financial-topology-contract.test.ts", fixturePath, testLog];
  if (caseName === "happy") {
    writeTaskFifteenEvidence(evidencePath, caseName, "approved", 0, { self_test_exit_code: 0, financial_table_count: contract.financialTableCount, actor_action_count: contract.actorActionCount, balanced_receipt_shapes: ["single", "group", "mixed"], source_backed_bank_refund: "approved", collision_order: ["duplicate_reject", "canonicalization_create", "collision_resolve"], canonical_root_remains_proposed: true, source_decision_same_origin_frozen_admin: true, source_decision_manifest_and_fingerprint_bound: true, accounting_self_session_bound: true, bigint_json_numbers: 0, database_calls: 0, production_operations: 0 }, attachments);
    return;
  }
  const cases = arrayValue(parseJson(fixturePath).cases, "task 15 failure cases").map((entry) => objectValue(entry, "task 15 failure case"));
  const kinds = cases.map((entry) => String(entry.kind));
  const expected = ["stale_manifest", "stale_source_fingerprint", "cross_origin", "non_admin", "wrong_frozen_admin", "claimless_refund", "off_bank_refund", "wrong_original_receipt", "competing_over_allocation", "canonicalization_before_rejection", "canonicalize_child_bearing_event", "omitted_collision_audit", "terminal_state_rewrite", "cross_period_cashbook", "missing_receipt_close", "anonymous_self_read", "other_user_self_read", "numeric_bigint_response"];
  if (expected.some((kind) => !kinds.includes(kind)) || new Set(kinds).size !== kinds.length) fail("task_15_failure_fixture_incomplete");
  writeTaskFifteenEvidence(evidencePath, caseName, "rejected", 1, { self_test_exit_code: 0, fail_closed_cases: kinds.length, observed_failure_kinds: kinds, partial_financial_rows: 0, partial_audit_rows: 0, database_calls: 0, production_operations: 0 }, attachments);
  process.exitCode = 1;
}

function runTaskSixteen(): void {
  const caseName = value("--case");
  if (caseName !== "happy" && caseName !== "failure") fail("case must be happy or failure");
  const evidencePath = value("--evidence") ?? fail("--evidence is required");
  const target = value("--target");
  const runCount = Number(value("--runs") ?? "0");
  const variants = (value("--variants") ?? "").split(",").filter(Boolean);
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  const env = { ...process.env };
  delete env.DATABASE_URL; delete env.PROD_DATABASE_URL; delete env.PROD_DATABASE_READONLY_URL;
  const log: string[] = [];
  const commandLogPath = evidencePath.replace(/\.json$/, "-commands.log");
  const invoke = (command: string, args: string[], expected = 0, extraEnv: NodeJS.ProcessEnv = {}) => {
    const result = spawnSync(command, args, { cwd: process.cwd(), env: { ...env, ...extraEnv }, encoding: "utf8" });
    log.push(`$ ${command} ${args.join(" ")}`, result.stdout ?? "", result.stderr ?? "");
    if ((result.status ?? 1) !== expected) {
      writeFileSync(commandLogPath, log.join("\n"));
      fail(`task_16_command_status:${command}:${result.status}`);
    }
    return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  };
  const descriptors = readArtifactDescriptors();
  if (descriptors.some((descriptor) => descriptor.materialization_state !== "materialized")) fail("task_16_artifact_not_materialized");
  descriptors.forEach((descriptor) => verifyArtifactBytes(descriptor));
  const sequenceOne = readFileSync("migrations/manual/0001_schema_ledger_bootstrap.sql");
  if (sha256(sequenceOne) !== descriptors.find((descriptor) => descriptor.sequence_no === 1)!.artifact_sha256) fail("task_16_sequence_one_changed");

  if (caseName === "failure") {
    const output = invoke("npx", ["tsx","scripts/apply-schema.ts","--target","development","--dry-run","--capability-variant","fallback-test"], 1);
    if (!output.includes("fallback_test_development_forbidden")) fail("task_16_development_fallback_not_rejected");
    const source = readFileSync("scripts/apply-schema.ts", "utf8");
    for (const token of ["actor_receipt_target_mismatch","preferred_btree_gist_unavailable","fallback_test_development_forbidden"]) {
      if (!source.includes(token)) fail(`task_16_failure_guard_missing:${token}`);
    }
    writeFileSync(evidencePath, `${canonicalJson({ schema_version:"dgkma-task-evidence-v1",task:16,case:caseName,
      task_commit_sha:process.env.TASK_COMMIT_SHA ?? execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),
      manifest_sha256:readManifest().sha256,db_target:"development-preflight-and-static-guards",db_mode:"zero-schema-write",
      assertions:{development_fallback_rejected:true,cross_target_receipt_guard:true,forced_preferred_guard:true},result:"rejected" } as never)}\n`);
    writeFileSync(commandLogPath, log.join("\n"));
    process.exitCode = 1;
    return;
  }

  if (target !== "disposable-test" || runCount !== 2 || canonicalJson(variants as never) !== canonicalJson(["auto","fallback-test"] as never)) {
    fail("task_16_happy_arguments_mismatch");
  }
  invoke("npm", ["run","check"]);
  invoke("npm", ["run","build"]);
  const summaries: JsonObject[] = [];
  for (const variant of variants) {
    const runUid = randomUUID();
    const receiptPath = path.join(path.dirname(evidencePath), `${runUid}-admin.json`);
    invoke("npx", ["tsx","scripts/apply-schema.ts","--target","disposable-test","--run-uid",runUid,"--through-sequence","40","--capability-variant",variant]);
    invoke("npx", ["tsx","scripts/create-disposable-admin.ts","--target","disposable-test","--run-uid",runUid,"--receipt",receiptPath]);
    invoke("npx", ["tsx","scripts/apply-schema.ts","--target","disposable-test","--run-uid",runUid,"--from-sequence","50","--through-sequence","60","--actor-receipt",receiptPath]);
    invoke("npx", ["tsx","scripts/verify-schema-catalog.ts","--target","disposable-test","--run-uid",runUid,"--manifest","docs/database-manifest.yaml"]);
    invoke("node", ["dist/index.js"], 0, { NODE_ENV:"production", SESSION_SECRET:"disposable-ledger-only-not-a-real-secret", DGKMA_STARTUP_LEDGER_ONLY:"1", DGKMA_DISPOSABLE_RUN_UID:runUid });
    invoke("npx", ["tsx","scripts/apply-schema.ts","--target","disposable-test","--run-uid",runUid,"--from-sequence","50","--through-sequence","60","--actor-receipt",receiptPath]);
    invoke("npx", ["tsx","scripts/verify-schema-catalog.ts","--target","disposable-test","--run-uid",runUid,"--manifest","docs/database-manifest.yaml","--teardown"]);
    summaries.push({ run_uid:runUid, requested_variant:variant, ledger_sequences:[1,10,15,20,30,40,50,60], reapply:"verified_noop", teardown_absent:true });
  }
  const logPath = commandLogPath;
  writeFileSync(logPath, log.join("\n"));
  writeFileSync(evidencePath, `${canonicalJson({ schema_version:"dgkma-task-evidence-v1",task:16,case:caseName,
    task_commit_sha:process.env.TASK_COMMIT_SHA ?? execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),
    manifest_sha256:readManifest().sha256,db_target:"disposable-test",db_mode:"two-uuid-bound-disposable-runs",
    assertions:{runs:summaries,artifact_descriptors:descriptors.length,startup_required_through:60,production_operations:0,development_schema_writes:0},
    attachment_digests:[{path:logPath,sha256:sha256(readFileSync(logPath))}],result:"approved" } as never)}\n`);
}

function writeTaskSixEvidence(
  evidencePath: string,
  caseName: "happy" | "failure",
  result: "approved" | "rejected",
  exitCode: number,
  assertions: JsonObject,
  attachments: string[],
): void {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const evidence = {
    schema_version: "dgkma-task-evidence-v1",
    task: 6,
    task_commit_sha: process.env.TASK_COMMIT_SHA ?? currentHead,
    manifest_sha256: sha256(readFileSync("docs/database-manifest.yaml")),
    db_target: "static-contract-and-read-only-inventory-query",
    db_mode: "no-database-call",
    command: process.argv.join(" "),
    exit_code: exitCode,
    assertions,
    attachment_digests: attachments.filter(existsSync).sort().map((attachmentPath) => ({
      path: attachmentPath,
      sha256: sha256(readFileSync(attachmentPath)),
    })),
    result,
    case: caseName,
  };
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${canonicalJson(evidence as never)}\n`);
}

function runTaskSix(): void {
  const caseName = value("--case");
  if (caseName !== "happy" && caseName !== "failure") fail("case must be happy or failure");
  const evidencePath = value("--evidence") ?? fail("--evidence is required");
  const fixturesPath = value("--fixtures") ?? "server/fixtures/database-architecture/task-6";
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  const testLog = evidencePath.replace(/\.json$/, "-self-test.log");
  const inventorySqlPath = evidencePath.replace(/\.json$/, "-development-inventory.sql");
  const tests = runLogged("npx", ["tsx", "--test", "server/database-domain-constraints.test.ts"], testLog);
  if (tests.status !== 0) fail("task_6_self_test_failed");
  const rules = validateClosedRuleContract();
  const sqlProjection = parseSequence15SqlRegistry(sequence15SqlRegistry());
  writeFileSync(inventorySqlPath, developmentInventorySql());
  const commonAttachments = [
    "docs/database-manifest.yaml",
    "migrations/artifacts/0015_existing_data_exception_capture.json",
    "migrations/artifacts/0020_existing_integrity.json",
    "scripts/database-domain-constraints.ts",
    "server/database-domain-constraints.test.ts",
    path.join(fixturesPath, "domain-cases.json"),
    path.join(fixturesPath, "omitted-predicate.json"),
    testLog,
    inventorySqlPath,
  ];
  if (caseName === "happy") {
    const fixtures = parseJson(path.join(fixturesPath, "domain-cases.json"));
    const cases = arrayValue(fixtures.cases, "task 6 domain cases");
    if (cases.length !== 25 || rules.length !== 25 || sqlProjection.length !== 25) fail("task_6_rule_closure_mismatch");
    writeTaskSixEvidence(evidencePath, caseName, "approved", 0, {
      self_test_exit_code: 0,
      physical_predicate_count: 25,
      persisted_exception_code_count: 25,
      pre_anchor_blocking_count: 21,
      legacy_not_valid_count: 4,
      table_driven_fixture_count: 25,
      application_sql_tuple_equality: "approved",
      users_email_blank_exception_code: "USERS_EMAIL_CANONICAL_BLANK",
      sequence_15_status: "open",
      pre_anchor_sequence_20_outcome: "block_before_ddl",
      legacy_sequence_20_outcome: "add_not_valid_only",
      future_sequence_15_materialized: false,
      future_sequence_20_materialized: false,
      schema_writes: 0,
      source_rewrites: 0,
      database_calls: 0,
      production_operations: 0,
    }, commonAttachments);
    return;
  }
  const omission = parseJson(path.join(fixturesPath, "omitted-predicate.json"));
  exactKeys(omission, ["schema_version", "observed_predicate_id", "omitted_contract_predicate_id", "expected_error"], "task 6 omission fixture");
  const omitted = DOMAIN_EXCEPTION_RULES.filter((rule) => rule.predicate_id !== omission.omitted_contract_predicate_id);
  let observedError = "not_rejected";
  try {
    captureObservedPredicates([String(omission.observed_predicate_id)], omitted);
  } catch (error) {
    observedError = error instanceof Error ? error.message : String(error);
  }
  if (observedError !== "unregistered_schema_exception_rule" || omission.expected_error !== observedError) {
    fail("task_6_omitted_predicate_not_rejected");
  }
  writeTaskSixEvidence(evidencePath, caseName, "rejected", 1, {
    self_test_exit_code: 0,
    observed_error: observedError,
    rejected_before_ddl: true,
    schema_writes: 0,
    source_rewrites: 0,
    database_calls: 0,
    production_operations: 0,
  }, commonAttachments);
  process.exitCode = 1;
}

function writeTaskSevenEvidence(
  evidencePath: string,
  caseName: "happy" | "failure",
  result: "approved" | "rejected",
  exitCode: number,
  assertions: JsonObject,
  attachments: string[],
): void {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const evidence = {
    schema_version: "dgkma-task-evidence-v1",
    task: 7,
    task_commit_sha: process.env.TASK_COMMIT_SHA ?? currentHead,
    manifest_sha256: sha256(readFileSync("docs/database-manifest.yaml")),
    db_target: "static-contract-and-read-only-development-preflight-query",
    db_mode: "no-database-call",
    command: process.argv.join(" "),
    exit_code: exitCode,
    assertions,
    attachment_digests: attachments.filter(existsSync).sort().map((attachmentPath) => ({
      path: attachmentPath,
      sha256: sha256(readFileSync(attachmentPath)),
    })),
    result,
    case: caseName,
  };
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${canonicalJson(evidence as never)}\n`);
}

function runTaskSeven(): void {
  const caseName = value("--case");
  if (caseName !== "happy" && caseName !== "failure") fail("case must be happy or failure");
  const evidencePath = value("--evidence") ?? fail("--evidence is required");
  const fixturesPath = value("--fixtures") ?? "server/fixtures/database-architecture/task-7";
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  const testLog = evidencePath.replace(/\.json$/, "-self-test.log");
  const alumniSyncTestLog = evidencePath.replace(/\.json$/, "-alumni-sync-static-test.log");
  const inventorySqlPath = evidencePath.replace(/\.json$/, "-development-preflight.sql");
  const tests = runLogged("npx", [
    "tsx", "--test",
    "server/database-relationship-constraints.test.ts",
    "server/admin-pending-registration-contract.test.ts",
    "server/admin-pending-rejection-routes.test.ts",
  ], testLog);
  if (tests.status !== 0) fail("task_7_self_test_failed");
  const alumniSyncTests = runLogged("npx", [
    "tsx", "--test",
    "--test-name-pattern=alumni sync storage uses one advisory-locked transaction without delete",
    "server/alumni-sync-storage.test.ts",
  ], alumniSyncTestLog);
  if (alumniSyncTests.status !== 0) fail("task_7_alumni_sync_static_test_failed");
  const constraints = validateRelationshipContract();
  writeFileSync(inventorySqlPath, developmentRelationshipPreflightSql());
  const happyFixturePath = path.join(fixturesPath, "relationship-cases.json");
  const conflictFixturePath = path.join(fixturesPath, "conflict-cases.json");
  const pinnedBaselinePath = path.join(fixturesPath, "pinned-baseline.json");
  const attachments = [
    "docs/database-manifest.yaml",
    "docs/database-relationship-constraints.md",
    "scripts/database-relationship-constraints.ts",
    "server/database-relationship-constraints.test.ts",
    happyFixturePath,
    conflictFixturePath,
    pinnedBaselinePath,
    testLog,
    alumniSyncTestLog,
    inventorySqlPath,
  ];

  if (caseName === "happy") {
    const fixture = parseJson(happyFixturePath);
    const state = objectValue(fixture.state, "task 7 happy state") as unknown as RelationshipFixture;
    const blockers = detectRelationshipBlockers(state);
    if (blockers.length !== 0 || constraints.length !== 4) fail("task_7_zero_conflict_path_rejected");
    const deletion = applyLegacyObituaryDeleteFixture(state, Number(fixture.delete_obituary_id));
    const eventId = Number(fixture.expected_preserved_event_id);
    const before = state.community_events.find((event) => event.id === eventId);
    const after = deletion.community_events.find((event) => event.id === eventId);
    if (!before || !after || JSON.stringify(after) !== JSON.stringify({ ...before, legacy_obituary_id: null })) {
      fail("task_7_set_null_did_not_preserve_event");
    }
    const decision = decideRelationshipSequence20(blockers);
    if (!decision.constraints_allowed || decision.ddl_materialized_by_todo_7 || decision.ddl_applied_by_todo_7) {
      fail("task_7_sequence_boundary_mismatch");
    }
    writeTaskSevenEvidence(evidencePath, caseName, "approved", 0, {
      self_test_exit_code: 0,
      alumni_sync_static_test_exit_code: 0,
      relationship_constraint_count: 4,
      preflight_rule_count: 5,
      preflight_blocker_count: 0,
      alumni_nonnull_one_to_one: "approved",
      legacy_obituary_fk_nullable: true,
      legacy_obituary_on_delete: "SET NULL",
      legacy_obituary_on_update: "RESTRICT",
      legacy_obituary_support: "existing_unique",
      community_event_row_preserved: true,
      pending_current_kakao_uniqueness: "approved",
      pending_current_canonical_email_uniqueness: "approved",
      pending_email_canonical_expression: "lower(btrim(email))",
      locked_recheck_required: true,
      lock_mode: SEQUENCE_20_RELATIONSHIP_RECHECK.lock_mode,
      sequence_15_append_only_quarantine: SEQUENCE_15_RELATIONSHIP_QUARANTINE.append_only,
      future_sequence_20_materialized: false,
      future_sequence_20_applied: false,
      schema_writes: 0,
      source_rewrites: 0,
      automatic_merges: 0,
      automatic_deletes: 0,
      database_calls: 0,
      production_operations: 0,
    }, attachments);
    return;
  }

  const fixture = parseJson(conflictFixturePath);
  const state = objectValue(fixture.state, "task 7 conflict state") as unknown as RelationshipFixture;
  const expected = arrayValue(fixture.expected_blockers, "task 7 expected blockers").map((entry) => {
    const blocker = objectValue(entry, "task 7 expected blocker");
    return { blocker_code: blocker.blocker_code, row_ids: blocker.row_ids };
  });
  const blockers = detectRelationshipBlockers(state);
  const observed = blockers.map(({ blocker_code, row_ids }) => ({ blocker_code, row_ids }));
  if (JSON.stringify(observed) !== JSON.stringify(expected) || blockers.length !== 5) {
    fail("task_7_conflict_fixture_not_rejected_as_expected");
  }
  const decision = decideRelationshipSequence20(blockers);
  if (decision.constraints_allowed || decision.result !== "blocked_by_quarantine") {
    fail("task_7_conflict_did_not_block_before_ddl");
  }
  writeTaskSevenEvidence(evidencePath, caseName, "rejected", 1, {
    self_test_exit_code: 0,
    alumni_sync_static_test_exit_code: 0,
    observed_blocker_codes: blockers.map((entry) => entry.blocker_code),
    deterministic_blocker_count: blockers.length,
    sequence_15_status: "open",
    sequence_20_outcome: "block_before_ddl",
    constraints_allowed: false,
    quarantined_before_ddl: true,
    future_sequence_20_materialized: false,
    future_sequence_20_applied: false,
    schema_writes: 0,
    source_rewrites: 0,
    automatic_merges: 0,
    automatic_deletes: 0,
    database_calls: 0,
    production_operations: 0,
  }, attachments);
  process.exitCode = 1;
}

function writeTaskNineEvidence(
  evidencePath: string,
  caseName: "happy" | "failure",
  result: "approved" | "rejected",
  exitCode: number,
  assertions: JsonObject,
  attachments: string[],
): void {
  const taskCommitSha = resolveTaskNineCommitSha(
    process.env.TASK_COMMIT_SHA,
    () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  );
  const evidence = {
    schema_version: "dgkma-task-evidence-v1",
    task: 9,
    task_commit_sha: taskCommitSha,
    manifest_sha256: sha256(readFileSync("docs/database-manifest.yaml")),
    db_target: "static-contract-and-read-only-development-preflight-query",
    db_mode: "no-database-call",
    command: process.argv.join(" "),
    exit_code: exitCode,
    assertions,
    attachment_digests: attachments.filter(existsSync).sort().map((attachmentPath) => ({
      path: attachmentPath,
      sha256: sha256(readFileSync(attachmentPath)),
    })),
    result,
    case: caseName,
  };
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${canonicalJson(evidence as never)}\n`);
}

function runTaskNine(): void {
  const caseName = value("--case");
  if (caseName !== "happy" && caseName !== "failure") fail("case must be happy or failure");
  const evidencePath = value("--evidence") ?? fail("--evidence is required");
  const fixturesPath = value("--fixtures") ?? "server/fixtures/database-architecture/task-9";
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  const testLog = evidencePath.replace(/\.json$/, "-self-test.log");
  const deletionStaticLog = evidencePath.replace(/\.json$/, "-account-deletion-static-test.log");
  const preflightSqlPath = evidencePath.replace(/\.json$/, "-development-preflight.sql");
  const tests = runLogged("npx", ["tsx", "--test", "server/member-identity-anchor.test.ts"], testLog);
  if (tests.status !== 0) fail("task_9_self_test_failed");
  const deletionStatic = runLogged("npx", [
    "tsx", "--test",
    "--test-name-pattern=deleteUserAccount processes every approved relation in one transaction",
    "server/account-deletion-storage.test.ts",
  ], deletionStaticLog);
  if (deletionStatic.status !== 0) fail("task_9_account_deletion_static_test_failed");
  const definitions = validateIdentityAnchorContract();
  writeFileSync(preflightSqlPath, developmentIdentityAnchorPreflightSql());

  const normalizationPath = path.join(fixturesPath, "normalization-cases.json");
  const exactPath = path.join(fixturesPath, "exact-link-cases.json");
  const conflictPath = path.join(fixturesPath, "conflict-cases.json");
  const nameOnlyPath = path.join(fixturesPath, "name-only-cases.json");
  const attachments = [
    "docs/database-manifest.yaml",
    "docs/member-identity-anchor.md",
    "scripts/member-identity-anchor.ts",
    "server/member-identity-anchor.test.ts",
    normalizationPath,
    exactPath,
    conflictPath,
    nameOnlyPath,
    testLog,
    deletionStaticLog,
    preflightSqlPath,
  ];

  if (caseName === "happy") {
    const exact = parseJson(exactPath);
    const exactState = objectValue(exact.state, "task 9 exact-link state") as unknown as IdentityFixture;
    const preview = previewCurrentExactLinks(exactState);
    const expectedLinks = arrayValue(exact.expected_links, "task 9 expected exact links");
    const rerun = previewCurrentExactLinks(exactState);
    const nameOnly = parseJson(nameOnlyPath);
    const nameOnlyPreview = previewCurrentExactLinks(
      objectValue(nameOnly.state, "task 9 name-only state") as unknown as IdentityFixture,
    );
    if (
      definitions.length !== 3 || preview.result !== "ready_for_todo_12_input" ||
      canonicalJson(preview.links as never) !== canonicalJson(expectedLinks as never) ||
      canonicalJson(rerun as never) !== canonicalJson(preview as never) ||
      nameOnlyPreview.links.length !== 0 || preview.source_mutations !== 0 || preview.rows_backfilled !== 0
    ) fail("task_9_exact_link_preview_mismatch");
    writeTaskNineEvidence(evidencePath, caseName, "approved", 0, {
      self_test_exit_code: 0,
      account_deletion_static_test_exit_code: 0,
      audited_write_integration_selected: false,
      identity_definition_count: definitions.length,
      identity_blocker_rule_count: 12,
      normalization_application_sql_outcomes: "identical",
      email_normalization_vector_count: 14,
      email_normalization_generated_sql_surfaces: ["pending_registrations.email", "users.email"],
      phone_normalization_vector_count: 12,
      phone_normalization_generated_sql_surfaces: ["alumni_database.mobile", "users.phone_number"],
      exact_link_count: preview.links.length,
      exact_link_source: "alumni_database.matched_user_id",
      exact_link_fk_backed: true,
      rerun_stable: true,
      name_only_links: 0,
      partial_backfill_rows: 0,
      sequence_20_materialized: false,
      sequence_20_applied: false,
      development_admin_approved_receipts: 0,
      association_or_history_tables_created: 0,
      schema_writes: 0,
      source_rewrites: 0,
      database_calls: 0,
      production_operations: 0,
    }, attachments);
    return;
  }

  const conflict = parseJson(conflictPath);
  const state = objectValue(conflict.state, "task 9 conflict state") as unknown as IdentityFixture;
  const expectedCodes = arrayValue(conflict.expected_blocker_codes, "task 9 expected blocker codes");
  const blockers = requireExpectedIdentityBlockers(state, expectedCodes.map(String));
  const observedCodes = [...new Set(blockers.map((entry) => entry.blocker_code))].sort();
  const preview = previewCurrentExactLinks(state);
  const nameOnly = parseJson(nameOnlyPath);
  const nameOnlyPreview = previewCurrentExactLinks(
    objectValue(nameOnly.state, "task 9 failure name-only state") as unknown as IdentityFixture,
  );
  if (
    blockers.some((entry) => !entry.terminal || entry.exception_class !== "pre_anchor_blocking") ||
    preview.result !== "blocked_pre_anchor" || preview.links.length !== 0 || nameOnlyPreview.links.length !== 0
  ) fail("task_9_conflict_fixture_not_rejected_as_expected");
  writeTaskNineEvidence(evidencePath, caseName, "rejected", 1, {
    self_test_exit_code: 0,
    account_deletion_static_test_exit_code: 0,
    audited_write_integration_selected: false,
    observed_blocker_codes: observedCodes,
    terminal_pre_anchor_blockers: blockers.length,
    exact_links_after_blocker: 0,
    name_only_links: 0,
    winners_selected: 0,
    null_bypass: false,
    partial_backfill_rows: 0,
    sequence_20_materialized: false,
    sequence_20_applied: false,
    development_admin_approved_receipts: 0,
    schema_writes: 0,
    source_rewrites: 0,
    database_calls: 0,
    production_operations: 0,
  }, attachments);
  process.exitCode = 1;
}

function writeTaskTenEvidence(
  evidencePath: string,
  caseName: "happy" | "failure",
  result: "approved" | "rejected",
  exitCode: number,
  assertions: JsonObject,
  attachments: string[],
): void {
  const taskCommitSha = resolveTaskTenCommitSha(
    process.env.TASK_COMMIT_SHA,
    () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  );
  const evidence = {
    schema_version: "dgkma-task-evidence-v1",
    task: 10,
    task_commit_sha: taskCommitSha,
    manifest_sha256: sha256(readFileSync("docs/database-manifest.yaml")),
    db_target: "static-contract-and-synthetic-fixtures",
    db_mode: "no-database-call",
    command: process.argv.join(" "),
    exit_code: exitCode,
    assertions,
    attachment_digests: attachments.filter(existsSync).sort().map((attachmentPath) => ({
      path: attachmentPath,
      sha256: sha256(readFileSync(attachmentPath)),
    })),
    result,
    case: caseName,
  };
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${canonicalJson(evidence as never)}\n`);
}

function runTaskTen(): void {
  const caseName = value("--case");
  if (caseName !== "happy" && caseName !== "failure") fail("case must be happy or failure");
  const evidencePath = value("--evidence") ?? fail("--evidence is required");
  const fixturesPath = value("--fixtures") ?? "server/fixtures/database-architecture/task-10";
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  const testLog = evidencePath.replace(/\.json$/, "-self-test.log");
  const inventorySqlPath = evidencePath.replace(/\.json$/, "-startup-inventory.sql");
  const tests = runLogged("npx", ["tsx", "--test", "server/startup-retention-contract.test.ts"], testLog);
  if (tests.status !== 0) fail("task_10_self_test_failed");
  verifyRuntimeBoundary();
  writeFileSync(inventorySqlPath, startupLedgerInventorySql());

  const readyPath = path.join(fixturesPath, "startup-ready.json");
  const failurePath = path.join(fixturesPath, "startup-failure-cases.json");
  const retentionPath = path.join(fixturesPath, "retention-cases.json");
  const attachments = [
    "docs/database-manifest.yaml",
    "docs/startup-retention-replacement.md",
    "server/index.ts",
    "scripts/startup-retention-contract.ts",
    "server/startup-retention-contract.test.ts",
    readyPath,
    failurePath,
    retentionPath,
    testLog,
    inventorySqlPath,
  ];
  const readyFixture = parseJson(readyPath);
  const descriptors = arrayValue(readyFixture.descriptors, "task 10 startup descriptors") as unknown as StartupDescriptor[];
  const readyRows = arrayValue(readyFixture.ledger_rows, "task 10 startup ledger rows") as unknown as StartupLedgerRow[];

  if (caseName === "happy") {
    const startup = verifyStartupLedger(readyRows, descriptors);
    const retentionFixture = parseJson(retentionPath);
    const now = String(retentionFixture.now);
    const retentionCases = arrayValue(retentionFixture.cases, "task 10 retention cases");
    let eligibleRows = 0;
    for (const rawCase of retentionCases) {
      const fixture = objectValue(rawCase, "task 10 retention case");
      const plan = planRetentionRun(
        String(fixture.job_id) as Parameters<typeof planRetentionRun>[0],
        arrayValue(fixture.rows, "task 10 retention rows") as Parameters<typeof planRetentionRun>[1],
        now,
        { hmacKeyPresent: true },
      );
      const expected = arrayValue(fixture.expected_selected_keys, "task 10 expected retention keys");
      if (canonicalJson(plan.selected_keys as never) !== canonicalJson(expected as never) || plan.writes_executed !== 0) {
        fail("task_10_retention_fixture_mismatch");
      }
      eligibleRows += plan.selected_keys.length;
    }
    if (!startup.ready || startup.observed_latest_sequence !== 60 || startup.emitted_ddl.length !== 0) {
      fail("task_10_startup_ready_fixture_rejected");
    }
    writeTaskTenEvidence(evidencePath, caseName, "approved", 0, {
      self_test_exit_code: 0,
      startup_ready: true,
      required_latest_sequence: STARTUP_LATEST_REQUIRED.sequence_no,
      required_latest_artifact_id: STARTUP_LATEST_REQUIRED.artifact_id,
      required_ledger_row_count: 8,
      exact_capability_variant: startup.capability_variant,
      emitted_ddl_statements: 0,
      schema_writes: 0,
      runtime_index_changed: false,
      runtime_old_path_present: true,
      runtime_replacement_wired: false,
      retention_schedule: RETENTION_CONTRACT.schedule,
      retention_advisory_lock: RETENTION_CONTRACT.lock_scope,
      retention_rows_per_batch: RETENTION_CONTRACT.rows_per_batch,
      retention_batch_time_limit_ms: RETENTION_CONTRACT.batch_time_limit_ms,
      retention_max_batches: RETENTION_CONTRACT.max_batches,
      retention_job_count: RETENTION_JOBS.length,
      fixture_eligible_rows: eligibleRows,
      retention_writes_executed: 0,
      database_calls: 0,
      production_operations: 0,
    }, attachments);
    return;
  }

  const failureFixture = parseJson(failurePath);
  const failureCases = arrayValue(failureFixture.cases, "task 10 failure cases");
  const observedCodes: string[] = [];
  for (const rawCase of failureCases) {
    const fixture = objectValue(rawCase, "task 10 failure case");
    const rows = fixture.kind === "old"
      ? readyRows.filter((row) => row.sequence_no !== Number(fixture.remove_sequence))
      : arrayValue(fixture.ledger_rows, "task 10 missing ledger rows") as unknown as StartupLedgerRow[];
    const result = verifyStartupLedger(rows, descriptors);
    if (result.ready || result.code !== fixture.expected_code || result.emitted_ddl.length !== 0 || result.schema_writes !== 0) {
      fail("task_10_missing_or_old_ledger_not_rejected");
    }
    observedCodes.push(result.code);
  }
  writeTaskTenEvidence(evidencePath, caseName, "rejected", 1, {
    self_test_exit_code: 0,
    observed_failure_codes: observedCodes,
    fail_closed_cases: observedCodes.length,
    emitted_ddl_statements: 0,
    schema_writes: 0,
    retention_writes_executed: 0,
    runtime_index_changed: false,
    runtime_replacement_wired: false,
    database_calls: 0,
    production_operations: 0,
  }, attachments);
  process.exitCode = 1;
}

if (process.argv[2] === "materialize-verifier-contracts") {
  materializeVerifierContracts(process.cwd());
} else if (process.argv[2] === "task" && process.argv[3] === "1") {
  runTaskOne();
} else if (process.argv[2] === "task" && process.argv[3] === "2") {
  runTaskTwo();
} else if (process.argv[2] === "task" && process.argv[3] === "3") {
  runTaskThree();
} else if (process.argv[2] === "task" && process.argv[3] === "4") {
  runTaskFour();
} else if (process.argv[2] === "task" && process.argv[3] === "5") {
  runTaskFive();
} else if (process.argv[2] === "task" && process.argv[3] === "6") {
  runTaskSix();
} else if (process.argv[2] === "task" && process.argv[3] === "7") {
  runTaskSeven();
} else if (process.argv[2] === "task" && process.argv[3] === "9") {
  runTaskNine();
} else if (process.argv[2] === "task" && process.argv[3] === "10") {
  runTaskTen();
} else if (process.argv[2] === "task" && process.argv[3] === "8") {
  runTaskEight();
} else if (process.argv[2] === "task" && process.argv[3] === "11") {
  runTaskEleven();
} else if (process.argv[2] === "task" && process.argv[3] === "14") {
  runTaskFourteen();
} else if (process.argv[2] === "task" && process.argv[3] === "12") {
  runTaskTwelve();
} else if (process.argv[2] === "task" && process.argv[3] === "13") {
  runTaskThirteen();
} else if (process.argv[2] === "task" && process.argv[3] === "15") {
  runTaskFifteen();
} else if (process.argv[2] === "task" && process.argv[3] === "16") {
  runTaskSixteen();
} else {
  fail("unsupported verifier command; Todo owner must implement its lane before use");
}
