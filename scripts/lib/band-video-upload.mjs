// Private imported-video storage is separate from the application's generic uploads.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileTypeFromFile } from "file-type";
import { z } from "zod";
import { bandVideoScope } from "../../server/modules/content/band-media-paths.ts";
import {
  CONTAINER,
  developmentBandObject,
  digest,
  requireMatch,
} from "./band-development-manifest.mjs";

const id = z.string().regex(/^[1-9]\d*$/);
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const contentType = "video/mp4";
const scope = bandVideoScope("development");
const entrySchema = z
  .object({
    sourcePostId: id,
    sourceVideoId: id,
    position: z.number().int().nonnegative(),
    sha256: fingerprint,
    size: z.number().int().safe().positive(),
    contentType: z.literal(contentType),
  })
  .strict();
const packageSchema = z
  .object({
    format: z.literal("band-development-video-package-v2"),
    environment: z.literal("development"),
    containerId: z.literal(CONTAINER),
    throughKst: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sourceQueueSha256: fingerprint,
    videos: z.array(entrySchema),
  })
  .strict();

async function batch(items, visit) {
  for (let i = 0; i < items.length; i += 3) {
    const done = await Promise.allSettled(items.slice(i, i + 3).map(visit));
    const failure = done.find((r) => r.status === "rejected");
    if (failure) throw failure.reason;
  }
}

async function checkStream(stream, entry) {
  let bytes = 0;
  const sha = createHash("sha256");
  for await (const part of stream) {
    bytes += part.length;
    sha.update(part);
  }
  const actual = sha.digest("hex");
  requireMatch(
    actual === entry.sha256 && bytes === entry.size,
    `video-bytes:expected=${entry.sha256}/${entry.size}:actual=${actual}/${bytes}`,
  );
}

async function createAndVerify(object, type, entry, write) {
  const [exists] = await object.exists();
  if (!exists) {
    const options = {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: type,
        cacheControl: "private, no-store",
        metadata: { importScope: scope },
      },
    };
    try {
      await write(options);
    } catch (e) {
      if (Number(e.code) !== 412) throw e;
    }
  }
  const [metadata] = await object.getMetadata();
  requireMatch(
    metadata.contentType === type &&
      metadata.metadata?.importScope === scope &&
      (!metadata.contentEncoding || metadata.contentEncoding === "identity") &&
      String(metadata.cacheControl).includes("private") &&
      metadata.generation &&
      metadata.metageneration &&
      Number(metadata.size) === entry.size,
    `private-video-metadata:expected-size=${entry.size}:actual-size=${metadata.size}`,
  );
  await checkStream(
    object.bucket.file(object.name, { generation: metadata.generation }).createReadStream(),
    entry,
  );
  return {
    generation: String(metadata.generation),
    metageneration: String(metadata.metageneration),
  };
}

export async function runVideoPackage({
  raw,
  dir,
  hash,
  output,
  target,
  validateOnly,
  assertBundleLayout,
  saveReceipt,
}) {
  const plan = packageSchema.parse(JSON.parse(raw));
  const files = new Map(),
    byPost = new Map(),
    ids = new Set();
  for (const video of plan.videos) {
    requireMatch(!ids.has(video.sourceVideoId), `duplicate-source-video:${video.sourceVideoId}`);
    ids.add(video.sourceVideoId);
    requireMatch(
      !files.has(video.sha256) || files.get(video.sha256).size === video.size,
      `inconsistent-video-size:${video.sha256}`,
    );
    files.set(video.sha256, video);
    const list = byPost.get(video.sourcePostId) || [];
    list.push(video);
    byPost.set(video.sourcePostId, list);
  }
  for (const [pid, list] of byPost) {
    list.sort((a, b) => a.position - b.position);
    requireMatch(
      list.every((e, i) => i === e.position),
      `invalid-source-video-order:${pid}`,
    );
  }
  await assertBundleLayout(dir, new Set(files.keys()));
  await batch([...files.values()], async (file) => {
    const path = join(dir, "files", file.sha256);
    const info = await lstat(path);
    requireMatch(
      info.isFile() &&
        info.size === file.size &&
        (await fileTypeFromFile(path))?.mime === contentType,
      `invalid-mp4-signature-or-size:expected-size=${file.size}:actual-size=${info.size}`,
    );
    await checkStream(createReadStream(path), file);
  });
  if (validateOnly) {
    console.log(
      JSON.stringify({
        status: "validated-videos",
        manifestSha256: hash,
        posts: byPost.size,
        videos: plan.videos.length,
        uniqueFiles: files.size,
      }),
    );
    return;
  }

  const mediaVersions = new Map(),
    catalogs = [];
  if (files.size) {
    const pool = await target.pool();
    try {
      await target.verifyDatabase(pool);
    } finally {
      await pool.end();
    }
    const privateDir = target.privateDir();
    const object = (key) => developmentBandObject(privateDir, key);
    // Every blob is verified before the first post's catalog becomes visible.
    await batch([...files.values()], async (file) => {
      const blob = object("videos/" + file.sha256 + ".mp4");
      const version = await createAndVerify(blob, contentType, file, (options) =>
        pipeline(
          createReadStream(join(dir, "files", file.sha256)),
          blob.createWriteStream(options),
        ),
      );
      mediaVersions.set(file.sha256, version);
    });
    await batch([...byPost], async ([sourcePostId, list]) => {
      const videos = list.map((f) => ({
        sourceId: f.sourceVideoId,
        sha256: f.sha256,
        size: f.size,
        contentType,
      }));
      const json = Buffer.from(
        JSON.stringify({
          format: "band-post-videos-v1",
          containerId: CONTAINER,
          sourcePostId,
          videos,
        }),
      );
      const entry = { sha256: digest(json), size: json.length };
      const obj = object("posts/" + sourcePostId + ".json");
      const version = await createAndVerify(obj, "application/json", entry, (options) =>
        obj.save(json, options),
      );
      catalogs.push({ sourcePostId, ...entry, ...version });
    });
  }
  const videos = plan.videos.map((v) => ({ ...v, ...mediaVersions.get(v.sha256) }));
  catalogs.sort((a, b) => a.sourcePostId.localeCompare(b.sourcePostId));
  const receipt = {
    format: "band-development-video-receipt-v2",
    environment: "development",
    containerId: CONTAINER,
    throughKst: plan.throughKst,
    sourceQueueSha256: plan.sourceQueueSha256,
    videos,
    catalogs,
  };
  await saveReceipt(output, receipt);
  console.log(
    JSON.stringify({
      status: "verified-videos",
      manifestSha256: hash,
      receiptSha256: digest(JSON.stringify(receipt) + "\n"),
      videos: videos.length,
      uniqueFiles: files.size,
      catalogs: catalogs.length,
    }),
  );
}
