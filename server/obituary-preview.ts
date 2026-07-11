import {
  communityEventDraftSchema,
  type CommunityEventDraftInput,
} from "@shared/community-events";
import type { ObituaryAnnouncementInput } from "@shared/obituary-announcement";
import type {
  AlumniRecord,
  CommunityEvent,
  MembershipStatus,
  User,
} from "@shared/schema";

type PreviewSources = {
  draft: ObituaryDraftInput;
  user: User | undefined;
  alumni: AlumniRecord | undefined;
  membership: MembershipStatus;
};

type ObituaryDraftInput = Extract<CommunityEventDraftInput, { eventType: "obituary" }>;

export type StoredObituaryDraftValidation =
  | { draft: ObituaryDraftInput; missingFields: [] }
  | { draft?: undefined; missingFields: string[] };

export type ObituaryPreviewAssembly =
  | { input: ObituaryAnnouncementInput; missingFields: [] }
  | { input?: undefined; missingFields: string[] };

function requiredText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function admissionYearLabel(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const normalized = value
    .trim()
    .replace(/[./]/g, "-")
    .replace(/\s*년\s*/, "-")
    .replace(/\s*월\s*/, "-")
    .replace(/\s*일\s*$/, "")
    .replace(/\s/g, "");
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return undefined;
  }

  return `${String(year % 100).padStart(2, "0")}학번`;
}

function optionalStoredText(value: unknown): unknown {
  return value ?? undefined;
}

export function parseStoredObituaryDraft(
  stored: CommunityEvent,
): StoredObituaryDraftValidation {
  const result = communityEventDraftSchema.safeParse({
    eventType: stored.eventType,
    title: optionalStoredText(stored.title),
    eventDate: optionalStoredText(stored.eventDate),
    location: optionalStoredText(stored.location),
    relatedMemberName: optionalStoredText(stored.relatedMemberName),
    contactNumber: optionalStoredText(stored.contactNumber),
    accountInfo: optionalStoredText(stored.accountInfo),
    sourceText: optionalStoredText(stored.sourceText),
    sourceUrls: stored.sourceUrls ?? [],
    details: stored.details,
  });
  if (!result.success || result.data.eventType !== "obituary") {
    const missingFields = result.success
      ? ["eventType"]
      : Array.from(new Set(result.error.issues.map((issue) => {
        const [root, detail] = issue.path;
        return root === "details" && typeof detail === "string" ? detail : String(root ?? "draft");
      })));
    return { missingFields };
  }
  return { draft: result.data, missingFields: [] };
}

export function assembleObituaryPreview({
  draft,
  user,
  alumni,
  membership,
}: PreviewSources): ObituaryPreviewAssembly {
  const details = draft.details;
  const graduationClass = requiredText(alumni?.generation);
  const admissionYear = admissionYearLabel(alumni?.admissionDate);
  const memberName = requiredText(user?.name);
  const membershipTier = membership.tier === "권리회원" || membership.tier === "일반회원"
    ? membership.tier
    : undefined;
  const relationship = details.relationship;
  const deceasedName = requiredText(details.deceasedName);
  const deceasedAge = Number.isInteger(details.deceasedAge) && (details.deceasedAge ?? 0) > 0
    ? details.deceasedAge
    : undefined;
  const funeralHome = requiredText(details.funeralHome);
  const funeralDate = requiredText(details.funeralDate);
  const memberPhone = requiredText(user?.phoneNumber ?? alumni?.mobile);
  const requiredValues = {
    graduationClass,
    admissionYear,
    memberName,
    membershipTier,
    relationship,
    deceasedName,
    deceasedAge,
    funeralHome,
    funeralDate,
    memberPhone,
  };
  const missingFields = Object.entries(requiredValues)
    .filter(([, value]) => value === undefined)
    .map(([field]) => field);
  if (missingFields.length > 0) return { missingFields };

  return {
    input: {
      graduationClass: graduationClass!,
      admissionYear: admissionYear!,
      memberName: memberName!,
      membershipTier: membershipTier!,
      memberTitle: requiredText(alumni?.alumniPosition),
      relationship: relationship!,
      deceasedName: deceasedName!,
      deceasedAge: deceasedAge!,
      funeralHome: funeralHome!,
      funeralDate: funeralDate!,
      memberPhone: memberPhone!,
      accountInfo: requiredText(details.accountInfo) ?? requiredText(draft.accountInfo),
      sourceUrl: requiredText(details.sourceUrl),
    },
    missingFields: [],
  };
}
