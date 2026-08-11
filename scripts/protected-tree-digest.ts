import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const BEGIN = Buffer.from("<!-- ARCHITECTURE_ATTESTATION_GATE_BEGIN v1 -->\n");
const END = Buffer.from("<!-- ARCHITECTURE_ATTESTATION_GATE_END v1 -->\n");
const EXCLUDED_GATE = Buffer.from("<GATE-CONTENT-EXCLUDED-v1>\n");
const ATTESTATION_PATH = "docs/database-architecture-attestation.json";
const EXCLUDED_ATTESTATION = Buffer.from("<ATTESTATION-FILE-EXCLUDED-v1>\n");

function fail(code: string): never {
  throw new Error(code);
}

function canonicalBlob(path: string, bytes: Buffer): Buffer {
  if (path === ATTESTATION_PATH) return EXCLUDED_ATTESTATION;
  const begin = bytes.indexOf(BEGIN);
  const end = bytes.indexOf(END);
  if (begin < 0 && end < 0) return bytes;
  if (begin < 0 || end < 0 || end < begin || bytes.indexOf(BEGIN, begin + BEGIN.length) >= 0 || bytes.indexOf(END, end + END.length) >= 0) fail(`protected_tree_gate_marker_mismatch:${path}`);
  return Buffer.concat([bytes.subarray(0, begin + BEGIN.length), EXCLUDED_GATE, bytes.subarray(end)]);
}

export function computeProtectedTreeDigest(implementationSha: string): string {
  if (!/^[0-9a-f]{40}$/.test(implementationSha)) fail("protected_tree_implementation_sha_invalid");
  const rawTree = execFileSync("git", ["ls-tree", "-rz", "--format=%(objectname)%x00%(path)", implementationSha]);
  const fields: Buffer[] = [];
  let start = 0;
  for (let index = 0; index < rawTree.length; index += 1) if (rawTree[index] === 0) { fields.push(rawTree.subarray(start, index)); start = index + 1; }
  if (start !== rawTree.length || fields.length % 2 !== 0) fail("protected_tree_ls_tree_shape_invalid");
  const entries: Array<{ objectId: string | null; pathBytes: Buffer }> = [];
  for (let index = 0; index < fields.length; index += 2) entries.push({ objectId: fields[index].toString("ascii"), pathBytes: Buffer.from(fields[index + 1]) });
  const attestationBytes = Buffer.from(ATTESTATION_PATH);
  if (!entries.some((entry) => entry.pathBytes.equals(attestationBytes))) entries.push({ objectId: null, pathBytes: attestationBytes });
  entries.sort((left, right) => Buffer.compare(left.pathBytes, right.pathBytes));
  const hash = createHash("sha256");
  for (const entry of entries) {
    const path = entry.pathBytes.toString("utf8");
    const bytes = path === ATTESTATION_PATH ? EXCLUDED_ATTESTATION : canonicalBlob(path, execFileSync("git", ["cat-file", "blob", entry.objectId ?? fail("protected_tree_blob_missing")]));
    hash.update(entry.pathBytes);
    hash.update(Buffer.from([0]));
    hash.update(Buffer.from(String(bytes.length)));
    hash.update(Buffer.from([0]));
    hash.update(bytes);
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
}

if (process.argv[1]?.endsWith("protected-tree-digest.ts")) {
  const sha = process.argv[2] ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  console.log(JSON.stringify({ schema_version: "dgkma-protected-tree-digest-v1", implementation_sha: sha, protected_tree_digest_v1: computeProtectedTreeDigest(sha), result: "approved" }));
}
