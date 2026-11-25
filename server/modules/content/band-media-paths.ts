import { z } from "zod";

export const bandContainerId = "11089836";
export const BAND_VIDEO_CATALOG_MAX_BYTES = 256 * 1024;
export const bandVideoSourceId = z.string().regex(/^[0-9]{1,20}$/);
const videoSchema = z
  .object({
    sourceId: bandVideoSourceId,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().positive().safe(),
    contentType: z.literal("video/mp4"),
  })
  .strict();
export type BandVideo = z.infer<typeof videoSchema>;

export const bandVideoCatalogSchema = z
  .object({
    format: z.literal("band-post-videos-v1"),
    containerId: z.literal(bandContainerId),
    sourcePostId: bandVideoSourceId,
    videos: z.array(videoSchema),
  })
  .strict();

type Environment = "development" | "production";

export function bandMediaEnvironment(): Environment {
  return process.env.REPLIT_DEPLOYMENT === "1" ? "production" : "development";
}

export function bandMediaPrefix(environment: Environment) {
  return `heritage/band-media/${environment}/${bandContainerId}`;
}

export function bandAttachmentScope(environment: Environment) {
  return `dgkma-band-${bandContainerId}-${environment}-v1`;
}

export function bandVideoScope(environment: Environment) {
  return `dgkma-band-private-video-${environment}-v2`;
}
