import type { AlumniRecord, User } from "@shared/schema";
import { admissionYearLabel } from "./member-labels";

export type EventMemberStorage = {
  findAlumniByNameOrAlias(name: string): Promise<AlumniRecord[]>;
  getAlumniRecordByUserId(userId: number): Promise<AlumniRecord | undefined>;
  getUser(userId: number): Promise<User | undefined>;
};

export type EventMemberInput = {
  relatedMemberName?: string | null;
  sourceText?: string | null;
};

export type EventMemberResolution =
  | { kind: "blocked"; message: string }
  | {
      kind: "ready";
      user: User | undefined;
      alumni: AlumniRecord | undefined;
      memberDisplayName: string;
    };

export function normalizeMemberName(value: string | null | undefined): string {
  return value?.replace(/\s/g, "") ?? "";
}

function admissionYearFromSource(sourceText: string | null | undefined): string | undefined {
  if (!sourceText) return undefined;
  const labels = new Set(
    Array.from(sourceText.matchAll(/(?<!\d)(\d{4}|\d{2})\s*학번/g)).map(
      (match) => `${match[1].slice(-2)}학번`,
    ),
  );
  return labels.size === 1 ? Array.from(labels)[0] : undefined;
}

function blocked(
  message: string,
  missingFields: string[],
  evidence: Record<string, number | boolean>,
): Extract<EventMemberResolution, { kind: "blocked" }> {
  // Log the comparison results, never member names, source text or contact data.
  console.warn("Event member policy denied", { missingFields, ...evidence });
  return { kind: "blocked", message };
}

/** The session identifies the requester; only the server decides proxy authority. */
export async function resolveEventMember(
  input: EventMemberInput,
  requesterId: number,
  memberStorage: EventMemberStorage,
): Promise<EventMemberResolution> {
  const [requester, requesterAlumni] = await Promise.all([
    memberStorage.getUser(requesterId),
    memberStorage.getAlumniRecordByUserId(requesterId),
  ]);
  const requestedName = normalizeMemberName(input.relatedMemberName);
  const nameMatchesRequester =
    requestedName !== "" && requestedName === normalizeMemberName(requester?.name);
  const requestedAdmissionYear = admissionYearFromSource(input.sourceText);
  const admissionYearMatchesRequester =
    !requestedAdmissionYear ||
    requestedAdmissionYear === admissionYearLabel(requesterAlumni?.admissionDate);
  const isRequester = Boolean(requester) && nameMatchesRequester && admissionYearMatchesRequester;

  if (!requester?.isAdmin && !isRequester) {
    return blocked("일반회원은 본인 경조사만 등록할 수 있습니다", ["relatedMemberName"], {
      requesterFound: Boolean(requester),
      isAdmin: Boolean(requester?.isAdmin),
      nameMatchesRequester,
      admissionYearMatchesRequester,
    });
  }

  if (isRequester && requester) {
    return {
      kind: "ready",
      user: requester,
      alumni: requesterAlumni,
      memberDisplayName: requester.name,
    };
  }

  if (!requestedName || !requestedAdmissionYear) {
    return blocked(
      "대리 등록하려면 동문 이름과 학번이 필요합니다",
      requestedName ? ["admissionYear"] : ["relatedMemberName", "admissionYear"],
      {
        hasMemberName: Boolean(requestedName),
        hasSingleAdmissionYear: Boolean(requestedAdmissionYear),
      },
    );
  }

  const alumniMatches = (
    await memberStorage.findAlumniByNameOrAlias(input.relatedMemberName ?? "")
  ).filter((alumni) => admissionYearLabel(alumni.admissionDate) === requestedAdmissionYear);
  if (alumniMatches.length !== 1) {
    return blocked(
      "명부에서 이름과 학번이 정확히 일치하는 동문 한 명을 확인할 수 없습니다",
      ["relatedMemberName", "admissionYear"],
      { expectedMatches: 1, actualMatches: alumniMatches.length },
    );
  }

  const alumni = alumniMatches[0];
  const user = alumni.matchedUserId ? await memberStorage.getUser(alumni.matchedUserId) : undefined;
  return { kind: "ready", user, alumni, memberDisplayName: alumni.name };
}
