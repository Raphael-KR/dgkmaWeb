import { z } from "zod";

export const COMMUNITY_EVENT_TYPES = ["obituary", "wedding", "opening", "other"] as const;
export const COMMUNITY_EVENT_STATUSES = ["draft", "published"] as const;
export const OBITUARY_RELATIONSHIPS = [
  "본인", "부친", "모친", "빙부", "빙모", "시부", "시모", "자녀",
] as const;

export const obituaryDetailsSchema = z.object({
  deceasedName: z.string().trim().min(1).optional(),
  deceasedAge: z.number().int().positive().max(130).optional(),
  relationship: z.enum(OBITUARY_RELATIONSHIPS).optional(),
  funeralDate: z.string().trim().min(1).optional(),
  funeralHome: z.string().trim().min(1).optional(),
  accountInfo: z.string().trim().optional(),
  sourceUrl: z.string().url().optional(),
  memberTitle: z.string().trim().optional(),
  familyContact: z.string().trim().optional(),
  burialPlace: z.string().trim().optional(),
  chiefMourner: z.string().trim().optional(),
}).strict();

export const memoDetailsSchema = z.object({
  memo: z.string().trim().max(5_000).optional(),
}).strict();

const commonDraftFields = {
  eventType: z.enum(COMMUNITY_EVENT_TYPES),
  title: z.string().trim().optional(),
  eventDate: z.string().trim().optional(),
  location: z.string().trim().optional(),
  relatedMemberName: z.string().trim().optional(),
  contactNumber: z.string().trim().optional(),
  accountInfo: z.string().trim().optional(),
  sourceText: z.string().max(20_000).optional(),
  sourceUrls: z.array(z.string().url()).max(3).default([]),
};

const draftCommonSchema = z.object(commonDraftFields);

export const communityEventDraftSchema = z.discriminatedUnion("eventType", [
  draftCommonSchema.extend({
    eventType: z.literal("obituary"),
    details: obituaryDetailsSchema.default({}),
  }),
  draftCommonSchema.extend({
    eventType: z.literal("wedding"),
    details: memoDetailsSchema.default({}),
  }),
  draftCommonSchema.extend({
    eventType: z.literal("opening"),
    details: memoDetailsSchema.default({}),
  }),
  draftCommonSchema.extend({
    eventType: z.literal("other"),
    details: memoDetailsSchema.default({}),
  }),
]);

const publishedCommonSchema = draftCommonSchema.extend({
  title: z.string().trim().min(1),
  eventDate: z.string().trim().min(1),
  relatedMemberName: z.string().trim().min(1),
});

export const communityEventPublishSchema = z.discriminatedUnion("eventType", [
  publishedCommonSchema.extend({
    eventType: z.literal("obituary"),
    location: z.string().trim().min(1),
    details: obituaryDetailsSchema.extend({
      deceasedName: z.string().trim().min(1),
      deceasedAge: z.number().int().positive().max(130),
      relationship: z.enum(OBITUARY_RELATIONSHIPS),
      funeralDate: z.string().trim().min(1),
      funeralHome: z.string().trim().min(1),
    }),
  }),
  publishedCommonSchema.extend({
    eventType: z.literal("wedding"),
    details: memoDetailsSchema.default({}),
  }),
  publishedCommonSchema.extend({
    eventType: z.literal("opening"),
    details: memoDetailsSchema.default({}),
  }),
  publishedCommonSchema.extend({
    eventType: z.literal("other"),
    details: memoDetailsSchema.default({}),
  }),
]);

export type CommunityEventDraftInput = z.infer<typeof communityEventDraftSchema>;
export type CommunityEventPublishInput = z.infer<typeof communityEventPublishSchema>;
export type ObituaryDetails = z.infer<typeof obituaryDetailsSchema>;
export type MemoDetails = z.infer<typeof memoDetailsSchema>;
export interface LegacyObituaryDetails {
  deceasedName?: string;
  legacyDateOfDeath?: string;
  legacyRelationship?: string;
  funeralHome?: string;
  accountInfo?: string;
  familyContact?: string;
  burialPlace?: string;
  chiefMourner?: string;
}
export type CommunityEventDetails = ObituaryDetails | MemoDetails | LegacyObituaryDetails;
export type CommunityEventType = (typeof COMMUNITY_EVENT_TYPES)[number];
export type CommunityEventStatus = (typeof COMMUNITY_EVENT_STATUSES)[number];
