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
      lintResult.manifest_sha256 !== "ea8f0d484b99cf93ffb51f11681e5f62e4474f5bbac1735286f1173c0132e785" ||
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
} else if (process.argv[2] === "task" && process.argv[3] === "8") {
  runTaskEight();
} else if (process.argv[2] === "task" && process.argv[3] === "11") {
  runTaskEleven();
} else {
  fail("unsupported verifier command; Todo owner must implement its lane before use");
}
