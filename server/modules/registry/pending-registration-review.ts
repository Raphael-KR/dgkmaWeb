import {
  users,
  PENDING_REGISTRATION_CONFLICT_REASONS,
  type PendingRegistration,
  type PendingRegistrationConflictReason,
  type User,
} from "@shared/schema";
import type {
  AdminAlumniRecordDto,
  AdminPendingRegistrationReviewDto,
  PendingRegistrationReviewStatus,
} from "@shared/contracts";
import { and, inArray, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { normalizePhoneForComparison, normalizedPhoneSql } from "../identity/registration-support";
import { normalizeNameForComparison } from "./alumni-match";
import { toAdminPendingRegistrationDto } from "./admin-pending-registration";
import { parsePendingUserData } from "./pending-registration-data";
import { adminAlumniColumns } from "./admin-alumni-record";

import { inRoster, normalizedRosterName, normalizedAliases, hasAccount } from "./roster";

type ReviewAlumni = AdminAlumniRecordDto & {
  hasAccount: boolean;
  normalizedName: string;
  aliases: string[];
};
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
): AdminPendingRegistrationReviewDto {
  const data = parsePendingUserData(registration);
  const applicant = getReviewApplicant(registration);
  const phone = normalizePhoneForComparison(applicant.phoneNumber ?? "");
  const name = normalizeNameForComparison(applicant.name);
  const complete = !!data && !!phone;
  const member = accounts.find(
    (account) => account.kakaoId === registration.kakaoId && !account.isVerified,
  );
  const otherAccounts = accounts.filter((account) => account.id !== member?.id);
  const candidates = alumni
    .map(({ normalizedName, hasAccount, aliases, ...record }) => ({
      ...record,
      nameMatches: !!name && (normalizedName === name || aliases.includes(name)),
      phoneMatches: !!phone && normalizePhoneForComparison(record.mobile ?? "") === phone,
      isLinked: hasAccount,
    }))
    .filter((candidate) => candidate.nameMatches || candidate.phoneMatches)
    .sort(
      (a, b) =>
        Number(b.nameMatches) +
          Number(b.phoneMatches) -
          Number(a.nameMatches) -
          Number(a.phoneMatches) || a.id.localeCompare(b.id),
    );
  const exact = candidates.filter((candidate) => candidate.nameMatches && candidate.phoneMatches);
  const match = exact.length === 1 ? alumni.find((row) => row.id === exact[0].id) : undefined;
  const accountConflicts: AdminPendingRegistrationReviewDto["review"]["accountConflicts"] = [];
  if (complete) {
    if (
      member &&
      (member.email?.trim().toLowerCase() !== data.email.trim().toLowerCase() ||
        normalizePhoneForComparison(member.phoneNumber ?? "") !== phone ||
        normalizeNameForComparison(member.name) !== name)
    )
      accountConflicts.push("kakao");
    if (otherAccounts.some((account) => account.kakaoId === data.kakaoId))
      accountConflicts.push("kakao");
    if (
      otherAccounts.some(
        (account) => account.email?.toLowerCase() === data.email.trim().toLowerCase(),
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
  else if (!match || match.status === "사망") status = "no_match";
  else if ((member || match.hasAccount) && match.id !== member?.id) status = "already_linked";
  const reason = applicant.reason;

  return {
    ...toAdminPendingRegistrationDto(registration),
    recordType: "registration",
    memberId: member?.id ?? null,
    review: {
      checkedAt,
      applicantName: applicant.name,
      phoneNumber: applicant.phoneNumber,
      reasonAtApplication:
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
    [alumni, accounts] = await Promise.all([
      db
        .select({
          ...adminAlumniColumns,
          hasAccount,
          normalizedName: normalizedRosterName,
          aliases: normalizedAliases,
        })
        .from(users)
        .where(
          and(
            inRoster,
            or(
              names.length ? inArray(normalizedRosterName, names) : undefined,
              names.length
                ? sql`${normalizedAliases} && ARRAY[${sql.join(
                    names.map((name) => sql`${name}`),
                    sql`,`,
                  )}]::text[]`
                : undefined,
              phones.length ? inArray(normalizedPhoneSql(users.alumniMobile), phones) : undefined,
            ),
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
    createPendingRegistrationReview(registration, alumni, accounts, checkedAt),
  );
}
