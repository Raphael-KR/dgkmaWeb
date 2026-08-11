import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function readManifestAtOrDirectDescendant(
  manifestPath: string,
  ancestorSha256: string,
): { bytes: Buffer; value: Record<string, any>; sha256: string; relation: "exact" | "direct_descendant" } {
  const bytes = readFileSync(manifestPath);
  const currentSha256 = sha256(bytes);
  const value = JSON.parse(bytes.toString("utf8")) as Record<string, any>;
  if (currentSha256 === ancestorSha256) return { bytes, value, sha256: currentSha256, relation: "exact" };
  const lineage = value.manifest_lineage as Record<string, unknown> | undefined;
  const expectedParentPath = `docs/database-manifests/${ancestorSha256}.yaml`;
  if (lineage?.parent_manifest_sha256 !== ancestorSha256 || lineage.parent_manifest_path !== expectedParentPath) {
    throw new Error("manifest_ancestor_binding_mismatch");
  }
  if (sha256(readFileSync(expectedParentPath)) !== ancestorSha256) throw new Error("manifest_ancestor_archive_mismatch");
  return { bytes, value, sha256: currentSha256, relation: "direct_descendant" };
}
