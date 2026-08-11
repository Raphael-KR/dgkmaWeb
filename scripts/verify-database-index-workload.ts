import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson, sha256 } from "./database-architecture-verifier-contracts";

type JsonObject = Record<string, unknown>;

type Corpus = {
  schema_version: string;
  expected_database: string;
  cardinality_tables: string[];
  existing_indexes: string[];
  manifest_owned_indexes: Array<{
    name: string;
    table: string;
    columns: string[];
    kind: "index" | "unique";
    purpose: string;
    state: "existing_reused" | "fixed_not_yet_applied";
  }>;
  workloads: Array<{
    id: string;
    query: string;
    required_prefix: string[];
    manifest_index: string | null;
  }>;
  rejected_future_candidates: Array<{
    name: string;
    table: string;
    columns: string[];
    kind: "index";
    definition: string;
    workload_id: string;
    reason: string;
  }>;
  forbidden_candidate_families: string[];
};

function fail(message: string): never {
  throw new Error(message);
}

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseObject(filePath: string): JsonObject {
  if (!existsSync(filePath)) fail("missing file: " + filePath);
  const value = JSON.parse(readFileSync(filePath, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("object required: " + filePath);
  }
  return value as JsonObject;
}

function exactKeys(value: JsonObject, expected: string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(label + ": unexpected key set");
  }
}

function childEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  const forbidden = new Set(["DATABASE_URL", "PROD_DATABASE_URL", "PROD_DATABASE_READONLY_URL"]);
  for (const key of Object.keys(process.env)) {
    if (!forbidden.has(key)) environment[key] = process.env[key];
  }
  return environment;
}

function utf8Prefix(value: string, byteLimit: number): string {
  let result = "";
  for (const character of value) {
    if (Buffer.byteLength(result + character, "utf8") > byteLimit) break;
    result += character;
  }
  return result;
}

function deterministicObjectName(
  table: string,
  columns: string[],
  kind: "index" | "unique",
): string {
  const suffix = kind === "unique" ? "key" : "idx";
  const fullName = table + "__" + columns.join("_") + "__" + suffix;
  if (Buffer.byteLength(fullName, "utf8") <= 63) return fullName;
  return utf8Prefix(fullName, 52) + "_" + sha256(fullName).slice(0, 10);
}

function runPsql(sql: string): string {
  const result = spawnSync(
    "psql",
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: childEnvironment(),
    },
  );
  if (result.status !== 0) {
    fail("psql failed with status " + String(result.status) + ": " + result.stderr.trim());
  }
  return result.stdout.trim();
}

