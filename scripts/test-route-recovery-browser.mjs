import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import express from "express";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createRequire } from "node:module";
import { serveStatic } from "../server/vite.ts";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const projectRoot = process.cwd();
const viteBin = path.join(projectRoot, "node_modules", ".bin", "vite");
const chromiumBin = process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium";
const tempRoot = mkdtempSync(path.join(tmpdir(), "route-recovery-browser-"));
const requestLog = [];
const browserResponses = [];
const browserFailedRequests = [];
const browserRequestUrls = new Map();
let activeBuildDir;
let activateBuild;
let nextRequestId = 0;
const pendingCommands = new Map();

function buildSnapshot(label, destination) {
  const result = spawnSync(viteBin, ["build"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      ROUTE_RECOVERY_BROWSER_BUILD: label,
    },
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    throw new Error(
      `Vite build ${label} failed:\n${result.stdout}\n${result.stderr}`,
    );
  }
  const output = path.join(projectRoot, "dist", "public");
  assert.ok(existsSync(path.join(output, "index.html")), `build ${label} has an index`);
  cpSync(output, destination, { recursive: true });
}

function documentRequestCount() {
  return requestLog.filter((entry) =>
    entry.status === 200 &&
    (entry.pathname === "/" || entry.pathname === "/about/intro"),
  ).length;
}

async function startStaticServer() {
  const app = express();
  app.use((request, response, next) => {
    response.on("finish", () => {
      requestLog.push({
        pathname: request.originalUrl.split("?", 1)[0],
        status: response.statusCode,
        contentType: response.getHeader("content-type"),
        buildDir: activeBuildDir,
      });
    });
    next();
  });
  serveStatic(app, path.join(tempRoot, "current-build"));
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, port: server.address().port };
}

function sendCdp(socket, method, params = {}) {
  const id = ++nextRequestId;
  return new Promise((resolve, reject) => {
    pendingCommands.set(id, { resolve, reject, method, params });
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
      if (message.method === "Network.responseReceived") {
        browserResponses.push({
          url: message.params.response.url,
          status: message.params.response.status,
          mimeType: message.params.response.mimeType,
        });
      }
      if (message.method === "Network.requestWillBeSent") {
        browserRequestUrls.set(message.params.requestId, message.params.request.url);
      }
      if (message.method === "Network.loadingFailed") {
        browserFailedRequests.push({
          url: browserRequestUrls.get(message.params.requestId),
          errorText: message.params.errorText,
        });
      }
      if (!message.id) return;
      const pending = pendingCommands.get(message.id);
      if (!pending) return;
      pendingCommands.delete(message.id);
      if (message.error) {
        pending.reject(new Error(
          `${pending.method} ${JSON.stringify(pending.params)}: ${message.error.message}`,
        ));
      } else {
        pending.resolve(message.result ?? {});
      }
    });
  });
}

