import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import express from "express";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const projectRoot = process.cwd();
const buildDir = path.join(projectRoot, "dist", "public");
const chromiumBin = process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium";
const runCount = Number(process.env.MOBILE_BENCH_RUNS || 3);
const profileDir = mkdtempSync(path.join(tmpdir(), "mobile-home-bench-"));
const pendingCommands = new Map();
const requests = new Map();
const requestLog = [];
let commandId = 0;
let navigationStart = 0;

assert.ok(existsSync(path.join(buildDir, "index.html")), "Run npm run build first");
assert.ok(Number.isInteger(runCount) && runCount > 0, "MOBILE_BENCH_RUNS must be a positive integer");
assert.ok(existsSync(chromiumBin), `Chromium was not found at ${chromiumBin}; set CHROMIUM_PATH`);

function startStaticServer() {
  const app = express();
  app.get("/api/auth/me", (_request, response) => {
    response.status(401).json({ message: "Unauthorized" });
  });
  app.use("/api", (_request, response) => {
    response.status(404).json({ message: "Not found" });
  });
  app.use(express.static(buildDir));
  app.use((_request, response) => {
    response.sendFile(path.join(buildDir, "index.html"));
  });

  const server = app.listen(0, "127.0.0.1");
  return new Promise((resolve, reject) => {
    server.once("listening", () => resolve({ server, port: server.address().port }));
    server.once("error", reject);
  });
}

function sendCdp(socket, method, params = {}) {
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    pendingCommands.set(id, { resolve, reject, method });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

function openCdpSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (!message.id) {
        if (message.method === "Network.requestWillBeSent") {
          const { requestId, request, timestamp, type } = message.params;
          const record = {
            requestId,
            url: request.url,
            type,
            startedAt: timestamp,
            status: null,
            mimeType: "",
            fromDiskCache: false,
            fromServiceWorker: false,
            transferredBytes: 0,
          };
          requests.set(requestId, record);
          requestLog.push(record);
        } else if (message.method === "Network.responseReceived") {
          const record = requests.get(message.params.requestId);
          if (record) {
            record.status = message.params.response.status;
            record.mimeType = message.params.response.mimeType;
            record.fromDiskCache = Boolean(message.params.response.fromDiskCache);
            record.fromServiceWorker = Boolean(message.params.response.fromServiceWorker);
          }
        } else if (message.method === "Network.loadingFinished") {
          const record = requests.get(message.params.requestId);
          if (record) {
            record.transferredBytes = message.params.encodedDataLength;
            record.finished = true;
          }
        } else if (message.method === "Network.loadingFailed") {
          const record = requests.get(message.params.requestId);
          if (record) {
            record.failed = message.params.errorText;
            record.finished = true;
          }
        }
        return;
      }
      const pending = pendingCommands.get(message.id);
      if (!pending) return;
      pendingCommands.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      } else {
        pending.resolve(message.result ?? {});
      }
    });
  });
}

