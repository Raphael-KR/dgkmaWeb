import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const connections = new WeakMap();

export function openCdpSocket(url, { onEvent, formatCommandError }) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const state = { nextId: 0, pending: new Map() };
    connections.set(socket, state);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (!message.id) {
        onEvent(message);
        return;
      }
      const pending = state.pending.get(message.id);
      if (!pending) return;
      state.pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(formatCommandError(pending.method, pending.params, message.error)),
        );
      } else {
        pending.resolve(message.result ?? {});
      }
    });
  });
}

export function sendCdp(socket, method, params = {}) {
  const state = connections.get(socket);
  const id = ++state.nextId;
  return new Promise((resolve, reject) => {
    state.pending.set(id, { resolve, reject, method, params });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

export async function waitForBrowserEndpoint(profileDir, browser, timeoutMessage) {
  const endpointFile = path.join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (browser.exitCode !== null) throw new Error(`Chromium exited (${browser.exitCode})`);
    if (existsSync(endpointFile)) {
      return Number(readFileSync(endpointFile, "utf8").trim().split("\n")[0]);
    }
    await delay(100);
  }
  throw new Error(timeoutMessage);
}

export async function evaluate(socket, expression) {
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

export async function waitFor(socket, expression, description, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(socket, expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}