function parseCorpus(filePath: string): Corpus {
  const value = parseObject(filePath);
  exactKeys(
    value,
    [
      "schema_version",
      "expected_database",
      "cardinality_tables",
      "existing_indexes",
      "manifest_owned_indexes",
      "workloads",
      "rejected_future_candidates",
      "forbidden_candidate_families",
    ],
    "workload corpus",
  );
  if (value.schema_version !== "dgkma-task-8-workload-corpus-v1") fail("corpus version mismatch");
  const corpus = value as unknown as Corpus;
  if (
    corpus.expected_database !== "heliumdb" ||
    corpus.cardinality_tables.length !== 13 ||
    corpus.existing_indexes.length !== 20 ||
    corpus.manifest_owned_indexes.length !== 16 ||
    corpus.workloads.length !== 15 ||
    corpus.rejected_future_candidates.length !== 6
  ) {
    fail("corpus closed-set count mismatch");
  }
  for (const workload of corpus.workloads) {
    if (
      !/^[a-z0-9_]+$/.test(workload.id) ||
      !workload.query.startsWith("SELECT ") ||
      /^(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(workload.query) ||
      workload.query.includes(";")
    ) {
      fail("unsafe workload: " + workload.id);
    }
  }
  const manifestNames = new Set<string>();
  for (const index of corpus.manifest_owned_indexes) {
    if (manifestNames.has(index.name) || Buffer.byteLength(index.name, "utf8") > 63) {
      fail("invalid or duplicate manifest-owned index identity: " + index.name);
    }
    manifestNames.add(index.name);
    if (
      index.state === "fixed_not_yet_applied" &&
      index.name !== deterministicObjectName(index.table, index.columns, index.kind)
    ) {
      fail("noncanonical manifest-owned index identity: " + index.name);
    }
  }
  for (const workload of corpus.workloads) {
    if (workload.required_prefix.length > 0 && !workload.manifest_index) {
      fail("required workload prefix has no manifest index: " + workload.id);
    }
    for (const name of workload.manifest_index?.split("+") ?? []) {
      if (!manifestNames.has(name)) fail("unknown manifest workload reference: " + name);
    }
  }
  for (const candidate of corpus.rejected_future_candidates) {
    if (
      candidate.name !== deterministicObjectName(candidate.table, candidate.columns, candidate.kind) ||
      Buffer.byteLength(candidate.name, "utf8") > 63
    ) {
      fail("noncanonical rejected candidate identity: " + candidate.name);
    }
  }
  return corpus;
}

function normalizePlan(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizePlan);
  if (!value || typeof value !== "object") return value;
  const ignored = new Set([
    "Actual Startup Time",
    "Actual Total Time",
    "Actual Rows",
    "Actual Loops",
    "Rows Removed by Filter",
    "Rows Removed by Join Filter",
    "Heap Fetches",
    "Exact Heap Blocks",
    "Lossy Heap Blocks",
    "Planning Time",
    "Execution Time",
    "I/O Read Time",
    "I/O Write Time",
    "Shared Hit Blocks",
    "Shared Read Blocks",
    "Shared Dirtied Blocks",
    "Shared Written Blocks",
    "Local Hit Blocks",
    "Local Read Blocks",
    "Local Dirtied Blocks",
    "Local Written Blocks",
    "Temp Read Blocks",
    "Temp Written Blocks",
  ]);
  const output: JsonObject = {};
  for (const key of Object.keys(value as JsonObject).sort()) {
    if (!ignored.has(key)) output[key] = normalizePlan((value as JsonObject)[key]);
  }
  return output;
}

function collectPlanFacts(value: unknown, facts: { nodes: string[]; indexes: string[] }): void {
  if (Array.isArray(value)) {
    for (const item of value) collectPlanFacts(item, facts);
    return;
  }
  if (!value || typeof value !== "object") return;
  const object = value as JsonObject;
  if (typeof object["Node Type"] === "string") facts.nodes.push(object["Node Type"]);
  if (typeof object["Index Name"] === "string") facts.indexes.push(object["Index Name"]);
  for (const child of Object.values(object)) collectPlanFacts(child, facts);
}

function planSql(query: string): string {
  const begin = query.includes("FOR UPDATE")
    ? "BEGIN;"
    : "BEGIN TRANSACTION READ ONLY;";
  return [
    begin,
    "SET LOCAL statement_timeout = '10s';",
    "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + query + ";",
    "ROLLBACK;",
  ].join("\n");
}

function writeEvidence(
  evidencePath: string,
  result: "approved" | "rejected",
  assertions: JsonObject,
  attachments: string[],
): void {
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const evidence = {
    schema_version: "dgkma-task-evidence-v1",
    task: 8,
    task_commit_sha: process.env.TASK_COMMIT_SHA ?? currentHead,
    plan_sha256: sha256(readFileSync("docs/plans/database-architecture-audit.md")),
    manifest_sha256: null,
    db_target: "development",
    db_mode: result === "approved" ? "analyze+read-only-measurement" : "static-refusal",
    command: process.argv.join(" "),
    exit_code: result === "approved" ? 0 : 1,
    assertions,
    attachment_digests: attachments
      .filter(existsSync)
      .sort()
      .map((attachment) => ({
        path: attachment,
        sha256: sha256(readFileSync(attachment)),
      })),
    result,
  };
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, canonicalJson(evidence as never) + "\n");
}

