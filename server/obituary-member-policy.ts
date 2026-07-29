import {
  ANNUAL_DUES,
  type AlumniRecord,
  type CommunityEvent,
  type MembershipStatus,
  type User,
} from "@shared/schema";
import { renderObituaryAnnouncement } from "@shared/obituary-announcement";
import { koreaCalendarYear } from "./korea-date";
import {
  admissionYearLabel,
  assembleObituaryPreview,
  parseStoredObituaryDraft,
} from "./obituary-preview";

export type ObituaryMemberStorage = {
  findAlumniByName(name: string): Promise<AlumniRecord[]>;
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

function normalizeMemberName(value: string | null | undefined): string {
  return value?.replace(/\s/g, "") ?? "";
}

function admissionYearFromSource(sourceText: string | undefined): string | undefined {
  if (!sourceText) return undefined;
  const labels = new Set(
    Array.from(sourceText.matchAll(/(?<!\d)(\d{4}|\d{2})\s*학번/g))
      .map((match) => `${match[1].slice(-2)}학번`),
  );
  return labels.size === 1 ? Array.from(labels)[0] : undefined;
}

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

async function resolvePreviewSources(
  draft: Parameters<typeof assembleObituaryPreview>[0]["draft"],
  requesterId: number,
  memberStorage: ObituaryMemberStorage,
) {
  const [requester, requesterAlumni] = await Promise.all([
    memberStorage.getUser(requesterId),
    memberStorage.getAlumniRecordByUserId(requesterId),
  ]);
  const requestedName = normalizeMemberName(draft.relatedMemberName);
  const requesterName = normalizeMemberName(requester?.name);
  const requestedAdmissionYear = admissionYearFromSource(draft.sourceText);
  const requesterAdmissionYear = admissionYearLabel(requesterAlumni?.admissionDate);
  const isRequester = requestedName !== ""
    && requestedName === requesterName
    && (!requestedAdmissionYear || requestedAdmissionYear === requesterAdmissionYear);

  if (!requester?.isAdmin && !isRequester) {
    return {
      kind: "blocked" as const,
      message: "일반회원은 본인 경조사만 등록할 수 있습니다",
      missingFields: ["relatedMemberName"],
    };
  }

  if (!requester?.isAdmin || isRequester) {
    const membership = await memberStorage.getMembershipStatus(requesterId);
    return { kind: "ready" as const, user: requester, alumni: requesterAlumni, membership };
  }

  if (!requestedName || !requestedAdmissionYear) {
    return {
      kind: "blocked" as const,
      message: "대리 등록하려면 동문 이름과 학번이 필요합니다",
      missingFields: requestedName ? ["admissionYear"] : ["relatedMemberName", "admissionYear"],
    };
  }

  const alumniMatches = (await memberStorage.findAlumniByName(draft.relatedMemberName ?? ""))
    .filter((alumni) => admissionYearLabel(alumni.admissionDate) === requestedAdmissionYear);
  if (alumniMatches.length !== 1) {
    return {
      kind: "blocked" as const,
      message: "명부에서 이름과 학번이 정확히 일치하는 동문 한 명을 확인할 수 없습니다",
      missingFields: ["relatedMemberName", "admissionYear"],
    };
  }

  const alumni = alumniMatches[0];
  const user = alumni.matchedUserId
    ? await memberStorage.getUser(alumni.matchedUserId)
    : undefined;
  const membership = user
    ? await memberStorage.getMembershipStatus(user.id)
    : regularMembership();
  return { kind: "ready" as const, user, alumni, membership };
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

  const sources = await resolvePreviewSources(
    validatedDraft.draft,
    requesterId,
    memberStorage,
  );
  if (sources.kind === "blocked") return sources;

  const preview = assembleObituaryPreview({
    draft: validatedDraft.draft,
    user: sources.user,
    alumni: sources.alumni,
    membership: sources.membership,
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
