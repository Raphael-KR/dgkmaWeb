import {
  alumniDatabase,
  users,
  PENDING_REGISTRATION_CONFLICT_REASONS,
  type AlumniRecord,
  type PendingRegistration,
  type PendingRegistrationConflictReason,
  type User,
} from "@shared/schema";
import type {
  AdminPendingRegistrationReviewDto,
  PendingRegistrationReviewStatus,
} from "@shared/contracts";
import { inArray, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { normalizePhoneForComparison, normalizedPhoneSql } from "../identity/registration-support";
import { normalizeNameForComparison } from "./alumni-match";
import { toAdminPendingRegistrationDto } from "./admin-pending-registration";
import { parsePendingUserData } from "./pending-registration-data";

type ReviewAlumni = Pick<
  AlumniRecord,
  | "id"
  | "name"
  | "department"
  | "generation"
  | "admissionDate"
  | "graduationDate"
  | "address"
  | "mobile"
  | "phone"
  | "group"
  | "status"
  | "alumniPosition"
  | "memo"
  | "matchedUserId"
> & { normalizedName: string };
type ReviewAccount = Pick<User, "id" | "isVerified" | "kakaoId" | "email" | "phoneNumber" | "name">;

function getReviewApplicant(registration: PendingRegistration) {
  const raw = registration.userData;
  const saved: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    name: typeof saved.name === "string" ? saved.name : registration.name,
    phoneNumber: typeof saved.phoneNumber === "string" ? saved.phoneNumber : null,
    reason: saved.conflictReason,
  };
}

export function createPendingRegistrationReview(
  registration: PendingRegistration,
  alumni: readonly ReviewAlumni[],
  accounts: readonly ReviewAccount[],
  checkedAt: string,
  recordType: "registration" | "member" = "registration",
): AdminPendingRegistrationReviewDto {
  const data = parsePendingUserData(registration);
  const applicant = getReviewApplicant(registration);
  const phone = normalizePhoneForComparison(applicant.phoneNumber ?? "");
  const name = normalizeNameForComparison(applicant.name);
  const complete = !!data && !!phone;
  const member = accounts.find(
    (account) =>
      account.kakaoId === registration.kakaoId && (!account.isVerified || recordType === "member"),
  );
  const otherAccounts = accounts.filter((account) => account.id !== member?.id);
  const candidates = alumni
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      department: candidate.department,
      generation: candidate.generation,
      admissionDate: candidate.admissionDate,
      graduationDate: candidate.graduationDate,
      address: candidate.address,
      mobile: candidate.mobile,
      phone: candidate.phone,
      group: candidate.group,
      status: candidate.status,
      alumniPosition: candidate.alumniPosition,
      memo: candidate.memo,
      nameMatches: !!name && candidate.normalizedName === name,
      phoneMatches: !!phone && normalizePhoneForComparison(candidate.mobile ?? "") === phone,
      isLinked: candidate.matchedUserId !== null,
    }))
    .filter((candidate) => candidate.nameMatches || candidate.phoneMatches)
    .sort(
      (a, b) =>
        Number(b.nameMatches) +
          Number(b.phoneMatches) -
          Number(a.nameMatches) -
          Number(a.phoneMatches) || a.id - b.id,
    );
  const exact = candidates.filter((candidate) => candidate.nameMatches && candidate.phoneMatches);
  const accountConflicts: AdminPendingRegistrationReviewDto["review"]["accountConflicts"] = [];
  if (complete) {
    if (
      member &&
      (member.email.trim().toLowerCase() !== data.email.trim().toLowerCase() ||
        normalizePhoneForComparison(member.phoneNumber ?? "") !== phone ||
        normalizeNameForComparison(member.name) !== name)
    )
      accountConflicts.push("kakao");
    if (otherAccounts.some((account) => account.kakaoId === data.kakaoId))
      accountConflicts.push("kakao");
    if (
      otherAccounts.some(
        (account) => account.email.toLowerCase() === data.email.trim().toLowerCase(),
      )
    )
      accountConflicts.push("email");
    if (
      otherAccounts.some(
        (account) => normalizePhoneForComparison(account.phoneNumber ?? "") === phone,
      )
    )
      accountConflicts.push("phone");
  }
  let status: PendingRegistrationReviewStatus = "ready";
  if (!complete) status = "missing_data";
  else if (accountConflicts.length) status = "account_conflict";
  else if (exact.length === 0) status = "no_match";
  else if (exact.length > 1) status = "multiple_matches";
  else if (
    exact[0].isLinked &&
    alumni.find((candidate) => candidate.id === exact[0].id)?.matchedUserId !== member?.id
  )
    status = "already_linked";
  else if (
    member &&
    alumni.some(
      (candidate) => candidate.matchedUserId === member.id && candidate.id !== exact[0].id,
    )
  )
    status = "already_linked";
  const reason = applicant.reason;

  return {
    ...toAdminPendingRegistrationDto(registration),
    recordType,
    memberId: recordType === "member" ? registration.id : (member?.id ?? null),
    review: {
      checkedAt,
      applicantName: applicant.name,
      phoneNumber: applicant.phoneNumber,
      reasonAtApplication:
        recordType === "registration" &&
        typeof reason === "string" &&
        PENDING_REGISTRATION_CONFLICT_REASONS.some((value) => value === reason)
          ? (reason as PendingRegistrationConflictReason)
          : null,
      status,
      accountConflicts,
      exactMatchCount: exact.length,
      candidateCount: candidates.length,
      candidates: candidates.slice(0, 5),
    },
  };
}

