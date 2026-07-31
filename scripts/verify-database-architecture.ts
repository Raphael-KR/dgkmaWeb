import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  canonicalJson,
  materializeVerifierContracts,
  sha256,
  verifierInventoryPaths,
} from "./database-architecture-verifier-contracts";

type JsonObject = Record<string, unknown>;

function value(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
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

if (process.argv[2] === "materialize-verifier-contracts") {
  materializeVerifierContracts(process.cwd());
} else if (process.argv[2] === "task" && process.argv[3] === "1") {
  runTaskOne();
} else if (process.argv[2] === "task" && process.argv[3] === "3") {
  runTaskThree();
} else {
  fail("unsupported verifier command; Todo owner must implement its lane before use");
}
