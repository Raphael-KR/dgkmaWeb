import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { logNoticeFailure } from "../lib/safe-logging";

const WRITER_TIMEOUT_MS = 5000;
const WRITER_OUTPUT_LIMIT = 100_000;

/** Vendored writer receives JSON on stdin, never a shell command or network URL. */
export function runNoticeWriter<T>(payload: unknown): Promise<T> {
  return new Promise((resolveResult, reject) => {
    const child = spawn("python3", [resolve("server/modules/events/writer/bridge.py")], {
      stdio: ["pipe", "pipe", "ignore"],
      env: { PATH: process.env.PATH, TZ: "Asia/Seoul", PYTHONDONTWRITEBYTECODE: "1" },
    });
    let output = "";
    let settled = false;
    const fail = (
      code: string,
      facts: Record<string, number | boolean | null>,
      message = "Notice writer rejected input",
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      logNoticeFailure("writer", code, facts);
      reject(new Error(message));
    };
    const timer = setTimeout(() => {
      fail("timeout", { timeoutMs: WRITER_TIMEOUT_MS });
      child.kill();
    }, WRITER_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      output += chunk.toString();
      if (output.length > WRITER_OUTPUT_LIMIT) {
        fail("output_limit", { outputChars: output.length, maxOutputChars: WRITER_OUTPUT_LIMIT });
        child.kill();
      }
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      fail(
        "spawn_failed",
        {
          executableMissing: error.code === "ENOENT",
          permissionDenied: error.code === "EACCES",
          codeAvailable: typeof error.code === "string",
        },
        "Notice writer unavailable",
      );
    });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      fail("stdin_failed", {
        brokenPipe: error.code === "EPIPE",
        codeAvailable: typeof error.code === "string",
      });
      child.kill();
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      clearTimeout(timer);
      if (code !== 0) {
        fail("exit_failed", { exitCode: code, terminatedBySignal: signal !== null });
        return;
      }
      try {
        resolveResult(JSON.parse(output) as T);
        settled = true;
      } catch {
        fail("invalid_json", { outputChars: output.length });
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
