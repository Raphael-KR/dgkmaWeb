import { streamPrivateMp4 } from "../../integrations/object-storage/stream-private-mp4";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { importedVideosPath, type ImportedVideo } from "@shared/contracts/imported-videos";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../../integrations/object-storage/objectStorage";
import { logObjectStorageFailure } from "../../lib/safe-logging";
import { storage } from "../../storage";
import {
  BAND_VIDEO_CATALOG_MAX_BYTES,
  bandContainerId,
  bandMediaEnvironment,
  bandMediaPrefix,
  bandVideoCatalogSchema,
  bandVideoScope,
  bandVideoSourceId,
  type BandVideo,
} from "./band-media-paths";

class VideoDataError extends Error {
  constructor(readonly facts: Record<string, number | boolean | string>) {
    super("Invalid imported video data");
  }
}

async function readVideos(
  objects: ObjectStorageService,
  prefix: string,
  sourcePostId: string,
  scope: string,
) {
  let file;
  try {
    file = await objects.getObjectEntityFile(`${prefix}/posts/${sourcePostId}.json`);
  } catch (error) {
    // The importer writes a catalogue only for posts that have videos.
    if (error instanceof ObjectNotFoundError) return [];
    throw error;
  }
  const [metadata] = await file.getMetadata();
  const expectedSize = Number(metadata.size);
  if (
    metadata.metadata?.importScope !== scope ||
    metadata.contentType !== "application/json" ||
    (metadata.contentEncoding && metadata.contentEncoding !== "identity") ||
    !metadata.generation ||
    !Number.isSafeInteger(expectedSize) ||
    expectedSize <= 0 ||
    expectedSize > BAND_VIDEO_CATALOG_MAX_BYTES
  ) {
    throw new VideoDataError({ catalogMetadataMatches: false });
  }
  const version = file.bucket.file(file.name, { generation: metadata.generation });
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of version.createReadStream({ decompress: false })) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > BAND_VIDEO_CATALOG_MAX_BYTES)
      throw new VideoDataError({ maximumBytes: BAND_VIDEO_CATALOG_MAX_BYTES, actualBytes: size });
    chunks.push(bytes);
  }
  const catalog = bandVideoCatalogSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  const uniqueIds = new Set(catalog.videos.map((video) => video.sourceId)).size;
  if (catalog.sourcePostId !== sourcePostId || uniqueIds !== catalog.videos.length) {
    throw new VideoDataError({
      sourcePostMatches: catalog.sourcePostId === sourcePostId,
      entries: catalog.videos.length,
      uniqueIds,
    });
  }
  return catalog.videos;
}

async function serveVideo(
  req: Request,
  res: Response,
  objects: ObjectStorageService,
  prefix: string,
  video: BandVideo,
  scope: string,
) {
  const file = await objects.getObjectEntityFile(`${prefix}/videos/${video.sha256}.mp4`);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  const identityEncoding = !metadata.contentEncoding || metadata.contentEncoding === "identity";
  if (
    size !== video.size ||
    metadata.contentType !== video.contentType ||
    metadata.metadata?.importScope !== scope ||
    !identityEncoding ||
    !metadata.generation
  ) {
    throw new VideoDataError({
      expectedBytes: video.size,
      actualBytes: Number.isFinite(size) ? size : "unknown",
      mp4: metadata.contentType === video.contentType,
      scopeMatches: metadata.metadata?.importScope === scope,
      identityEncoding,
      hasGeneration: Boolean(metadata.generation),
    });
  }

  const version = file.bucket.file(file.name, { generation: metadata.generation });
  streamPrivateMp4(req, res, version, size);
}

export function registerImportedVideoRoutes(app: Express) {
  const objects = new ObjectStorageService();
  // The content router checks the verified session. Recheck the parent on every range request.
  app.get(`${importedVideosPath(":id")}/:videoId?`, async (req: Request, res: Response) => {
    try {
      const postId = z.coerce.number().int().positive().max(2147483647).safeParse(req.params.id);
      if (!postId.success) return res.sendStatus(404);
      const viewer = await storage.getUser(req.session.userId!);
      if (!viewer?.isVerified) return res.sendStatus(401);
      const post = await storage.getPost(postId.data, viewer);
      const source = post?.importData;
      if (
        source?.platform !== "band" ||
        source.containerId !== bandContainerId ||
        !bandVideoSourceId.safeParse(source.sourceId).success
      ) {
        return res.sendStatus(404);
      }
      const environment = bandMediaEnvironment();
      const prefix = `/objects/${bandMediaPrefix(environment)}`;
      const scope = bandVideoScope(environment);
      const videos = await readVideos(objects, prefix, source.sourceId, scope);
      if (req.params.videoId === undefined) {
        return res.json(videos.map((video): ImportedVideo => ({ id: video.sourceId })));
      }
      const video = videos.find((entry) => entry.sourceId === req.params.videoId);
      if (!video) return res.sendStatus(404);
      await serveVideo(req, res, objects, prefix, video, scope);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return res.sendStatus(404);
      logObjectStorageFailure("serve", error, {
        resource: "band-video",
        ...(error instanceof VideoDataError ? error.facts : {}),
      });
      return res.status(500).json({ message: "영상을 불러오지 못했습니다." });
    }
  });
}
