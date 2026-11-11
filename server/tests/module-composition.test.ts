import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseStorage } from "../storage";
import { IdentityStorage } from "../modules/identity/storage";
import { RegistryStorage } from "../modules/registry/storage";
import { ContentStorage } from "../modules/content/storage";
import { EventsStorage } from "../modules/events/storage";
import { DuesStorage } from "../modules/dues/storage";

test("storage compatibility facade retains every domain prototype method and descriptor", () => {
  const instance = new DatabaseStorage();
  const methodNames = new Set<string>();
  for (const DomainStorage of [
    IdentityStorage,
    RegistryStorage,
    ContentStorage,
    EventsStorage,
    DuesStorage,
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
});