function protectedSourceDigests(): JsonObject {
  const paths = [
    "docs/plans/database-architecture-audit.md",
    "scripts/database-schema-catalog.sql",
    "migrations/0000_cheerful_nick_fury.sql",
    "migrations/meta/_journal.json",
  ];
  const values: JsonObject = {};
  for (const sourcePath of paths) values[sourcePath] = sha256(readFileSync(sourcePath));
  values["docs/database-manifest.yaml"] = existsSync("docs/database-manifest.yaml")
    ? sha256(readFileSync("docs/database-manifest.yaml"))
    : "absent_before_todo_2";
  return values;
}

export function expectedCurrentIndexNames(corpus: Corpus): string[] {
  const manifest = parseObject("docs/database-manifest.yaml") as unknown as {
    indexes?: Array<{ name?: unknown }>;
    unique_constraints?: Array<{ name?: unknown }>;
    primary_keys?: Array<{ name?: unknown }>;
  };
  const manifestNames = [manifest.indexes, manifest.unique_constraints, manifest.primary_keys]
    .flatMap((entries) => entries ?? [])
    .map((entry) => entry.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
  const unapplied = new Set(corpus.manifest_owned_indexes.filter((entry) => entry.state === "fixed_not_yet_applied").map((entry) => entry.name));
  const names = new Set([...corpus.existing_indexes, ...manifestNames]);
  for (const name of unapplied) names.delete(name);
  for (const name of [
    "alumni_database__matched_user_id__idx",
    "event_parse_rate_limits__user_id__idx",
    "pending_registrations__pii_redaction_operation_uid__idx",
    "schema_release_runs__target_fingerprint__key",
  ]) names.delete(name);
  names.add("schema_capability_receipts__preflight_run_uid__key");
  return [...names].sort();
}

function analyzeSql(corpus: Corpus): string {
  for (const table of corpus.cardinality_tables) {
    if (!/^[a-z_]+$/.test(table)) fail("unsafe table identifier");
  }
  return [
    "DO $task8$",
    "BEGIN",
    "  IF current_database() <> 'heliumdb' THEN",
    "    RAISE EXCEPTION 'unexpected database';",
    "  END IF;",
    "END",
    "$task8$;",
    "SET statement_timeout = '30s';",
    "ANALYZE " + corpus.cardinality_tables.map((table) => "public." + table).join(", ") + ";",
  ].join("\n");
}

function cardinalitySql(corpus: Corpus): string {
  const rows = corpus.cardinality_tables.map(
    (table) =>
      "SELECT '" + table + "'::text AS table_name, count(*)::bigint AS row_count FROM public." + table,
  );
  return [
    "BEGIN TRANSACTION READ ONLY;",
    "SET LOCAL statement_timeout = '30s';",
    "SELECT jsonb_agg(to_jsonb(cardinality) ORDER BY table_name)::text",
    "FROM (" + rows.join(" UNION ALL ") + ") AS cardinality;",
    "ROLLBACK;",
  ].join("\n");
}

const indexCatalogSql = [
  "BEGIN TRANSACTION READ ONLY;",
  "SET LOCAL statement_timeout = '10s';",
  "SELECT jsonb_agg(to_jsonb(index_row) ORDER BY table_name,index_name)::text",
  "FROM (",
  "  SELECT tbl.relname AS table_name, idx.relname AS index_name,",
  "    i.indisunique AS is_unique, i.indisprimary AS is_primary,",
  "    pg_catalog.pg_get_indexdef(i.indexrelid,0,true) AS definition",
  "  FROM pg_catalog.pg_index i",
  "  JOIN pg_catalog.pg_class tbl ON tbl.oid=i.indrelid",
  "  JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid",
  "  JOIN pg_catalog.pg_namespace n ON n.oid=tbl.relnamespace",
  "  WHERE n.nspname='public'",
  ") AS index_row;",
  "ROLLBACK;",
].join("\n");

function runStaticTest(logPath: string): void {
  const args = ["tsx", "--test", "server/database-index-workload.test.ts"];
  const result = spawnSync("npx", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: childEnvironment(),
  });
  writeFileSync(
    logPath,
    [
      "command=npx " + args.join(" "),
      "status=" + String(result.status),
      result.stdout,
      result.stderr,
    ].join("\n"),
  );
  if (result.status !== 0) fail("task 8 self-test failed");
}

