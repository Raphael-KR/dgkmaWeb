import {
  OBITUARY_RELATIONSHIPS,
  type ObituaryDetails,
} from "@shared/community-events";
import type { ObituaryAnnouncementInput } from "@shared/obituary-announcement";
import type {
  AlumniRecord,
  CommunityEvent,
  MembershipStatus,
  User,
} from "@shared/schema";

type PreviewSources = {
  draft: CommunityEvent;
  user: User | undefined;
  alumni: AlumniRecord | undefined;
  membership: MembershipStatus;
};

export type ObituaryPreviewAssembly =
  | { input: ObituaryAnnouncementInput; missingFields: [] }
  | { input?: undefined; missingFields: string[] };

function requiredText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function admissionYearLabel(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
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

export function assembleObituaryPreview({
  draft,
  user,
  alumni,
  membership,
}: PreviewSources): ObituaryPreviewAssembly {
  const details = draft.details as ObituaryDetails;
  const graduationClass = requiredText(alumni?.generation);
  const admissionYear = admissionYearLabel(alumni?.admissionDate);
  const memberName = requiredText(user?.name);
  const membershipTier = requiredText(membership.tier);
  const relationship = OBITUARY_RELATIONSHIPS.includes(
    details.relationship as (typeof OBITUARY_RELATIONSHIPS)[number],
  ) ? details.relationship : undefined;
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
      accountInfo: requiredText(details.accountInfo ?? draft.accountInfo),
      sourceUrl: requiredText(details.sourceUrl),
    },
    missingFields: [],
  };
}
