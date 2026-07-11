import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("legacy obituary migration is explicit and idempotent", async () => {
  const sql = await readFile(
    new URL("../scripts/migrate-obituaries-to-community-events.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /INSERT INTO community_events/);
  assert.match(sql, /'obituary'/);
  assert.match(sql, /'published'/);
  assert.match(sql, /jsonb_build_object/);
  assert.match(sql, /ON CONFLICT \(legacy_obituary_id\) DO NOTHING/);
  assert.match(sql, /FROM obituaries/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});

test("legacy obituary fields are preserved without unsafe normalization", async () => {
  const sql = await readFile(
    new URL("../scripts/migrate-obituaries-to-community-events.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /title,\n  date_of_death,\n  funeral_home,\n  NULL,/);
  assert.match(sql, /'legacyDateOfDeath', date_of_death/);
  assert.match(sql, /'legacyRelationship', deceased_relation/);
  assert.match(sql, /'chiefMourner', chief_mourner/);
  assert.match(sql, /'deceasedName', deceased_name/);
  assert.match(sql, /'funeralHome', funeral_home/);
  assert.match(sql, /'accountInfo', bank_account/);
  assert.match(sql, /'familyContact', contact_number/);
  assert.match(sql, /'burialPlace', jangji/);
  assert.doesNotMatch(sql, /'relationship', deceased_relation/);
  assert.doesNotMatch(sql, /'funeralDate', date_of_death/);
});
