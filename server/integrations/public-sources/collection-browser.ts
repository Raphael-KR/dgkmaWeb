import type { NoticeType } from "@shared/contracts/notices";
import { fork } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { CollectionBudget, permittedBrowserRequest } from "./collection-http";
import { LIMITS, type JsonObservation } from "./collection-contract";
import { buildRule } from "./collection-rules";

type BrowserResult = {
  segments: { url: string; text: string; kind: "rendered" | "ocr"; locator?: string }[];
  stats: { frames: number; interactions: number; scrolls: number; ocrImages: number };
  blocked: boolean;
};
type WorkerMessage =
  | { type: "result"; result: BrowserResult }
  | { type: "failure"; code: string }
  | { type: "request"; id: number; url: string; method: string; resource: string };
let running = 0;
function chromiumExecutable(): string {
  if (process.env.COLLECTOR_CHROMIUM_PATH) return process.env.COLLECTOR_CHROMIUM_PATH;
  const candidates = (process.env.PATH || "")
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, "chromium"));
  candidates.push("/repl/tools/bin/chromium");
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* next installed path */
    }
  }
  throw Error("collector_chromium_missing");
}
export async function browserCollect(
  url: string,
  budget: CollectionBudget,
  observations: JsonObservation[],
  noticeType: NoticeType = "obituary",
): Promise<BrowserResult> {
  if (running >= 2) throw Error("collector_capacity");
  running++;
  let directory: string | undefined;
  try {
    const executablePath = chromiumExecutable();
    // Chromium's Unix sockets require a short temporary path.
    directory = await mkdtemp(tmpdir() + "/dgkma-collector-");
    return await new Promise<BrowserResult>((resolveResult, reject) => {
      const child = fork(resolve("scripts/collector/worker.mjs"), [], {
        cwd: directory,
        detached: true,
        execArgv: ["--max-old-space-size=256"],
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        env: {
          PATH: process.env.PATH,
          HOME: directory,
          TMPDIR: directory,
          LANG: "C.UTF-8",
          TZ: "Asia/Seoul",
        },
      });
      let settled = false;
      let messages = 0;
      const finish = (error?: Error, result?: BrowserResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        budget.signal.removeEventListener("abort", abort);
        const done = () => {
          clearTimeout(force);
          if (error) reject(error);
          else resolveResult(result!);
        };
        // Let Playwright close its own Chromium process group before killing the worker.
        const force = setTimeout(() => {
          try {
            process.kill(-child.pid!, "SIGKILL");
          } catch {
            /* exited */
          }
        }, 2000);
        if (child.exitCode !== null || child.signalCode !== null || !child.pid) {
          done();
          return;
        }
        child.once("exit", done);
        try {
          child.kill("SIGTERM");
        } catch {
          done();
        }
      };
      const abort = () => finish(Error("collector_cancelled"));
      const timer = setTimeout(() => finish(Error("collector_browser_timeout")), LIMITS.browserMs);
      budget.signal.addEventListener("abort", abort, { once: true });
      if (budget.signal.aborted) {
        abort();
        return;
      }
      child.on("error", () => finish(Error("collector_worker_start")));
      child.on("exit", () => {
        if (!settled) finish(Error("collector_worker_exit"));
      });
      child.on("message", async (raw: unknown) => {
        if (settled || !raw || typeof raw !== "object") return;
        const m = raw as WorkerMessage;
        if (++messages > LIMITS.requests + 10) {
          finish(Error("collector_message_limit"));
          return;
        }
        if (m.type === "result") {
          if (
            !m.result ||
            JSON.stringify(m.result).length > 500000 ||
            !Array.isArray(m.result.segments)
          )
            return finish(Error("collector_result_limit"));
          finish(undefined, m.result);
          return;
        }
        if (m.type === "failure") {
          finish(
            Error(
              ["launch_failed", "navigation_failed", "render_failed", "ocr_failed"].includes(m.code)
                ? m.code
                : "collector_browser_failed",
            ),
          );
          return;
        }
        if (
          m.type !== "request" ||
          !Number.isInteger(m.id) ||
          typeof m.url !== "string" ||
          m.url.length > 4000
        )
          return;
        try {
          if (!permittedBrowserRequest(m.url, m.method, m.resource))
            throw Error("request_not_public_read");
          const response = await budget.read(
            m.url,
            ["script", "stylesheet", "image", "font"].includes(m.resource),
          );
          if (
            /json/.test(response.contentType) &&
            ["fetch", "xhr", "document"].includes(m.resource) &&
            observations.length < LIMITS.jsonResponses
          ) {
            try {
              const value = JSON.parse(response.body.toString("utf8"));
              observations.push({ url: response.url, value });
              if (buildRule(url, response.url, value, noticeType) && child.connected && !settled)
                child.send({ type: "api-ready" });
            } catch {
              /* invalid JSON or unrelated data */
            }
          }
          if (child.connected && !settled)
            child.send({
              type: "response",
              id: m.id,
              ok: true,
              url: response.url,
              contentType: response.contentType,
              body: response.body.toString("base64"),
            });
        } catch {
          if (child.connected && !settled) child.send({ type: "response", id: m.id, ok: false });
        }
      });
      child.send({ type: "start", url, noticeType, limits: LIMITS, executablePath });
    });
  } finally {
    running--;
    if (directory)
      await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}
