import {
  createOrResumeDisposableTarget,
  createTargetPool,
  resolveDisposableControlTarget,
  shutdownPool,
  teardownDisposableTarget,
  verifyDevelopmentTarget,
} from "../server/db-target";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing_argument:${name}`);
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  if (argument("--target") !== "disposable-test") throw new Error("disposable_teardown_target_forbidden");
  const runUid = argument("--run-uid");
  const resolved = resolveDisposableControlTarget(process.env, runUid);
  const controlPool = createTargetPool(resolved);
  try {
    const development = await verifyDevelopmentTarget(controlPool, { ...resolved, kind: "development" });
    const disposable = await createOrResumeDisposableTarget(controlPool, development, runUid);
    const result = await teardownDisposableTarget(controlPool, disposable);
    console.log(JSON.stringify({ schema_version: "dgkma-disposable-teardown-v1", ...result, result: "approved" }));
  } finally {
    await shutdownPool(controlPool);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ schema_version: "dgkma-disposable-teardown-error-v1", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" }));
  process.exitCode = 1;
});
