import { z } from "zod";

const text = z.string().trim().min(1).max(500);
const instant = z.string().datetime({ offset: true });
export const postImportDataSchema = z
  .object({
    schemaVersion: z.literal(1),
    platform: z.enum(["daum-cafe", "band"]),
    containerId: text,
    sourceId: text,
    boardPath: z.array(text).min(1).max(8),
    url: z
      .string()
      .max(4096)
      .url()
      .refine((value) => {
        try {
          const url = new URL(value);
          return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
        } catch {
          return false;
        }
      }, "A source URL must be HTTP(S) without credentials"),
    originalCreatedAt: instant,
    timePrecision: z.enum(["day", "minute"]),
    importedAt: instant,
  })
  .strict();

export type PostImportData = z.infer<typeof postImportDataSchema>;

export function isBandAnnouncement(source: Pick<PostImportData, "platform" | "sourceId">) {
  return source.platform === "band" && /^announcement:[1-9]\d*$/.test(source.sourceId);
}
