import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";

// Run after npm run build. Count the entry's static dependency closure, not just
// its filename: a new eager vendor chunk must not hide an initial-load regression.
const root = "dist/public/";
const manifest = JSON.parse(readFileSync(`${root}.vite/manifest.json`, "utf8"));
const initial = new Set();
function visit(key) {
  if (initial.has(key)) return;
  assert.ok(manifest[key], `Missing manifest dependency: ${key}`);
  initial.add(key);
  for (const child of manifest[key].imports ?? []) visit(child);
}
visit("index.html");
const files = [...initial].map((key) => manifest[key].file).filter((file) => file.endsWith(".js"));
const bytes = files.reduce((sum, file) => sum + statSync(root + file).size, 0);
const gzip = files.reduce((sum, file) => sum + gzipSync(readFileSync(root + file)).length, 0);
const routes = Object.entries(manifest).filter(
  ([key, value]) => key.startsWith("src/features/") && value.isDynamicEntry,
);
const expectedRoutes = readdirSync("client/src/features").flatMap((feature) => {
  const source = readFileSync(`client/src/features/${feature}/index.ts`, "utf8");
  return [...source.matchAll(/import\("\.\/(.+?)"\)/g)].map(
    (match) => `src/features/${feature}/${match[1]}.tsx`,
  );
});
assert.deepEqual(
  routes.map(([key]) => key).sort(),
  expectedRoutes.sort(),
  "Built lazy routes must match the feature entrypoints",
);
for (const [key] of routes) assert.ok(!initial.has(key), `${key} leaked into initial JS`);
assert.ok(bytes < 400_000, `Initial JS budget exceeded: ${bytes}`);
for (const value of Object.values(manifest)) {
  if (value.file.endsWith(".js"))
    assert.ok(statSync(root + value.file).size < 500_000, `${value.file} exceeds chunk budget`);
}
console.log(
  JSON.stringify(
    {
      initialJsChunks: files.length,
      initialJsBytes: bytes,
      initialJsGzipBytes: gzip,
      lazyRouteEntries: routes.length,
      totalJsChunks: Object.values(manifest).filter((value) => value.file.endsWith(".js")).length,
      budgets: {
        initialJsBytes: 400_000,
        individualJsChunkBytes: 500_000,
        lazyRouteEntries: expectedRoutes.length,
      },
      measurementScope:
        "Build-time guard for initial and per-chunk JavaScript only; npm run measure:mobile compares browser requests, transfer bytes, and cold LCP.",
    },
    null,
    2,
  ),
);
