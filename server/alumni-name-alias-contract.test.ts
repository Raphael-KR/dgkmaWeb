import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("official alumni aliases use a separate constrained table and obituary-only lookup", async () => {
  const [schema, storage, policy] = await Promise.all([
    readFile(new URL("../shared/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("./storage.ts", import.meta.url), "utf8"),
    readFile(new URL("./obituary-member-policy.ts", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /pgTable\("alumni_name_aliases"/);
  assert.match(schema, /alumni_name_aliases_alumni_normalized_unique/);
  assert.match(schema, /alumni_name_aliases_preferred_unique/);
  assert.match(schema, /alumni_name_aliases_type_check/);
  assert.match(schema, /alumni_name_aliases_normalized_not_blank/);
  assert.match(storage, /findAlumniByNameOrAlias/);
  assert.match(policy, /findAlumniByNameOrAlias/);
  assert.match(storage, /findAlumniByName\(name: string\)/);
});
