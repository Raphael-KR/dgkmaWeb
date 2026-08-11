import assert from "node:assert/strict";
import test from "node:test";
import { TODO_14_MANIFEST_SHA256 } from "./source-contracts";
import { readManifestAtOrDirectDescendant } from "./manifest-lineage";

test("current manifest is accepted only through the exact archived ancestor binding", () => {
  const current = readManifestAtOrDirectDescendant("docs/database-manifest.yaml", TODO_14_MANIFEST_SHA256);
  assert.equal(current.relation, "direct_descendant");
  assert.equal(current.value.manifest_lineage.parent_manifest_sha256, TODO_14_MANIFEST_SHA256);
  const ancestor = readManifestAtOrDirectDescendant(`docs/database-manifests/${TODO_14_MANIFEST_SHA256}.yaml`, TODO_14_MANIFEST_SHA256);
  assert.equal(ancestor.relation, "exact");
});
