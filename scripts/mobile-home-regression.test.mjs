import assert from "node:assert/strict";
import test from "node:test";
import baseline from "./mobile-home-baseline.json" with { type: "json" };
import {
  canonicalAssetResource,
  createMobileHomeBaseline,
  evaluateMobileHomeRegression,
} from "./mobile-home-regression.mjs";

function makeRuns(overrides = {}) {
  return Array.from({ length: 5 }, (_, index) => {
    const externalBytes = overrides.externalBytes?.[index] ?? 566_970;
    const localBytes = overrides.localBytes?.[index] ?? 597_187;
    const stableRequests = overrides.stableRequests?.[index] ?? 7;
    const lcpMs = overrides.lcpMs?.[index] ?? 2_936;
    const assets = [
      {
        resource: "http://127.0.0.1:32100/assets/index-AbCdEfGh.js",
        scope: "local",
        transferredBytes: localBytes - 247_012,
      },
      {
        resource: "http://127.0.0.1:32100/assets/index-AbCdEfGh.css",
        scope: "local",
        transferredBytes: 96_494,
      },
      {
        resource: "https://fonts.gstatic.com/notosans.woff2",
        scope: "external",
        transferredBytes: externalBytes,
      },
    ];
    for (let extra = 0; extra < stableRequests - 7; extra += 1) {
      assets.push({
        resource: `http://127.0.0.1:32100/assets/new${extra}-abcdefgh.js`,
        scope: "local",
        transferredBytes: 0,
      });
    }
    return {
      stableRequestCount: stableRequests,
      localTransferredBytes: localBytes,
      externalTransferredBytes: externalBytes,
      pageMetrics: { lcp: { startTime: lcpMs } },
      assetDetails: assets,
    };
  });
}

test("checked-in baseline matches the measured local asset and byte totals", () => {
  assert.equal(baseline.metrics.stableRequests, 7);
  assert.equal(baseline.metrics.localTransferredBytes, 597_187);
  assert.equal(
    baseline.assets.filter((asset) => asset.scope === "local")
      .reduce((sum, asset) => sum + asset.medianTransferredBytes, 0),
    baseline.metrics.localTransferredBytes,
  );
  assert.equal(
    baseline.assets.filter((asset) => asset.scope === "external")
      .reduce((sum, asset) => sum + asset.medianTransferredBytes, 0),
    baseline.metrics.externalTransferredBytes,
  );
});

test("stable samples pass and asset hashes do not create false new assets", () => {
  const result = evaluateMobileHomeRegression(makeRuns(), baseline);
  assert.equal(result.status, "passed");
  assert.equal(
    canonicalAssetResource("http://localhost:4000/assets/index-Qwerty123.js", "local"),
    "/assets/index-<hash>.js",
  );
  assert.equal(
    canonicalAssetResource("http://localhost:4000/images/executives/choi-yun-yong-president.avif", "local"),
    "/images/executives/choi-yun-yong-president.avif",
  );
  assert.notEqual(
    canonicalAssetResource("http://localhost:4000/assets/new0-Abcdefgh.js", "local"),
    canonicalAssetResource("http://localhost:4000/assets/new1-Abcdefgh.js", "local"),
  );
});

test("a single CDN/LCP outlier does not fail the comparison", () => {
  const result = evaluateMobileHomeRegression(makeRuns({
    externalBytes: [1_200_000, 566_970, 566_970, 566_970, 566_970],
    lcpMs: [6_000, 2_936, 2_936, 2_936, 2_936],
  }), baseline);
  assert.equal(result.status, "passed");
});

test("repeated local byte and stable request regressions fail with named assets", () => {
  const result = evaluateMobileHomeRegression(makeRuns({
    localBytes: Array(5).fill(800_000),
    stableRequests: Array(5).fill(9),
  }), baseline);
  assert.equal(result.status, "failed");
  const requestFailure = result.failures.find((failure) => failure.key === "stableRequests");
  assert.ok(requestFailure);
  assert.equal(requestFailure.largestAssetIncreases[0].increaseRequests, 1);
  const byteFailure = result.failures.find((failure) => failure.key === "localTransferredBytes");
  assert.ok(byteFailure);
  assert.equal(byteFailure.largestAssetIncreases[0].resource, "/assets/index-<hash>.js");
  assert.ok(byteFailure.largestAssetIncreases[0].increaseBytes > 0);
});

test("external-byte and LCP regressions need repeated samples over the wide CDN-aware limits", () => {
  const result = evaluateMobileHomeRegression(makeRuns({
    externalBytes: Array(5).fill(900_000),
    lcpMs: Array(5).fill(4_000),
  }), baseline);
  assert.equal(result.status, "failed");
  assert.ok(result.failures.some((failure) => failure.key === "externalTransferredBytes"));
  assert.ok(result.failures.some((failure) => failure.key === "lcpMs"));
});

test("baseline creation requires at least five valid samples", () => {
  assert.throws(() => createMobileHomeBaseline(makeRuns().slice(0, 4)), /at least 5 cold runs/);
  const created = createMobileHomeBaseline(makeRuns(), "2026-10-23T00:00:00.000Z");
  assert.equal(created.metrics.lcpMs, 2_936);
  assert.equal(created.runCount, 5);
});