async function waitForBrowserEndpoint(browser) {
  const endpointFile = path.join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (browser.exitCode !== null) throw new Error(`Chromium exited (${browser.exitCode})`);
    if (existsSync(endpointFile)) {
      return Number(readFileSync(endpointFile, "utf8").trim().split("\n")[0]);
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for Chromium's DevTools endpoint");
}

async function evaluate(socket, expression) {
  const result = await sendCdp(socket, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  }
  return result.result?.value;
}

async function waitFor(socket, expression, description, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(socket, expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function waitForNetworkIdle(socket, quietMs = 700, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let quietSince = Date.now();
  let previousFinishedCount = requestLog.length;
  while (Date.now() < deadline) {
    const active = [...requests.values()].some((request) =>
      !request.finished && request.startedAt >= navigationStart,
    );
    const finishedCount = requestLog.length;
    if (!active && finishedCount === previousFinishedCount) {
      if (Date.now() - quietSince >= quietMs) return;
    } else {
      quietSince = Date.now();
      previousFinishedCount = finishedCount;
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for network quiet");
}

function summarizeRequests(fromIndex) {
  const entries = requestLog.slice(fromIndex).filter((request) => !request.url.startsWith("data:"));
  const groups = {};
  for (const entry of entries) {
    const key = entry.mimeType || entry.type || "other";
    groups[key] ??= { requests: 0, transferredBytes: 0 };
    groups[key].requests += 1;
    groups[key].transferredBytes += entry.transferredBytes;
  }
  return {
    requestCount: entries.length,
    transferredBytes: entries.reduce((sum, request) => sum + request.transferredBytes, 0),
    statusCounts: entries.reduce((counts, request) => {
      const status = request.status === null ? "no-response" : String(request.status);
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {}),
    cacheResponses: entries.filter((request) => request.fromDiskCache).length,
    resources: groups,
    failures: entries.filter((request) => request.failed).map(({ url, failed }) => ({ url, failed })),
    assetDetails: entries.map((request) => {
      const parsedUrl = new URL(request.url);
      return {
        resource: `${parsedUrl.origin}${parsedUrl.pathname}`,
        type: request.mimeType || request.type || "other",
        status: request.status,
        transferredBytes: request.transferredBytes,
        fromDiskCache: request.fromDiskCache,
        failed: request.failed ?? null,
      };
    }).sort((left, right) => right.transferredBytes - left.transferredBytes),
  };
}

async function navigateHome(socket, url) {
  const firstRequestIndex = requestLog.length;
  navigationStart = (await sendCdp(socket, "Performance.getMetrics")).metrics
    .find((metric) => metric.name === "Timestamp")?.value ?? 0;
  await sendCdp(socket, "Page.navigate", { url });
  await waitFor(socket, "document.readyState === 'complete' && !!document.querySelector('h1')", "public home");
  await waitForNetworkIdle(socket);
  // LCP may be reported after load; allow late image/font paint candidates to settle.
  await delay(1_000);
  const pageMetrics = await evaluate(socket, `(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const fontSamples = [
      ["heroHeading", document.querySelector(".theme-public h1")],
      ["heroCopy", document.querySelector(".theme-public section p")],
      ["heroLead", document.querySelector(".theme-public section p span")],
    ].filter(([, element]) => element);
    return {
      lcp: window.__mobileBenchLcp ?? null,
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
      loadEventMs: navigation?.loadEventEnd ?? null,
      title: document.querySelector("h1")?.innerText ?? null,
      fontUsage: {
        samples: fontSamples.map(([name, element]) => {
          const style = getComputedStyle(element);
          return {
            name,
            family: style.fontFamily,
            weight: style.fontWeight,
            loadedForText: document.fonts.check(
              style.fontWeight + " " + style.fontSize + " " + style.fontFamily,
              element.innerText || element.textContent || "",
            ),
          };
        }),
        loadedFaces: [...document.fonts]
          .filter((face) => face.status === "loaded")
          .map((face) => ({ family: face.family, weight: face.weight }))
          .filter((face, index, faces) =>
            faces.findIndex((candidate) =>
              candidate.family === face.family && candidate.weight === face.weight,
            ) === index,
          ),
      },
    };
  })()`);
  return { ...summarizeRequests(firstRequestIndex), pageMetrics };
}

async function measureMemberTransition(socket) {
  const firstRequestIndex = requestLog.length;
  const startedAt = await evaluate(socket, `(() => {
    const link = [...document.querySelectorAll('a[href="/b"]')]
      .find((candidate) => candidate.getClientRects().length > 0);
    if (!link) throw new Error('Public home is missing its /b member link');
    link.scrollIntoView({ block: "center" });
    window.__memberTransitionStart = performance.now();
    link.click();
    return window.__memberTransitionStart;
  })()`);
  try {
    await waitFor(
      socket,
      "location.pathname === '/b' && document.body.innerText.includes('로그인이 필요한 메뉴입니다')",
      "anonymous member-route gate",
    );
  } catch (error) {
    const state = await evaluate(socket, `({
      pathname: location.pathname,
      bodyText: document.body.innerText.slice(0, 500),
      link: document.querySelector('a[href="/b"]')?.outerHTML ?? null
    })`);
    throw new Error(`${error.message}; after click: ${JSON.stringify(state)}`);
  }
  const transitionMs = await evaluate(socket, `performance.now() - ${startedAt}`);
  await waitForNetworkIdle(socket);
  return { transitionMs, ...summarizeRequests(firstRequestIndex) };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function aggregate(runs, key) {
  const values = runs.map((run) => key ? run[key] : run);
  assert.ok(values.every(Number.isFinite), "Measurement contains a non-finite value");
  return {
    median: Math.round(median(values) * 100) / 100,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

async function removeProfileDirectory() {
  const retryableErrors = new Set(["EBUSY", "ENOTEMPTY", "EPERM"]);
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      rmSync(profileDir, {
        recursive: true,
        force: true,
        maxRetries: 2,
        retryDelay: 100,
      });
      return;
    } catch (error) {
      if (!retryableErrors.has(error.code)) throw error;
      lastError = error;
      await delay(250);
    }
  }
  throw lastError;
}

async function run() {
  const { server, port } = await startStaticServer();
  const browser = spawn(chromiumBin, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], { stdio: "ignore" });
  let socket;
  try {
    const debugPort = await waitForBrowserEndpoint(browser);
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" });
    assert.equal(response.status, 200, "Chromium opened a clean tab");
    const target = await response.json();
    socket = await openCdpSocket(target.webSocketDebuggerUrl);

    await sendCdp(socket, "Page.enable");
    await sendCdp(socket, "Runtime.enable");
    await sendCdp(socket, "Network.enable");
    await sendCdp(socket, "Performance.enable");
    await sendCdp(socket, "Emulation.setDeviceMetricsOverride", {
      width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
    });
    await sendCdp(socket, "Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: 200_000,
      uploadThroughput: 93_750,
      connectionType: "cellular3g",
    });
    await sendCdp(socket, "Page.addScriptToEvaluateOnNewDocument", {
      source: `window.__mobileBenchLcp = null;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__mobileBenchLcp = {
              startTime: entry.startTime,
              size: entry.size,
              tag: entry.element?.tagName ?? null,
              id: entry.element?.id ?? null,
              className: typeof entry.element?.className === "string" ? entry.element.className : "",
              text: entry.element?.innerText?.trim().slice(0, 120) ?? "",
              url: entry.url ?? ""
            };
          }
        }).observe({ type: "largest-contentful-paint", buffered: true });`,
    });

    const url = `http://127.0.0.1:${port}/`;
    const coldRuns = [];
    const warmRuns = [];
    for (let index = 0; index < runCount; index += 1) {
      await sendCdp(socket, "Network.setCacheDisabled", { cacheDisabled: true });
      await sendCdp(socket, "Network.clearBrowserCache");
      const coldHome = await navigateHome(socket, url);
      const coldMember = await measureMemberTransition(socket);
      coldRuns.push({ home: coldHome, member: coldMember });

      await sendCdp(socket, "Network.setCacheDisabled", { cacheDisabled: false });
      const warmHome = await navigateHome(socket, url);
      const warmMember = await measureMemberTransition(socket);
      warmRuns.push({ home: warmHome, member: warmMember });
    }

    const report = {
      generatedAt: new Date().toISOString(),
      build: "dist/public (local production build)",
      browser: "Chromium headless with 390×844 CSS viewport, DPR 3",
      network: { rttMs: 150, downloadKbps: 1600, uploadKbps: 750 },
      runs: runCount,
      server: "Express static; anonymous /api/auth/me is stubbed to 401; external font CDN requests remain live",
      scenarios: {
        cold: coldRuns,
        warm: warmRuns,
      },
      medians: {
        coldHome: {
          requests: aggregate(coldRuns.map((run) => run.home), "requestCount"),
          transferredBytes: aggregate(coldRuns.map((run) => run.home), "transferredBytes"),
          lcpMs: aggregate(coldRuns.map((run) => run.home.pageMetrics.lcp?.startTime ?? 0)),
        },
        warmHome: {
          requests: aggregate(warmRuns.map((run) => run.home), "requestCount"),
          transferredBytes: aggregate(warmRuns.map((run) => run.home), "transferredBytes"),
          lcpMs: aggregate(warmRuns.map((run) => run.home.pageMetrics.lcp?.startTime ?? 0)),
        },
        coldMemberTransitionMs: aggregate(coldRuns.map((run) => run.member), "transitionMs"),
        coldMemberRequests: aggregate(coldRuns.map((run) => run.member), "requestCount"),
        coldMemberTransferredBytes: aggregate(coldRuns.map((run) => run.member), "transferredBytes"),
        warmMemberTransitionMs: aggregate(warmRuns.map((run) => run.member), "transitionMs"),
        warmMemberRequests: aggregate(warmRuns.map((run) => run.member), "requestCount"),
        warmMemberTransferredBytes: aggregate(warmRuns.map((run) => run.member), "transferredBytes"),
      },
    };
    // Keep the report machine-readable; callers can archive or compare it without new dependencies.
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    if (socket) socket.close();
    if (browser.exitCode === null && browser.signalCode === null) {
      browser.kill("SIGTERM");
      await Promise.race([new Promise((resolve) => browser.once("exit", resolve)), delay(2_000)]);
      if (browser.exitCode === null && browser.signalCode === null) {
        browser.kill("SIGKILL");
        await Promise.race([new Promise((resolve) => browser.once("exit", resolve)), delay(2_000)]);
      }
    }
    await removeProfileDirectory();
  }
}

try {
  await run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