async function waitForBrowserEndpoint(profileDir, browser) {
  const endpointFile = path.join(profileDir, "DevToolsActivePort");
  const expiresAt = Date.now() + 15_000;
  while (Date.now() < expiresAt) {
    if (browser.exitCode !== null) throw new Error(`Chromium exited (${browser.exitCode})`);
    if (existsSync(endpointFile)) {
      const [port] = readFileSync(endpointFile, "utf8").trim().split("\n");
      return Number(port);
    }
    await delay(100);
  }
  throw new Error("Chromium remote debugging endpoint did not start");
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

async function waitFor(socket, expression, description, timeoutMs = 12_000) {
  const expiresAt = Date.now() + timeoutMs;
  while (Date.now() < expiresAt) {
    if (await evaluate(socket, expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function runBrowserRegression(port) {
  const profileDir = path.join(tempRoot, "chromium-profile");
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
    const debugPort = await waitForBrowserEndpoint(profileDir, browser);
    const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
      method: "PUT",
    });
    assert.equal(targetResponse.status, 200, "Chromium creates a clean browser tab");
    const target = await targetResponse.json();
    socket = await openCdpSocket(target.webSocketDebuggerUrl);
    await sendCdp(socket, "Page.enable");
    await sendCdp(socket, "Runtime.enable");
    await sendCdp(socket, "Network.enable");
    await sendCdp(socket, "Page.navigate", { url: `http://127.0.0.1:${port}/` });

    await waitFor(
      socket,
      "document.querySelector('a[href=\"/about/intro\"]') && document.body.innerText.includes('홈페이지에 오신 것을 환영합니다')",
      "the old-build public home page",
    );
    assert.equal(await evaluate(socket, "window.__routeRecoveryBrowserBuild || null"), null);
    const originalDocumentRequests = documentRequestCount();
    assert.equal(originalDocumentRequests, 1, "the browser starts with the old build's HTML");

    // A second local build becomes current while the existing browser tab stays open.
    activateBuild(path.join(tempRoot, "build-new"));
    await sendCdp(socket, "Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    const requestsBeforeOfflineNavigation = requestLog.length;
    const introLinkExists = await evaluate(
      socket,
      "Boolean(document.querySelector('a[href=\"/about/intro\"]'))",
    );
    assert.equal(introLinkExists, true, "the delayed route is reached through the public link");
    await evaluate(socket, "document.querySelector('a[href=\"/about/intro\"]').click()");

    await waitFor(
      socket,
      "Boolean(document.querySelector('[role=\"alert\"]') && document.querySelector('[role=\"alert\"] button'))",
      "the route load error and explicit reload button",
    );
    assert.match(
      await evaluate(socket, "document.querySelector('[role=\"alert\"]').innerText"),
      /화면을 불러오지 못했습니다/,
    );
    assert.match(
      await evaluate(socket, "document.querySelector('[role=\"alert\"]').innerText"),
      /새로고침/,
    );
    const failedLazyChunks = browserFailedRequests.filter((entry) =>
      entry.url?.startsWith(`http://127.0.0.1:${port}/`) &&
      /\.js(?:\?|$)/.test(entry.url),
    );
    assert.equal(
      failedLazyChunks.length,
      1,
      `the lazy chunk fails in the offline browser; requests: ${JSON.stringify(requestLog)}; browser failures: ${JSON.stringify(browserFailedRequests)}`,
    );
    assert.match(failedLazyChunks[0].errorText, /internet|network|ERR_/i,
      "Chromium reports a network failure for the lazy chunk");
    assert.equal(
      requestLog.length,
      requestsBeforeOfflineNavigation,
      "the offline browser cannot reach the server for its lazy chunk",
    );
    assert.equal(
      documentRequestCount(),
      originalDocumentRequests,
      "an offline chunk error does not trigger an automatic page reload",
    );

    // Give any accidental reload loop time to become visible while offline.
    await delay(1_000);
    assert.equal(
      documentRequestCount(),
      originalDocumentRequests,
      "the offline error UI remains stable without repeatedly reloading",
    );
    assert.equal(await evaluate(socket, "window.__routeRecoveryBrowserBuild || null"), null);

    await sendCdp(socket, "Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await delay(1_000);
    assert.equal(
      documentRequestCount(),
      originalDocumentRequests,
      "restoring the network does not automatically reload the page",
    );
    assert.ok(
      await evaluate(socket, "Boolean(document.querySelector('[role=\"alert\"] button'))"),
      "the reload action remains available after network recovery",
    );

    await evaluate(socket, "document.querySelector('[role=\"alert\"] button').click()");
    await waitFor(
      socket,
      "window.__routeRecoveryBrowserBuild === 'new' && document.querySelector('h1')?.innerText.includes('동문회 소개')",
      "the latest lazy route after the user-triggered reload",
    );

    const documentRequestsAfterRecovery = documentRequestCount();
    assert.equal(
      documentRequestsAfterRecovery,
      originalDocumentRequests + 1,
      "exactly one new document is loaded after the user selects reload",
    );
    const oldRouteChunk = new URL(failedLazyChunks[0].url).pathname;
    const latestRouteChunk = requestLog.find(
      (entry) => entry.status === 200 &&
        /\/intro-[^/]+\.js$/.test(entry.pathname) &&
        entry.buildDir === activeBuildDir,
    );
    assert.ok(latestRouteChunk, "the refreshed page loads the latest route chunk");
    assert.notEqual(latestRouteChunk.pathname, oldRouteChunk,
      "the refreshed page loads a different hashed route chunk from the latest build");
    assert.equal(requestLog.filter(
      (entry) => entry.status === 404 && /\.(?:js|mjs|css|map|woff2?|ttf|otf|png|jpe?g|svg|avif|webp|gif|ico)$/i.test(entry.pathname),
    ).length, 0,
      "the recovery completes without missing-asset responses");

    console.log("PASS old tab → offline lazy chunk failure → network restored → explicit reload → latest route; no reload loop");
  } finally {
    if (socket) socket.close();
    if (browser.exitCode === null) {
      browser.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => browser.once("exit", resolve)),
        delay(2_000).then(() => {
          if (browser.exitCode === null) browser.kill("SIGKILL");
        }),
      ]);
    }
  }
}

let staticServer;
try {
  const oldBuildDir = path.join(tempRoot, "build-old");
  const newBuildDir = path.join(tempRoot, "build-new");
  const currentBuildLink = path.join(tempRoot, "current-build");
  buildSnapshot("old", oldBuildDir);
  buildSnapshot("new", newBuildDir);
  symlinkSync(oldBuildDir, currentBuildLink, "dir");
  activeBuildDir = oldBuildDir;
  const local = await startStaticServer();
  staticServer = local.server;
  activateBuild = (buildDir) => {
    rmSync(currentBuildLink);
    symlinkSync(buildDir, currentBuildLink, "dir");
    activeBuildDir = buildDir;
  };
  await runBrowserRegression(local.port);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (staticServer) await new Promise((resolve) => staticServer.close(resolve));
  rmSync(tempRoot, { recursive: true, force: true });
}
