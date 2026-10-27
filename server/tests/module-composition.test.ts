import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseStorage } from "../storage";
import { IdentityStorage } from "../modules/identity/storage";
import { RegistryStorage } from "../modules/registry/storage";
import { ContentStorage } from "../modules/content/storage";
import { EventsStorage } from "../modules/events/storage";
import { DuesStorage } from "../modules/dues/storage";

test("route compatibility facade preserves the historical domain registration order", async () => {
  const source = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
  const calls = [
    "createRouteContext(dependencies)",
    "registerIdentityRoutes(app, context)",
    "registerMembershipRoutes(app)",
    "registerContentRoutes(app)",
    "registerEventRoutes(app, context)",
    "registerDirectoryRoutes(app)",
    "registerPaymentRoutes(app, context)",
    "registerRegistryAdminRoutes(app, context)",
    "registerObjectStorageRoutes(app)",
    "createServer(app)",
  ];
  let previous = -1;
  for (const call of calls) {
    const index = source.indexOf(call);
    assert.ok(index > previous, `${call} must retain its registration position`);
    previous = index;
  }
});

test("storage compatibility facade retains every domain prototype method and descriptor", () => {
  const instance = new DatabaseStorage();
  const methodNames = new Set<string>();
  for (const DomainStorage of [
    IdentityStorage, RegistryStorage, ContentStorage, EventsStorage, DuesStorage,
  ]) {
    for (const name of Object.getOwnPropertyNames(DomainStorage.prototype)) {
      if (name === "constructor") continue;
      assert.ok(!methodNames.has(name), `${name} must have exactly one domain owner`);
      methodNames.add(name);
      assert.deepEqual(
        Object.getOwnPropertyDescriptor(DatabaseStorage.prototype, name),
        Object.getOwnPropertyDescriptor(DomainStorage.prototype, name),
      );
      assert.equal(typeof (instance as unknown as Record<string, unknown>)[name], "function");
    }
  }
  assert.equal(methodNames.size, 55);
  assert.equal(Object.keys(instance).length, 0);
});

test("facade membership lookup dispatches through the same replaceable receiver", async () => {
  const instance = new DatabaseStorage();
  let calls = 0;
  instance.getPaymentsByUser = async (userId) => {
    assert.equal(userId, 17);
    calls += 1;
    return [];
  };
  const status = await instance.getMembershipStatus(17);
  assert.equal(calls, 1);
  assert.equal(status.isPaid, false);
});
