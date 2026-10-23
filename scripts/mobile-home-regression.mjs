const MINIMUM_RUNS = 5;
const METRICS = [
  {
    key: "stableRequests",
    label: "cold home stable request count (excluding font CDN and injected dev banner)",
    value: (run) => run.stableRequestCount,
    allowedIncrease: (baseline) => 1,
  },
  {
    key: "localTransferredBytes",
    label: "cold home local transferred bytes",
    value: (run) => run.localTransferredBytes,
    allowedIncrease: (baseline) => Math.max(baseline * 0.05, 32 * 1024),
  },
  {
    key: "externalTransferredBytes",
    label: "cold home external transferred bytes",
    value: (run) => run.externalTransferredBytes,
    allowedIncrease: (baseline) => Math.max(baseline * 0.35, 100 * 1024),
  },
  {
    key: "lcpMs",
    label: "cold home LCP",
    value: (run) => run.pageMetrics?.lcp?.startTime,
    allowedIncrease: (baseline) => Math.max(baseline * 0.25, 750),
  },
];

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const result = sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(result * 100) / 100;
}

function assertValidRuns(runs) {
  if (!Array.isArray(runs) || runs.length < MINIMUM_RUNS) {
    throw new Error(`Mobile home comparison needs at least ${MINIMUM_RUNS} cold runs`);
  }
  for (const [index, run] of runs.entries()) {
    for (const metric of METRICS) {
      if (!Number.isFinite(metric.value(run))) {
        throw new Error(`Cold run ${index + 1} is missing a valid ${metric.key} measurement`);
      }
    }
  }
}

export function canonicalAssetResource(resource, scope) {
  const parsed = new URL(resource);
  const pathname = parsed.pathname.startsWith("/assets/")
    ? parsed.pathname.replace(/^(\/assets\/.*)-([-A-Za-z0-9_]{8,})(\.[^/.]+)$/, "$1-<hash>$3")
    : parsed.pathname;
  return scope === "local" ? pathname : `${parsed.origin}${pathname}`;
}

function aggregateAssets(runs) {
  const byResource = new Map();
  for (const run of runs) {
    const thisRun = new Map();
    for (const asset of run.assetDetails ?? []) {
      const resource = canonicalAssetResource(asset.resource, asset.scope);
      const key = `${asset.scope}:${resource}`;
      const current = thisRun.get(key) ?? { scope: asset.scope, resource, requests: 0, transferredBytes: 0 };
      current.requests += 1;
      current.transferredBytes += asset.transferredBytes;
      thisRun.set(key, current);
    }
    for (const [key, asset] of thisRun) {
      const samples = byResource.get(key) ?? {
        scope: asset.scope,
        resource: asset.resource,
        requests: [],
        transferredBytes: [],
      };
      samples.requests.push(asset.requests);
      samples.transferredBytes.push(asset.transferredBytes);
      byResource.set(key, samples);
    }
  }
  return [...byResource.values()]
    .map((asset) => ({
      scope: asset.scope,
      resource: asset.resource,
      medianRequests: median(asset.requests),
      medianTransferredBytes: median(asset.transferredBytes),
    }))
    .sort((left, right) => right.medianTransferredBytes - left.medianTransferredBytes);
}

function summarizeMetrics(runs) {
  return Object.fromEntries(METRICS.map((metric) => [
    metric.key,
    median(runs.map(metric.value)),
  ]));
}

export function createMobileHomeBaseline(runs, createdAt = new Date().toISOString()) {
  assertValidRuns(runs);
  return {
    schemaVersion: 1,
    scenario: "coldHome",
    createdAt,
    runCount: runs.length,
    metrics: summarizeMetrics(runs),
    assets: aggregateAssets(runs),
  };
}

function buildAssetIncreases(currentAssets, baselineAssets, scope, sortBy = "bytes") {
  const baselineByResource = new Map(
    baselineAssets
      .filter((asset) => asset.scope === scope)
      .map((asset) => [asset.resource, asset]),
  );
  return currentAssets
    .filter((asset) => scope === "all" || asset.scope === scope)
    .map((asset) => ({
      resource: asset.resource,
      scope: asset.scope,
      baselineBytes: baselineByResource.get(asset.resource)?.medianTransferredBytes ?? 0,
      currentBytes: asset.medianTransferredBytes,
      increaseBytes: asset.medianTransferredBytes -
        (baselineByResource.get(asset.resource)?.medianTransferredBytes ?? 0),
      baselineRequests: baselineByResource.get(asset.resource)?.medianRequests ?? 0,
      currentRequests: asset.medianRequests,
      increaseRequests: asset.medianRequests -
        (baselineByResource.get(asset.resource)?.medianRequests ?? 0),
    }))
    .filter((asset) => asset.increaseBytes > 0 || asset.increaseRequests > 0)
    .sort((left, right) => sortBy === "requests"
      ? right.increaseRequests - left.increaseRequests || right.increaseBytes - left.increaseBytes
      : right.increaseBytes - left.increaseBytes || right.increaseRequests - left.increaseRequests)
    .slice(0, 5);
}

export function evaluateMobileHomeRegression(runs, baseline) {
  assertValidRuns(runs);
  if (baseline?.schemaVersion !== 1 || baseline.scenario !== "coldHome") {
    throw new Error("Mobile home baseline is missing or has an unsupported schema; use the explicit baseline update command");
  }
  for (const metric of METRICS) {
    if (!Number.isFinite(baseline.metrics?.[metric.key])) {
      throw new Error(`Mobile home baseline is missing ${metric.key}`);
    }
  }

  const currentMetrics = summarizeMetrics(runs);
  const currentAssets = aggregateAssets(runs);
  const requiredExceedingRuns = Math.ceil(runs.length * 0.8);
  const checks = METRICS.map((metric) => {
    const baselineValue = baseline.metrics[metric.key];
    const limit = Math.round((baselineValue + metric.allowedIncrease(baselineValue)) * 100) / 100;
    const values = runs.map(metric.value);
    const exceedingRuns = values.filter((value) => value > limit).length;
    const passed = currentMetrics[metric.key] <= limit || exceedingRuns < requiredExceedingRuns;
    const scope = metric.key === "externalTransferredBytes"
      ? "external"
      : metric.key === "stableRequests" || metric.key === "lcpMs" ? "all" : "local";
    return {
      key: metric.key,
      label: metric.label,
      baseline: baselineValue,
      currentMedian: currentMetrics[metric.key],
      limit,
      delta: Math.round((currentMetrics[metric.key] - baselineValue) * 100) / 100,
      exceedingRuns,
      requiredExceedingRuns,
      passed,
      largestAssetIncreases: passed ? [] : buildAssetIncreases(
        currentAssets,
        baseline.assets ?? [],
        scope,
        metric.key === "stableRequests" ? "requests" : "bytes",
      ),
    };
  });
  const failures = checks.filter((check) => !check.passed).map((check) => ({
    key: check.key,
    label: check.label,
    median: check.currentMedian,
    baseline: check.baseline,
    limit: check.limit,
    delta: check.delta,
    exceedingRuns: check.exceedingRuns,
    requiredExceedingRuns: check.requiredExceedingRuns,
    largestAssetIncreases: check.largestAssetIncreases,
  }));
  return {
    status: failures.length ? "failed" : "passed",
    comparison: "cold home medians against committed baseline",
    metrics: currentMetrics,
    checks,
    failures,
    largestCurrentAssets: currentAssets.slice(0, 8),
    note: "CDN request count is reported but excluded from gates; external bytes and LCP require a large increase in at least 80% of repeated runs.",
  };
}