export async function getPendingRegistrationReviews(
  registrations: PendingRegistration[],
  recordType: "registration" | "member" = "registration",
): Promise<AdminPendingRegistrationReviewDto[]> {
  const inputs = registrations.flatMap((registration) => {
    const data = parsePendingUserData(registration);
    return data && normalizePhoneForComparison(data.phoneNumber) ? [data] : [];
  });
  const applicants = registrations.map(getReviewApplicant);
  const names = Array.from(
    new Set(applicants.map((data) => normalizeNameForComparison(data.name)).filter(Boolean)),
  );
  const phones = Array.from(
    new Set(
      applicants.map((data) => normalizePhoneForComparison(data.phoneNumber ?? "")).filter(Boolean),
    ),
  );
  let alumni: ReviewAlumni[] = [];
  let accounts: ReviewAccount[] = [];
  if (names.length || phones.length) {
    const emails = Array.from(new Set(inputs.map((data) => data.email.trim().toLowerCase())));
    const kakaoIds = Array.from(new Set(inputs.map((data) => data.kakaoId)));
    // 승인 SQL과 같은 이름 정규화 값을 후보 조회와 일치 판정에 사용한다.
    const normalizedName = sql<string>`regexp_replace(${alumniDatabase.name}, '[[:space:]]', '', 'g')`;
    [alumni, accounts] = await Promise.all([
      db
        .select({
          id: alumniDatabase.id,
          name: alumniDatabase.name,
          department: alumniDatabase.department,
          mobile: alumniDatabase.mobile,
          generation: alumniDatabase.generation,
          admissionDate: alumniDatabase.admissionDate,
          graduationDate: alumniDatabase.graduationDate,
          address: alumniDatabase.address,
          phone: alumniDatabase.phone,
          group: alumniDatabase.group,
          status: alumniDatabase.status,
          alumniPosition: alumniDatabase.alumniPosition,
          memo: alumniDatabase.memo,
          matchedUserId: alumniDatabase.matchedUserId,
          normalizedName,
        })
        .from(alumniDatabase)
        .where(
          or(
            names.length ? inArray(normalizedName, names) : undefined,
            phones.length ? inArray(normalizedPhoneSql(alumniDatabase.mobile), phones) : undefined,
          ),
        ),
      inputs.length
        ? db
            .select({
              id: users.id,
              name: users.name,
              isVerified: users.isVerified,
              kakaoId: users.kakaoId,
              email: users.email,
              phoneNumber: users.phoneNumber,
            })
            .from(users)
            .where(
              or(
                inArray(users.kakaoId, kakaoIds),
                inArray(sql`lower(${users.email})`, emails),
                inArray(normalizedPhoneSql(users.phoneNumber), phones),
              ),
            )
        : Promise.resolve([]),
    ]);
  }
  const checkedAt = new Date().toISOString();
  return registrations.map((registration) =>
    createPendingRegistrationReview(registration, alumni, accounts, checkedAt, recordType),
  );
}
