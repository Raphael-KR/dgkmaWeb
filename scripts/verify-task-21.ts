import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertSensitiveEvidenceAbsent } from "../server/accounting/security-evidence-contract";
import { canonicalJson, sha256 } from "./database-architecture-verifier-contracts";

type JsonObject = Record<string, unknown>;

function value(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(code: string): never {
  throw new Error(code);
}

function parseObject(filePath: string): JsonObject {
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("task_21_fixture_object_required");
  return parsed as JsonObject;
}

function exactKeys(object: JsonObject, expected: readonly string[], code: string): void {
  const actual = Object.keys(object).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function childEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.DATABASE_URL;
  delete environment.PROD_DATABASE_URL;
  delete environment.PROD_DATABASE_READONLY_URL;
  return environment;
}

export function runTaskTwentyOne(): void {
  const caseName = value("--case");
  if (caseName !== "happy" && caseName !== "failure") fail("case must be happy or failure");
  const corpusPath = value("--corpus") ?? fail("--corpus is required");
  const evidencePath = value("--evidence") ?? fail("--evidence is required");
  const fixtureDirectory = value("--fixtures");
  if (corpusPath !== "server/fixtures/database-architecture/task-21/workload-corpus.json") {
    fail("task_21_corpus_path_mismatch");
  }
  if (caseName === "failure" && fixtureDirectory !== "server/fixtures/database-architecture/task-21") {
    fail("task_21_fixture_path_mismatch");
  }

  mkdirSync(path.dirname(evidencePath), { recursive: true });
  const commandLogPath = evidencePath.replace(/\.json$/, "-commands.log");
  const unitLogPath = evidencePath.replace(/\.json$/, "-unit.log");
  const workloadEvidencePath = evidencePath.replace(/\.json$/, "-workload.json");
  const securityLogPath = evidencePath.replace(/\.json$/, "-disposable-security.log");
  const environment = childEnvironment();
  const commandLog: string[] = [];

  const invoke = (command: string, args: string[], expectedStatus = 0): string => {
    const result = spawnSync(command, args, { cwd: process.cwd(), env: environment, encoding: "utf8" });
    commandLog.push(`$ ${command} ${args.join(" ")}`, result.stdout ?? "", result.stderr ?? "");
    if ((result.status ?? 1) !== expectedStatus) {
      writeFileSync(commandLogPath, commandLog.join("\n"));
      fail(`task_21_command_status:${command}:${result.status}`);
    }
    return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  };

  const testFiles = [
    "server/account-deletion-routes.test.ts",
    "server/account-deletion-storage.test.ts",
    "server/kakao-termination-race.test.ts",
    "server/route-security.test.ts",
    "server/startup-retention-contract.test.ts",
    "server/accounting/security-evidence-contract.test.ts",
  ];
  invoke("npm", ["run", "check"]);
  const unitOutput = invoke("node", ["--import", "tsx", "--test", ...testFiles]);
  writeFileSync(unitLogPath, unitOutput);
  if (!unitOutput.includes("# fail 0")) fail("task_21_unit_failure");

  const workloadArguments = [
    "tsx", "scripts/verify-database-index-workload.ts", "--case", caseName,
    "--corpus", corpusPath, "--evidence", workloadEvidencePath,
  ];
  if (caseName === "failure") workloadArguments.push("--fixtures", fixtureDirectory!);
  invoke("npx", workloadArguments, caseName === "failure" ? 1 : 0);
  const workloadEvidence = parseObject(workloadEvidencePath);
  if (workloadEvidence.result !== (caseName === "happy" ? "approved" : "rejected")) {
    fail("task_21_workload_result_mismatch");
  }

  if (caseName === "failure") {
    const fixtures = parseObject(path.join(fixtureDirectory!, "failure-cases.json"));
    exactKeys(fixtures, ["schema_version", "cases"], "task_21_failure_fixture_keys");
    if (fixtures.schema_version !== "dgkma-task21-failure-cases-v1" || !Array.isArray(fixtures.cases)) {
      fail("task_21_failure_fixture_shape");
    }
    const cases = fixtures.cases as JsonObject[];
    if (cases.length !== 2 || cases[0].kind !== "public_routine_grant" || cases[1].kind !== "credential_log") {
      fail("task_21_failure_fixture_closed_set");
    }
    const chunks = cases[1].chunks;
    if (!Array.isArray(chunks) || chunks.some((chunk) => typeof chunk !== "string")) {
      fail("task_21_credential_fixture_shape");
    }
    let credentialFailure = "none";
    try {
      assertSensitiveEvidenceAbsent(chunks as string[]);
    } catch (error) {
      credentialFailure = error instanceof Error ? error.message : "unknown";
    }
    if (credentialFailure !== "sensitive_evidence_detected") fail("task_21_credential_fixture_not_detected");
  }

  const runUid = randomUUID();
  const actorReceiptPath = path.join(path.dirname(evidencePath), `${runUid}-admin.json`);
  let databaseMayExist = false;
  let securityOutput = "";
  try {
    databaseMayExist = true;
    invoke("npx", [
      "tsx", "scripts/apply-schema.ts", "--target", "disposable-test", "--run-uid", runUid,
      "--through-sequence", "40",
    ]);
    invoke("npx", [
      "tsx", "scripts/create-disposable-admin.ts", "--target", "disposable-test", "--run-uid", runUid,
      "--receipt", actorReceiptPath,
    ]);
    invoke("npx", [
      "tsx", "scripts/apply-schema.ts", "--target", "disposable-test", "--run-uid", runUid,
      "--from-sequence", "50", "--through-sequence", "130", "--actor-receipt", actorReceiptPath,
    ]);
    securityOutput = invoke("npx", [
      "tsx", "scripts/task-21-disposable-security.ts", "--target", "disposable-test", "--run-uid", runUid,
    ]);
    databaseMayExist = false;
  } finally {
    if (databaseMayExist) {
      invoke("npx", [
        "tsx", "scripts/teardown-disposable-target.ts", "--target", "disposable-test", "--run-uid", runUid,
      ]);
    }
    if (existsSync(actorReceiptPath)) unlinkSync(actorReceiptPath);
  }
  writeFileSync(securityLogPath, securityOutput);
  if (
    !securityOutput.includes('"public_routine_grant_detected":true') ||
    !securityOutput.includes('"catalog_restored":true') ||
    !securityOutput.includes('"absent":true') ||
    existsSync(actorReceiptPath)
  ) {
    fail("task_21_disposable_security_result_mismatch");
  }

  writeFileSync(commandLogPath, commandLog.join("\n"));
  assertSensitiveEvidenceAbsent([
    readFileSync(unitLogPath, "utf8"),
    readFileSync(workloadEvidencePath, "utf8"),
    readFileSync(securityLogPath, "utf8"),
    readFileSync(commandLogPath, "utf8"),
  ]);
  const attachments = [corpusPath, unitLogPath, workloadEvidencePath, securityLogPath, commandLogPath];
  if (caseName === "failure") {
    attachments.push(path.join(fixtureDirectory!, "failure-cases.json"), path.join(fixtureDirectory!, "redundant-candidate.json"));
  }
  const evidence = {
    schema_version: "dgkma-task-evidence-v1",
    task: 21,
    case: caseName,
    task_commit_sha: process.env.TASK_COMMIT_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    db_target: "development+uuid-bound-disposable-test",
    db_mode: caseName === "happy" ? "retention-security-workload-measurement" : "fail-closed-security-and-index-refusal",
    command: process.argv.join(" "),
    exit_code: caseName === "happy" ? 0 : 1,
    assertions: {
      unit_tests_failed: 0,
      workload_result: workloadEvidence.result,
      public_routine_grant_detected: true,
      catalog_restored_after_rollback: true,
      synthetic_credential_log_detected: caseName === "failure",
      disposable_teardown_absent: true,
      actor_receipt_absent: true,
      production_operations: 0,
    },
    attachment_digests: attachments.sort().map((attachment) => ({
      path: attachment,
      sha256: sha256(readFileSync(attachment)),
    })),
    result: caseName === "happy" ? "approved" : "rejected",
  };
  writeFileSync(evidencePath, `${canonicalJson(evidence as never)}\n`);
  if (caseName === "failure") process.exitCode = 1;
}
