import { NOTICE_SOURCE_TEXT_MAX_LENGTH } from "./content-limits";
import { z } from "zod";
import type { PostDocument } from "./post-document";

export const NOTICE_TYPES = ["obituary", "wedding", "opening"] as const;
export type NoticeType = (typeof NOTICE_TYPES)[number];
export const NOTICE_LABELS: Record<NoticeType, string> = {
  obituary: "부고",
  wedding: "결혼",
  opening: "개원",
};
export const noticeCategory = (type: NoticeType) =>
  type === "obituary" ? "obituary" : "celebration";
const fact = z.string().trim().max(500).nullable();
export const noticeFactsSchema = z
  .object({
    memberName: fact,
    admissionYear: fact,
    memberTitle: fact,
    relation: fact,
    deceasedName: fact,
    deceasedAge: fact,
    deathDate: fact,
    date: fact,
    time: fact,
    place: fact,
    room: fact,
    floor: fact,
    cemetery: fact,
    contactName: fact,
    contactPhone: fact,
    weddingRelation: fact,
    childName: fact,
    childAlumniInfo: fact,
    childMemberType: fact,
    childTitle: fact,
    partnerName: fact,
    clinicName: fact,
    groomName: fact.optional(),
    brideName: fact.optional(),
    weddingPartyRole: fact.optional(),
    childAdmissionYear: fact.optional(),
    childGraduationClass: fact.optional(),
    address: fact.optional(),
    meal: fact.optional(),
    parking: fact.optional(),
    flowerPolicy: fact.optional(),
    visitationDeclined: z.boolean(),
    notes: z.array(z.string().trim().max(500)).max(10),
    accounts: z
      .array(
        z
          .object({
            role: z.enum(["member", "alumni-child"]),
            label: z.string().trim().max(80),
            bank: z.string().trim().max(80),
            number: z.string().trim().max(80),
            holder: z.string().trim().max(80),
          })
          .strict(),
      )
      .max(3),
    questions: z.array(z.string().trim().max(300)).max(10),
  })
  .strict();
export type NoticeFacts = z.infer<typeof noticeFactsSchema>;
export function emptyNoticeFacts(): NoticeFacts {
  return noticeFactsSchema.parse({
    ...Object.fromEntries(Object.keys(noticeFactsSchema.shape).map((key) => [key, null])),
    visitationDeclined: false,
    notes: [],
    accounts: [],
    questions: [],
  });
}
export type NoticeSource = {
  url: string;
  status: "fetched" | "unavailable" | "blocked";
  message?: string;
};
export type NoticeFieldSource = {
  kind: "user" | "html" | "api" | "rendered" | "ocr" | "unresolved";
  url?: string;
  locator?: string;
  collectedAt?: string;
};
export type NoticeData = {
  schemaVersion: 1;
  eventType: NoticeType;
  facts: NoticeFacts | null;
  questions: string[];
  sources: NoticeSource[];
  fieldSources?: Partial<Record<keyof NoticeFacts, NoticeFieldSource[]>>;
};
export type NoticeDraft = {
  id: number;
  title: string;
  content: PostDocument;
  sourceText: string | null;
  revision: number;
  isPublished: boolean | null;
  eventData: NoticeData;
};
export const noticeRevisionSchema = z.object({ revision: z.number().int().nonnegative() }).strict();
export const noticeTextSchema = noticeRevisionSchema
  .extend({ sourceText: z.string().max(NOTICE_SOURCE_TEXT_MAX_LENGTH) })
  .strict();
