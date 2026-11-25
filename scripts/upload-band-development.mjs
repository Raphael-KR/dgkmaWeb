// Receives only the private package produced from a reviewed local queue.
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile, link, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { migrationTarget } from "../local-backups/community/tools/migration-target.mjs";
import {
  BAND_UPLOAD_SCOPE as scope,
  CONTAINER,
  bandLogicalPath,
  bandObject,
  digest,
  listBandUploads,
  requireMatch,
  validateBandUpload,
  verifyBandStoredAsset,
  visitBandFiles,
} from "./lib/band-development-manifest.mjs";

const workspace = fileURLToPath(new URL("../", import.meta.url));
const asset = z
  .object({
    objectPath: bandLogicalPath,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    name: z.string().min(1),
    contentType: z.string().min(1),
    size: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
  })
  .strict();
const schema = z
  .object({
    format: z.literal("band-development-upload-package-v2"),
    environment: z.literal("development"),
    containerId: z.literal(CONTAINER),
    throughKst: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sourceQueueSha256: z.string().regex(/^[a-f0-9]{64}$/),
    assets: z.array(asset),
  })
  .strict();

let stage = "arguments";
let created = 0;
let verified = 0;

async function assertBundleLayout(dir, hashes) {
  const entries = await readdir(dir, { withFileTypes: true });
  requireMatch(
    entries.length === 2 &&
      entries.some((e) => e.name === "files" && e.isDirectory()) &&
      entries.some((e) => e.name === "upload-manifest.json" && e.isFile()),
    "unexpected-package-entries",
  );
  const files = await readdir(join(dir, "files"), { withFileTypes: true });
  requireMatch(
    files.length === hashes.size && files.every((e) => e.isFile() && hashes.has(e.name)),
    `package-files:expected=${hashes.size}:actual=${files.length}`,
  );
}

async function verifiedBytes(dir, entry) {
  const path = join(dir, "files", entry.sha256);
  const stat = await lstat(path);
  requireMatch(
    stat.isFile() && stat.size === entry.size,
    `local-size:${entry.objectPath}:expected=${entry.size}:actual=${stat.size}`,
  );
  const bytes = await readFile(path);
  await validateBandUpload(entry, bytes);
  return bytes;
}

async function verifyOrCreate(privateDir, dir, entry, existingNames) {
  const object = bandObject(privateDir, entry.objectPath);
  if (!existingNames.has(object.name)) {
    const bytes = await verifiedBytes(dir, entry);
    const downloadName = encodeURIComponent(entry.name).replace(
      /['()*]/g,
      (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
    );
    try {
      await object.save(bytes, {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
          contentType: entry.contentType,
          cacheControl: "private, no-store",
          metadata: { downloadName, importScope: scope },
        },
      });
      created++;
    } catch (error) {
      // A competing writer can win after the existence check. Its bytes and metadata must still match.
      if (Number(error.code) !== 412) throw error;
    }
  }
  const version = await verifyBandStoredAsset(entry, object, scope);
  verified++;
  return { ...entry, ...version };
}

async function saveReceipt(path, receipt) {
  const data = JSON.stringify(receipt) + "\n";
  const tmp = join(dirname(path), ".band-upload-receipt-" + randomUUID());
  await writeFile(tmp, data, { flag: "wx", mode: 0o600 });
  try {
    await link(tmp, path);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    requireMatch(
      (await lstat(path)).isFile() && (await readFile(path, "utf8")) === data,
      "existing-receipt-differs",
    );
  } finally {
    await unlink(tmp);
  }
}

async function run() {
  const [mode, input, hash, output] = process.argv.slice(2);
  const videos = mode === "--validate-videos" || mode === "--upload-videos";
  const validateOnly = mode === "--validate" || mode === "--validate-videos";
  requireMatch(
    ["--validate", "--upload", "--validate-videos", "--upload-videos"].includes(mode) &&
      input &&
      /^[a-f0-9]{64}$/.test(hash) &&
      (validateOnly ? !output : Boolean(output)),
    "arguments:mode-package-reviewedHash-[newReceipt]",
  );
  const target = migrationTarget(workspace, "development", "heliumdb");
  const dir = resolve(input);
  requireMatch((await lstat(dir)).isDirectory(), "package-directory");
  requireMatch((await lstat(join(dir, "upload-manifest.json"))).isFile(), "package-manifest");
  const raw = await readFile(join(dir, "upload-manifest.json"));
  requireMatch(digest(raw) === hash, `package-digest:expected=${hash}:actual=${digest(raw)}`);
  const destination = output ? resolve(output) : undefined;
  if (destination) {
    requireMatch(
      destination !== dir && !destination.startsWith(dir + "/"),
      "receipt-must-be-outside-package",
    );
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  }
  if (videos) {
    stage = validateOnly ? "validate-private-videos" : "upload-and-verify-private-videos";
    const { runVideoPackage } = await import("./lib/band-video-upload.mjs");
    return runVideoPackage({
      raw,
      dir,
      hash,
      output: destination,
      target,
      validateOnly,
      assertBundleLayout,
      saveReceipt,
    });
  }
  const plan = schema.parse(JSON.parse(raw));
  requireMatch(
    new Set(plan.assets.map((e) => e.objectPath)).size === plan.assets.length,
    "duplicate-upload-path",
  );
  stage = "validate";
  await assertBundleLayout(dir, new Set(plan.assets.map((e) => e.sha256)));
  for (const entry of plan.assets) await verifiedBytes(dir, entry);
  if (mode === "--validate") {
    console.log(
      JSON.stringify({ status: "validated", manifestSha256: hash, assets: plan.assets.length }),
    );
    return;
  }
  const saved = new Map();
  if (plan.assets.length) {
    stage = "verify-development-target";
    const pool = await target.pool();
    try {
      await target.verifyDatabase(pool);
    } finally {
      await pool.end();
    }
    stage = "upload-and-readback";
    const privateDir = target.privateDir();
    const existingNames = new Set();
    for await (const object of listBandUploads(privateDir)) existingNames.add(object.name);
    await visitBandFiles(plan.assets, async (entry) => {
      saved.set(entry.objectPath, await verifyOrCreate(privateDir, dir, entry, existingNames));
    });
  }
  stage = "receipt";
  const receipt = {
    format: "band-development-upload-receipt-v2",
    environment: "development",
    containerId: CONTAINER,
    throughKst: plan.throughKst,
    sourceQueueSha256: plan.sourceQueueSha256,
    assets: plan.assets.map((e) => saved.get(e.objectPath)),
  };
  await saveReceipt(destination, receipt);
  console.log(
    JSON.stringify({
      status: "verified",
      sourceQueueSha256: plan.sourceQueueSha256,
      manifestSha256: hash,
      receiptSha256: digest(JSON.stringify(receipt) + "\n"),
      created,
      verified,
    }),
  );
}

run().catch((error) => {
  console.error(
    JSON.stringify({
      status: "failed",
      stage,
      created,
      verified,
      reason: error.importDetail,
      type: error.name,
      code: error.code,
    }),
  );
  process.exitCode = 1;
});
