import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const projectRoot = process.cwd();
const viteBin = path.join(projectRoot, "node_modules", ".bin", "vite");
const chromiumBin = process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium";
const tempRoot = mkdtempSync(path.join(tmpdir(), "route-recovery-browser-"));
const requestLog = [];
let activeBuildDir;
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

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".avif")) return "image/avif";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function documentRequestCount() {
  return requestLog.filter((entry) =>
    entry.status === 200 &&
    (entry.pathname === "/" || entry.pathname === "/about/intro"),
  ).length;
}

async function startStaticServer() {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (pathname.startsWith("/api/")) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end("{}");
      return;
    }

    const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).slice(1);
    const candidate = path.resolve(activeBuildDir, relativePath);
    const buildRoot = `${path.resolve(activeBuildDir)}${path.sep}`;
    if (candidate !== path.resolve(activeBuildDir) && !candidate.startsWith(buildRoot)) {
      response.writeHead(400).end();
      return;
    }

    if (existsSync(candidate)) {
      const status = 200;
      requestLog.push({ pathname, status, buildDir: activeBuildDir });
      response.writeHead(status, { "Content-Type": contentType(candidate) });
      response.end(readFileSync(candidate));
      return;
    }

    // Mirror a static host for versioned assets: missing old hashed chunks are
    // real 404s, not the application's HTML history fallback.
    if (/\.(?:js|css|woff2?|png|svg|avif|webp)$/.test(pathname)) {
      requestLog.push({ pathname, status: 404, buildDir: activeBuildDir });
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    requestLog.push({ pathname, status: 200, buildDir: activeBuildDir });
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(readFileSync(path.join(activeBuildDir, "index.html")));
  });
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
    activeBuildDir = path.join(tempRoot, "build-new");
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
    const missingChunks = requestLog.filter((entry) => entry.status === 404 && /\.js$/.test(entry.pathname));
    assert.equal(missingChunks.length, 1, "the old hashed lazy chunk fails with one 404");
    const oldChunkPath = missingChunks[0].pathname;
    assert.equal(
      documentRequestCount(),
      originalDocumentRequests,
      "a chunk error does not trigger an automatic page reload",
    );

    // Give any accidental reload loop time to become visible before the user action.
    await delay(1_000);
    assert.equal(
      documentRequestCount(),
      originalDocumentRequests,
      "the error UI remains stable without repeatedly reloading",
    );
    assert.equal(await evaluate(socket, "window.__routeRecoveryBrowserBuild || null"), null);

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
      "exactly one new document is loaded after the explicit reload",
    );
    const newIntroChunks = requestLog.filter(
      (entry) => entry.status === 200 && /\.js$/.test(entry.pathname) && entry.buildDir === activeBuildDir,
    );
    assert.ok(newIntroChunks.some((entry) => entry.pathname !== oldChunkPath),
      "the refreshed page loads a different hashed chunk from the latest build");
    assert.equal(requestLog.filter((entry) => entry.status === 404).length, 1,
      "the recovery completes without further missing-asset retries");

    console.log("PASS old tab → lazy chunk 404 → explicit reload → latest route; no reload loop");
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
  buildSnapshot("old", oldBuildDir);
  buildSnapshot("new", newBuildDir);
  activeBuildDir = oldBuildDir;
  const local = await startStaticServer();
  staticServer = local.server;
  await runBrowserRegression(local.port);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (staticServer) await new Promise((resolve) => staticServer.close(resolve));
  rmSync(tempRoot, { recursive: true, force: true });
}