function rejectRedundantCandidate(corpus: Corpus, fixturePath: string): JsonObject {
  const fixture = parseObject(fixturePath);
  exactKeys(
    fixture,
    ["schema_version", "candidate", "expected_error", "expected_schema_writes"],
    "negative fixture",
  );
  if (
    fixture.schema_version !== "dgkma-task-8-negative-fixture-v1" ||
    fixture.expected_error !== "candidate duplicates manifest-owned left prefix" ||
    fixture.expected_schema_writes !== 0
  ) {
    fail("negative fixture contract mismatch");
  }
  const candidate = fixture.candidate as JsonObject;
  exactKeys(
    candidate,
    ["name", "table", "columns", "kind", "definition", "workload_id"],
    "negative candidate",
  );
  const match = String(candidate.definition).match(
    /^CREATE INDEX ON public\.([a-z_]+) \(([a-z_]+)\)$/,
  );
  if (!match) fail("negative candidate shape mismatch");
  const candidateColumns = candidate.columns as unknown[];
  if (
    candidate.table !== match[1] ||
    candidate.kind !== "index" ||
    candidateColumns.length !== 1 ||
    candidateColumns[0] !== match[2] ||
    candidate.name !== deterministicObjectName(match[1], [match[2]], "index")
  ) {
    fail("negative candidate identity mismatch");
  }
  const duplicate = corpus.manifest_owned_indexes.some(
    (index) => index.table === match[1] && index.columns[0] === match[2],
  );
  if (!duplicate) fail("redundant candidate was admitted");
  return {
    candidate_name: candidate.name,
    observed_error: fixture.expected_error,
    schema_writes: 0,
    result: "rejected",
  };
}

