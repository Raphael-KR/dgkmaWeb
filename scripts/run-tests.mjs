import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function discover(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? discover(path) : /\.test\.tsx?$/.test(path) ? [path] : [];
  });
}
const files = ["client/src", "server", "shared"].flatMap(discover).sort();
if (process.argv.includes("--list")) {
  console.log(files.join("\n"));
} else {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...process.argv.slice(2), ...files], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
