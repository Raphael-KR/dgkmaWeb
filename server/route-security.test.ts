import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routesPath = new URL("./routes.ts", import.meta.url);

test("all admin routes are registered after the shared administrator guard", async () => {
  const source = await readFile(routesPath, "utf8");
  const guardIndex = source.indexOf('app.use("/api/admin", requireAdmin)');
  const adminRouteIndexes = Array.from(
    source.matchAll(/app\.(?:get|post|patch|put|delete)\("\/api\/admin\//g),
  ).map((match) => match.index ?? -1);

  assert.ok(guardIndex >= 0);
  assert.equal(adminRouteIndexes.length, 5);
  assert.ok(adminRouteIndexes.every((index) => index > guardIndex));
});

test("payment creation requires an administrator", async () => {
  const source = await readFile(routesPath, "utf8");

  assert.match(source, /app\.post\("\/api\/payments", requireAdmin,/);
});