export function runTaskEight(): void {
  const caseName = flagValue("--case");
  if (caseName !== "happy" && caseName !== "failure") fail("case must be happy or failure");
  const corpusPath = flagValue("--corpus") ?? fail("--corpus is required");
  const evidencePath = flagValue("--evidence") ?? fail("--evidence is required");
  const corpus = parseCorpus(corpusPath);
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  const selfTestPath = evidencePath.replace(/\.json$/, "-self-test.log");
  runStaticTest(selfTestPath);
  const attachments = [
    corpusPath,
    selfTestPath,
    "server/database-index-workload.test.ts",
    "scripts/verify-database-index-workload.ts",
  ];

  if (caseName === "failure") {
    const fixtureDirectory = flagValue("--fixtures") ?? fail("--fixtures is required");
    const fixturePath = path.join(fixtureDirectory, "redundant-candidate.json");
    const refusal = rejectRedundantCandidate(corpus, fixturePath);
    attachments.push(fixturePath);
    writeEvidence(
      evidencePath,
      "rejected",
      {
        catalog_self_test_exit_code: 0,
        redundant_candidate_refused: "approved",
        candidate: refusal,
        database_calls: 0,
        schema_writes: 0,
      },
      attachments,
    );
    process.exitCode = 1;
    return;
  }

  if (!process.env.REPL_ID || process.env.PGHOST !== "helium") {
    fail("task 8 requires the Replit Development PG environment");
  }
  const identity = runPsql(
    "SELECT current_database()||'|'||pg_catalog.to_regrole(current_user)::oid::text||'|'||current_setting('server_version_num')",
  ).split("|");
  if (identity[0] !== corpus.expected_database || identity[1] !== "10" || identity[2] !== "160010") {
    fail("Development identity mismatch");
  }

  const protectedBefore = protectedSourceDigests();
  const indexBefore = JSON.parse(runPsql(indexCatalogSql)) as JsonObject[];
  const currentIndexNames = indexBefore.map((row) => String(row.index_name)).sort();
  const expectedIndexNames = expectedCurrentIndexNames(corpus);
  if (
    currentIndexNames.length !== expectedIndexNames.length ||
    currentIndexNames.some((name, index) => name !== expectedIndexNames[index])
  ) {
    const current = new Set(currentIndexNames); const expected = new Set(expectedIndexNames);
    fail("Development existing index set mismatch:" + canonicalJson({ missing: expectedIndexNames.filter((name) => !current.has(name)), extra: currentIndexNames.filter((name) => !expected.has(name)) } as never));
  }
  const cardinalitiesBefore = JSON.parse(runPsql(cardinalitySql(corpus))) as JsonObject[];

  const analyzeLogPath = evidencePath.replace(/\.json$/, "-analyze.log");
  const analyzeResult = spawnSync(
    "psql",
    ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", analyzeSql(corpus)],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: childEnvironment(),
    },
  );
  writeFileSync(
    analyzeLogPath,
    [
      "command=psql -X -q -v ON_ERROR_STOP=1 -c <identity-gated ANALYZE 13 public tables>",
      "status=" + String(analyzeResult.status),
      analyzeResult.stdout,
      analyzeResult.stderr,
    ].join("\n"),
  );
  attachments.push(analyzeLogPath);
  if (analyzeResult.status !== 0) fail("Development ANALYZE failed");

  const runSummaries: JsonObject[][] = [];
  for (let run = 1; run <= 2; run += 1) {
    const summaries: JsonObject[] = [];
    for (const workload of corpus.workloads) {
      const raw = runPsql(planSql(workload.query));
      const parsed = JSON.parse(raw);
      const planPath = evidencePath.replace(
        /\.json$/,
        "-run-" + String(run) + "-" + workload.id + ".json",
      );
      writeFileSync(planPath, canonicalJson(parsed as never) + "\n");
      attachments.push(planPath);
      const facts = { nodes: [] as string[], indexes: [] as string[] };
      collectPlanFacts(parsed, facts);
      summaries.push({
        workload_id: workload.id,
        plan_path: planPath,
        plan_sha256: sha256(readFileSync(planPath)),
        normalized_plan_sha256: sha256(canonicalJson(normalizePlan(parsed) as never)),
        node_types: facts.nodes,
        indexes_used: [...new Set(facts.indexes)].sort(),
      });
    }
    runSummaries.push(summaries);
  }
  for (let index = 0; index < corpus.workloads.length; index += 1) {
    if (
      runSummaries[0][index].normalized_plan_sha256 !==
      runSummaries[1][index].normalized_plan_sha256
    ) {
      fail("two-run structural plan drift: " + corpus.workloads[index].id);
    }
  }

  const indexAfter = JSON.parse(runPsql(indexCatalogSql)) as JsonObject[];
  if (canonicalJson(indexBefore as never) !== canonicalJson(indexAfter as never)) {
    fail("index catalog changed during measurement");
  }
  const cardinalitiesAfter = JSON.parse(runPsql(cardinalitySql(corpus))) as JsonObject[];
  if (canonicalJson(cardinalitiesBefore as never) !== canonicalJson(cardinalitiesAfter as never)) {
    fail("table cardinalities changed during measurement");
  }
  const cardinalityPath = evidencePath.replace(/\.json$/, "-cardinalities.json");
  writeFileSync(
    cardinalityPath,
    canonicalJson({ before: cardinalitiesBefore, after: cardinalitiesAfter } as never) + "\n",
  );
  attachments.push(cardinalityPath);
  const protectedAfter = protectedSourceDigests();
  if (canonicalJson(protectedBefore as never) !== canonicalJson(protectedAfter as never)) {
    fail("protected manifest/artifact bytes changed during measurement");
  }
  const paymentCardinality = cardinalitiesAfter.find((row) => row.table_name === "payments");
  if (!paymentCardinality) fail("payments cardinality missing");
  const paymentPlans = runSummaries.map((run) =>
    run.find((plan) => plan.workload_id === "payment_history") ?? fail("payment plan missing"),
  );
  const paymentIndexName = "payments__user_id__idx";
  const paymentIndexInstalled = currentIndexNames.includes(paymentIndexName);
  const paymentRuntimeEffectivenessProven =
    Number(paymentCardinality.row_count) > 0 &&
    paymentIndexInstalled &&
    paymentPlans.every((plan) =>
      (plan.indexes_used as string[]).includes(paymentIndexName),
    );
  const paymentsUserIdMeasurement = {
    row_count: Number(paymentCardinality.row_count),
    planned_index: paymentIndexName,
    planned_index_state: "fixed_not_yet_applied",
    installed: paymentIndexInstalled,
    baseline_query_shape_measured: true,
    observed_node_types: paymentPlans.map((plan) => plan.node_types),
    observed_indexes_used: paymentPlans.map((plan) => plan.indexes_used),
    runtime_effectiveness_proven: paymentRuntimeEffectivenessProven,
  };

  const summaryPath = evidencePath.replace(/\.json$/, "-measurement-summary.json");
  const summary = {
    schema_version: "dgkma-task-8-measurement-v1",
    target: {
      database: identity[0],
      user_oid: Number(identity[1]),
      server_version_num: Number(identity[2]),
    },
    analyze: {
      tables: corpus.cardinality_tables,
      only_permitted_statistics_write: true,
    },
    cardinalities: {
      before: cardinalitiesBefore,
      after: cardinalitiesAfter,
    },
    existing_indexes: indexBefore,
    manifest_owned_indexes: corpus.manifest_owned_indexes,
    rejected_future_candidates: corpus.rejected_future_candidates.map((candidate) => ({
      ...candidate,
      saved_plan_paths: [1, 2].map((run) =>
        evidencePath.replace(/\.json$/, "-run-" + String(run) + "-" + candidate.workload_id + ".json"),
      ),
    })),
    forbidden_candidate_families: corpus.forbidden_candidate_families,
    payments_user_id_measurement: paymentsUserIdMeasurement,
    runs: runSummaries,
    protected_source_digests: protectedAfter,
    schema_or_business_data_writes: 0,
  };
  writeFileSync(summaryPath, canonicalJson(summary as never) + "\n");
  attachments.push(summaryPath);

  const secretPattern =
    /postgres(?:ql)?:\/\/|password\s*=|api[_-]?key\s*=|client[_-]?secret\s*=/i;
  for (const attachment of attachments.filter((item) => item.startsWith(path.dirname(evidencePath)))) {
    if (secretPattern.test(readFileSync(attachment, "utf8"))) {
      fail("secret-shaped content in task 8 attachment");
    }
  }
  writeEvidence(
    evidencePath,
    "approved",
    {
      catalog_self_test_exit_code: 0,
      analyze_exit_code: 0,
      cardinality_table_count: cardinalitiesAfter.length,
      cardinalities_unchanged: true,
      workload_count: corpus.workloads.length,
      measurement_runs: 2,
      structurally_stable_plans: corpus.workloads.length,
      existing_index_count: indexBefore.length,
      manifest_owned_index_count: corpus.manifest_owned_indexes.length,
      rejected_future_candidate_count: corpus.rejected_future_candidates.length,
      payments_user_id_baseline_query_shape_measured: true,
      payments_user_id_runtime_effectiveness_proven: paymentRuntimeEffectivenessProven,
      protected_bytes_unchanged: true,
      schema_or_business_data_writes: 0,
      statistics_write: "ANALYZE only",
    },
    attachments,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runTaskEight();
}
