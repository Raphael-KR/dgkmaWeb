import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readDeclarationSource, readRouteSource, readServerSource } from "./source";

const authHookPath = new URL("../../client/src/features/auth/hooks/use-auth.tsx", import.meta.url);
const vitePath = new URL("../vite.ts", import.meta.url);

test("debug login route and client query bypass are absent", async () => {
  const [routesSource, authHookSource] = await Promise.all([
    readRouteSource(),
    readFile(authHookPath, "utf8"),
  ]);

  assert.doesNotMatch(routesSource, /\/api\/debug\/login/);
  assert.doesNotMatch(authHookSource, /debug_login/);
  assert.doesNotMatch(authHookSource, /\/api\/debug\/login/);
});

test("SPA fallback does not turn unknown API paths into HTML success responses", async () => {
  const viteSource = await readFile(vitePath, "utf8");
  assert.match(viteSource, /req\.originalUrl\.split\("\?", 1\)\[0\]\.startsWith\("\/api\/"\)/);
  assert.match(
    viteSource,
    /res\.status\(404\)\.json\(\{ message: "요청한 API를 찾을 수 없습니다" \}\)/,
  );
});

test("all admin routes are registered after the shared administrator guard", async () => {
  const source = await readServerSource("modules/registry/routes.ts");
  const guardIndex = source.indexOf('app.use("/api/admin", requireAdmin)');
  const adminRouteIndexes = Array.from(
    source.matchAll(/app\.(?:get|post|patch|put|delete)\("\/api\/admin\//g),
  ).map((match) => match.index ?? -1);

  assert.ok(guardIndex >= 0);
  assert.ok(adminRouteIndexes.length > 0, "administrator routes must be present");
  assert.ok(adminRouteIndexes.every((index) => index > guardIndex));
});

test("payment creation requires an administrator", async () => {
  const source = await readRouteSource();

  assert.match(source, /app\.post\("\/api\/payments", requireAdmin,/);
});

test("pending rejection storage locks the identity, marks termination, and purges matching personal data", async () => {
  const method = await readDeclarationSource(
    "modules/registry/pending-registration-storage.ts",
    "rejectPendingRegistration",
  );

  assert.match(method, /db\.transaction/);
  assert.match(method, /pendingRegistrations\.status, "pending"/);
  assert.match(method, /\.for\("update"\)/);
  let previousIndex = -1;
  for (const call of [
    "lockRegistrationIdentities",
    '.for("update")',
    "await beforeDelete(registration)",
    "markKakaoIdentityTerminated",
    "removeLocalUsers",
  ]) {
    const index = method.indexOf(call);
    assert.ok(index >= 0, `required call missing: ${call} (index=${index})`);
    assert.ok(index > previousIndex, `${call}: expected index > ${previousIndex}, found ${index}`);
    previousIndex = index;
  }
  assert.match(method, /eq\(pendingRegistrations\.kakaoId, registration\.kakaoId\)/);
  assert.match(method, /lower\(\$\{pendingRegistrations\.email\}\)/);
});
