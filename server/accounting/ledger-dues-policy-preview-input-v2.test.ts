import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("policy preview reader is read-only, profile-bound, ephemeral, and creates no decisions", async () => {
  const source = await readFile(new URL("../../scripts/fetch-ledger-dues-policy-preview-input-v2.ts", import.meta.url), "utf8");
  assert.match(source, /spreadsheets\.readonly/);
  assert.match(source, /drive\.metadata\.readonly/);
  assert.match(source, /dues_policy_source_profile_stale/);
  assert.match(source, /decisions: \[\]/);
  assert.match(source, /source_uid: SOURCE_UID/);
  assert.match(source, /release_uid: RELEASE_UID/);
  assert.match(source, /source_display_snapshot: "회비수입"/);
  assert.match(source, /vice_president_auditor_chair/);
  assert.match(source, /output\.startsWith\("\/tmp\/"\)/);
  assert.doesNotMatch(source, /spreadsheets\.values\.(update|append)|batchUpdate|files\.update/);
});
