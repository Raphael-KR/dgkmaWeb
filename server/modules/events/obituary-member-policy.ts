import {
  ANNUAL_DUES,
  type AlumniRecord,
  type CommunityEvent,
  type MembershipStatus,
  type User,
} from "@shared/schema";
import { renderObituaryAnnouncement } from "@shared/obituary-announcement";
import { koreaCalendarYear } from "../../lib/korea-date";
import {
  assembleObituaryPreview,
  parseStoredObituaryDraft,
} from "./obituary-preview";
import { normalizeMemberName, resolveEventMember } from "./event-member-policy";

export type ObituaryMemberStorage = {
  findAlumniByName(name: string): Promise<AlumniRecord[]>;
  findAlumniByNameOrAlias(name: string): Promise<AlumniRecord[]>;
  getAlumniRecordByUserId(userId: number): Promise<AlumniRecord | undefined>;
  getMembershipStatus(userId: number): Promise<MembershipStatus>;
  getUser(userId: number): Promise<User | undefined>;
};

export type TrustedObituaryAssembly =
  | { kind: "invalid"; missingFields: string[] }
  | { kind: "missing"; missingFields: string[] }
  | { kind: "blocked"; message: string; missingFields: string[] }
  | {
    kind: "ready";
    input: NonNullable<ReturnType<typeof assembleObituaryPreview>["input"]>;
    text: string;
  };

function regularMembership(): MembershipStatus {
  return {
    year: koreaCalendarYear(),
    tier: "일반회원",
    isPaid: false,
    paidAmount: 0,
    annualDues: ANNUAL_DUES,
    currentYearPayment: null,
  };
}

export async function assembleTrustedObituary(
  draft: CommunityEvent,
  requesterId: number,
  memberStorage: ObituaryMemberStorage,
): Promise<TrustedObituaryAssembly> {
  const validatedDraft = parseStoredObituaryDraft(draft);
  if (!validatedDraft.draft) {
    return { kind: "invalid", missingFields: validatedDraft.missingFields };
  }

  if (
    validatedDraft.draft.details.relationship === "본인"
    && normalizeMemberName(validatedDraft.draft.relatedMemberName)
      !== normalizeMemberName(validatedDraft.draft.details.deceasedName)
  ) {
    return {
      kind: "blocked",
      message: "본인상은 동문 이름과 고인 이름이 같아야 합니다",
      missingFields: ["details.deceasedName"],
    };
  }

  const sources = await resolveEventMember(
    validatedDraft.draft,
    requesterId,
    memberStorage,
  );
  if (sources.kind === "blocked") return sources;
  const membership = sources.user
    ? await memberStorage.getMembershipStatus(sources.user.id)
    : regularMembership();

  const preview = assembleObituaryPreview({
    draft: validatedDraft.draft,
    user: sources.user,
    alumni: sources.alumni,
    memberDisplayName: sources.memberDisplayName,
    membership,
  });
  if (!preview.input) {
    return { kind: "missing", missingFields: preview.missingFields };
  }

  return {
    kind: "ready",
    input: preview.input,
    text: renderObituaryAnnouncement(preview.input),
  };
}
