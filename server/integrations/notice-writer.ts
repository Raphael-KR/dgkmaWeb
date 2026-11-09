import { spawn } from "node:child_process";
import { resolve } from "node:path";

/** Vendored writer receives JSON on stdin, never a shell command or network URL. */
export function runNoticeWriter<T>(payload: unknown): Promise<T> {
  return new Promise((resolveResult, reject) => {
    const child = spawn("python3", [resolve("server/modules/events/writer/bridge.py")], {
      stdio: ["pipe", "pipe", "ignore"],
      env: { PATH: process.env.PATH, TZ: "Asia/Seoul", PYTHONDONTWRITEBYTECODE: "1" },
    });
    let output = "";
    const timer = setTimeout(() => child.kill(), 5000);
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); if (output.length > 100_000) child.kill(); });
    child.on("error", () => { clearTimeout(timer); reject(new Error("Notice writer unavailable")); });
    child.stdin.on("error", () => { /* close reports a bounded error */ });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        if (code !== 0) throw new Error();
        resolveResult(JSON.parse(output) as T);
      } catch { reject(new Error("Notice writer rejected input")); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
