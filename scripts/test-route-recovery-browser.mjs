import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import express from "express";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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
        cacheControl: response.getHeader("cache-control"),
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

async function runBrowserRegression(port, newBuildDir) {
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
    assert.equal(
      requestLog.find((entry) => entry.pathname === "/" && entry.status === 200)?.cacheControl,
      "no-cache",
      "the browser must revalidate the HTML so a user-triggered reload gets the current release",
    );

    const fallbackResponses = await evaluate(socket, `Promise.all([
      fetch("/assets/__route-recovery-missing__.css"),
      fetch("/assets/__route-recovery-missing__.woff2"),
      fetch("/__route_recovery_fallback__"),
      fetch("/api/__route_recovery_missing__"),
    ]).then(async ([css, font, page, api]) => ({
      css: { status: css.status, contentType: css.headers.get("content-type") },
      font: { status: font.status, contentType: font.headers.get("content-type") },
      page: { status: page.status, contentType: page.headers.get("content-type") },
      api: {
        status: api.status,
        contentType: api.headers.get("content-type"),
        body: await api.json(),
      },
    }))`);
    for (const [assetType, response] of Object.entries({
      CSS: fallbackResponses.css,
      font: fallbackResponses.font,
    })) {
      assert.equal(response.status, 404, `a missing ${assetType} returns 404`);
      assert.doesNotMatch(
        String(response.contentType),
        /text\/html/i,
        `a missing ${assetType} does not receive the SPA HTML fallback`,
      );
      assert.match(String(response.contentType), /^text\/plain(?:;|$)/i,
        `a missing ${assetType} receives a plain-text error`);
    }
    assert.equal(fallbackResponses.page.status, 200,
      "an unknown non-asset path still falls back to the SPA document");
    assert.match(String(fallbackResponses.page.contentType), /^text\/html(?:;|$)/i,
      "an unknown non-asset path still receives HTML");
    assert.equal(fallbackResponses.api.status, 404, "an unknown API path remains a 404");
    assert.match(String(fallbackResponses.api.contentType), /^application\/json(?:;|$)/i,
      "an unknown API path remains a JSON response");
    assert.ok(fallbackResponses.api.body?.message, "the API 404 keeps its error message");
    for (const pathname of [
      "/assets/__route-recovery-missing__.css",
      "/assets/__route-recovery-missing__.woff2",
      "/__route_recovery_fallback__",
      "/api/__route_recovery_missing__",
    ]) {
      assert.ok(requestLog.some((entry) => entry.pathname === pathname),
        `the local production server handled ${pathname}`);
    }

    // A second local build becomes current while the existing browser tab stays open.
    activateBuild(path.join(tempRoot, "build-new"));
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
    assert.equal(
      missingChunks.length,
      1,
      `the old hashed lazy chunk fails with one 404; requests: ${JSON.stringify(requestLog)}; browser responses: ${JSON.stringify(browserResponses)}`,
    );
    assert.match(
      String(missingChunks[0].contentType),
      /^text\/plain(?:;|$)/i,
      "the missing chunk response is not the SPA's HTML fallback",
    );
    const oldChunkPath = missingChunks[0].pathname;
    assert.equal(
      existsSync(path.join(activeBuildDir, oldChunkPath.slice(1))),
      false,
      "the latest production bundle no longer contains the old hashed chunk",
    );
    assert.equal(missingChunks[0].buildDir, activeBuildDir,
      "the missing old chunk was requested from the replacement build");
    const browserChunkFailure = browserResponses.find((entry) => entry.url.endsWith(oldChunkPath));
    assert.equal(browserChunkFailure?.status, 404, "Chromium receives the server's chunk 404");
    assert.equal(browserChunkFailure?.mimeType, "text/plain",
      "Chromium does not receive HTML for the missing chunk");
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
    const latestDocument = requestLog.findLast(
      (entry) =>
        (entry.pathname === "/" || entry.pathname === "/about/intro") &&
        entry.status === 200,
    );
    assert.equal(latestDocument?.buildDir, activeBuildDir,
      "the user-triggered reload receives HTML from the replacement build");
    assert.equal(latestDocument?.cacheControl, "no-cache",
      "the replacement HTML is not reused without revalidation");
    const newIntroChunks = requestLog.filter(
      (entry) => entry.status === 200 && /\.js$/.test(entry.pathname) && entry.buildDir === activeBuildDir,
    );
    assert.ok(newIntroChunks.some((entry) => entry.pathname !== oldChunkPath),
      "the refreshed page loads a different hashed chunk from the latest build");
    assert.equal(requestLog.filter(
      (entry) => entry.status === 404 && /\.(?:js|mjs|css|map|woff2?|ttf|otf|png|jpe?g|svg|avif|webp|gif|ico)$/i.test(entry.pathname),
    ).length, 3,
      "only the intentional stale chunk, missing CSS, and missing font requests fail");

    console.log("PASS old tab → deployment replacement → stale lazy chunk 404 → explicit reload → latest route; no reload loop");

    const entryFailureBuildDir = path.join(tempRoot, "build-entry-failure");
    cpSync(newBuildDir, entryFailureBuildDir, { recursive: true });
    const entryFailureIndexPath = path.join(entryFailureBuildDir, "index.html");
    const entryFailureHtml = readFileSync(entryFailureIndexPath, "utf8");
    const entryScriptTag = entryFailureHtml.match(/<script\b[^>]*type="module"[^>]*>/)?.[0];
    assert.ok(entryScriptTag, "the production HTML has a module entry script");
    const missingEntryScriptTag = entryScriptTag.replace(
      /\bsrc="[^"]+"/,
      'src="/assets/__route-recovery-missing-entry__.js"',
    );
    assert.notEqual(missingEntryScriptTag, entryScriptTag,
      "the production entry script has a source to replace");
    writeFileSync(entryFailureIndexPath, entryFailureHtml.replace(entryScriptTag, missingEntryScriptTag));

    activateBuild(entryFailureBuildDir);
    const documentsBeforeEntryFailure = documentRequestCount();
    await sendCdp(socket, "Page.navigate", { url: `http://127.0.0.1:${port}/` });
    await waitFor(
      socket,
      "document.querySelector('#startup-recovery:not([hidden])') && document.querySelector('#root').hidden",
      "the HTML startup recovery after the module entry script fails",
    );
    assert.match(
      await evaluate(socket, "document.querySelector('#startup-recovery').innerText"),
      /화면을 불러오지 못했습니다/,
    );
    assert.match(
      await evaluate(socket, "document.querySelector('#startup-recovery').innerText"),
      /새로고침/,
    );
    const missingEntry = requestLog.find((entry) =>
      entry.pathname === "/assets/__route-recovery-missing-entry__.js",
    );
    assert.equal(missingEntry?.status, 404, "the module entry request receives a real 404");
    assert.equal(missingEntry?.buildDir, entryFailureBuildDir,
      "the current deployment handled the missing entry request");
    assert.match(String(missingEntry?.contentType), /^text\/plain(?:;|$)/i,
      "the failed module entry does not receive the SPA HTML fallback");
    const browserEntryFailure = browserResponses.find((entry) =>
      entry.url.endsWith("/assets/__route-recovery-missing-entry__.js"),
    );
    assert.equal(browserEntryFailure?.status, 404,
      "Chromium receives the missing entry script's 404");
    assert.equal(
      documentRequestCount(),
      documentsBeforeEntryFailure + 1,
      "the startup failure does not trigger an automatic page reload",
    );
    await delay(1_000);
    assert.equal(
      documentRequestCount(),
      documentsBeforeEntryFailure + 1,
      "the startup recovery remains stable without a reload loop",
    );
    assert.equal(
      await evaluate(socket, "window.__routeRecoveryBrowserBuild || null"),
      null,
      "React did not run while the entry script was missing",
    );

    activateBuild(newBuildDir);
    await evaluate(socket, "document.querySelector('#startup-recovery-reload').click()");
    await waitFor(
      socket,
      "document.querySelector('a[href=\"/about/intro\"]') && !document.querySelector('#root').hidden",
      "the app after the user-triggered startup recovery",
    );
    assert.equal(
      documentRequestCount(),
      documentsBeforeEntryFailure + 2,
      "the recovery button loads exactly one latest document",
    );
    const recoveredDocument = requestLog.findLast((entry) =>
      (entry.pathname === "/" || entry.pathname === "/about/intro") &&
      entry.status === 200,
    );
    assert.equal(recoveredDocument?.buildDir, activeBuildDir,
      "the recovery button receives HTML from the latest build");
    await evaluate(socket, "document.querySelector('a[href=\"/about/intro\"]').click()");
    await waitFor(
      socket,
      "window.__routeRecoveryBrowserBuild === 'new' && document.querySelector('h1')?.innerText.includes('동문회 소개')",
      "a route from the latest build after startup recovery",
    );
    console.log("PASS missing module entry 404 → HTML recovery → explicit reload → latest page; no reload loop");
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
  await runBrowserRegression(local.port, newBuildDir);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (staticServer) await new Promise((resolve) => staticServer.close(resolve));
  rmSync(tempRoot, { recursive: true, force: true });
}
