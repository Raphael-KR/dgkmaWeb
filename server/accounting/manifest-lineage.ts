import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function readManifestAtOrDirectDescendant(
  manifestPath: string,
  ancestorSha256: string,
): { bytes: Buffer; value: Record<string, any>; sha256: string; relation: "exact" | "direct_descendant"; lineageDepth: number } {
  const bytes = readFileSync(manifestPath);
  const currentSha256 = sha256(bytes);
  const value = JSON.parse(bytes.toString("utf8")) as Record<string, any>;
  if (currentSha256 === ancestorSha256) return { bytes, value, sha256: currentSha256, relation: "exact", lineageDepth: 0 };
  let cursor = value;
  const observed = new Set([currentSha256]);
  for (let depth = 1; depth <= 32; depth += 1) {
    const lineage = cursor.manifest_lineage as Record<string, unknown> | undefined;
    const parentSha = lineage?.parent_manifest_sha256;
    const parentPath = lineage?.parent_manifest_path;
    if (typeof parentSha !== "string" || !/^[0-9a-f]{64}$/.test(parentSha) || parentPath !== `docs/database-manifests/${parentSha}.yaml` || observed.has(parentSha)) {
      throw new Error("manifest_ancestor_binding_mismatch");
    }
    const parentBytes = readFileSync(parentPath);
    if (sha256(parentBytes) !== parentSha) throw new Error("manifest_ancestor_archive_mismatch");
    if (parentSha === ancestorSha256) return { bytes, value, sha256: currentSha256, relation: "direct_descendant", lineageDepth: depth };
    observed.add(parentSha);
    cursor = JSON.parse(parentBytes.toString("utf8")) as Record<string, any>;
  }
  throw new Error("manifest_ancestor_binding_mismatch");
}
