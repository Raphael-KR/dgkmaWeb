import { z } from "zod";
const OBITUARY_RELATIONSHIPS = [
  "본인",
  "부친",
  "모친",
  "빙부",
  "빙모",
  "시부",
  "시모",
  "자녀",
] as const;
export const obituaryDetailsSchema = z
  .object({
    deceasedName: z.string().trim().min(1).optional(),
    deceasedAge: z.number().int().positive().max(130).optional(),
    relationship: z.enum(OBITUARY_RELATIONSHIPS).optional(),
    funeralDate: z.string().trim().min(1).optional(),
    funeralHome: z.string().trim().min(1).optional(),
    accountInfo: z.string().trim().optional(),
    sourceUrl: z.string().url().optional(),
    familyContactName: z.string().trim().optional(),
    familyContact: z.string().trim().optional(),
    burialPlace: z.string().trim().optional(),
    chiefMourner: z.string().trim().optional(),
  })
  .strict();

export type ObituaryDetails = z.infer<typeof obituaryDetailsSchema>;
export type ParsedObituaryDraft = {
  eventType: "obituary";
  title?: string;
  eventDate?: string;
  location?: string;
  relatedMemberName?: string;
  contactNumber?: string;
  accountInfo?: string;
  sourceText?: string;
  sourceUrls: string[];
  details: ObituaryDetails;
};
