import {
  users,
  alumniDatabase,
  pendingRegistrations,
  type PendingRegistration,
  type PendingRegistrationUserData,
  PENDING_REGISTRATION_CONFLICT_REASONS,
} from "@shared/schema";
import { eq, desc, and, or, asc, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { uniqueAlumniMatch, normalizeNameForComparison } from "./alumni-match";
import type {
  PendingRegistrationReviewInput,
  CreateOrRefreshPendingRegistrationResult,
} from "./storage-contract";
import {
  normalizedPhoneSql,
  lockRegistrationIdentities,
  assertKakaoOAuthGenerationActive,
  markKakaoIdentityTerminated,
  removeLocalUsers,
  withPhoneRegistrationLock,
  PendingRegistrationConflictError,
} from "../identity/registration-support";

class RetryPendingIdentityLockError extends Error {}

function parsePendingUserData(
  registration: PendingRegistration,
): PendingRegistrationUserData | undefined {
  const raw = registration.userData as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const data = raw as Record<string, unknown>;
  const kakaoId = typeof data.kakaoId === "string" ? data.kakaoId : registration.kakaoId;
  const email = typeof data.email === "string" ? data.email : registration.email;
  const name = typeof data.name === "string" ? data.name : registration.name;
  const phoneNumber = typeof data.phoneNumber === "string" ? data.phoneNumber : "";
  if (
    data.conflictReason !== undefined &&
    (typeof data.conflictReason !== "string" ||
      !PENDING_REGISTRATION_CONFLICT_REASONS.some((reason) => reason === data.conflictReason))
  )
    return undefined;
  const conflictReason = (data.conflictReason ??
    "not_found") as PendingRegistrationUserData["conflictReason"];
  if (!kakaoId || !email || !name || !phoneNumber) return undefined;

  return {
    kakaoId,
    email,
    name,
    phoneNumber,
    profileImage: typeof data.profileImage === "string" ? data.profileImage : null,
    birthday: typeof data.birthday === "string" ? data.birthday : null,
    birthdayType:
      data.birthdayType === "SOLAR" || data.birthdayType === "LUNAR" ? data.birthdayType : null,
    isLeapMonth: typeof data.isLeapMonth === "boolean" ? data.isLeapMonth : null,
    conflictReason,
  };
}

// 신원 잠금, 카카오 연결 해제 확인과 로컬 정리는 각 심사 트랜잭션 안에 둔다.
export class PendingRegistrationStorage {
  async getPendingRegistrations(): Promise<PendingRegistration[]> {
    return await db
      .select()
      .from(pendingRegistrations)
      .where(eq(pendingRegistrations.status, "pending"))
      .orderBy(desc(pendingRegistrations.createdAt));
  }

  async createOrRefreshPendingRegistration(
    insertRegistration: PendingRegistrationReviewInput,
    oauthStartedAt: Date,
  ): Promise<CreateOrRefreshPendingRegistrationResult> {
    return db.transaction(async (tx) => {
      await lockRegistrationIdentities(tx, insertRegistration.kakaoId, insertRegistration.email);
      await assertKakaoOAuthGenerationActive(tx, {
        kakaoId: insertRegistration.kakaoId,
        email: insertRegistration.email,
        startedAt: oauthStartedAt,
      });

      const [registeredUser] = await tx
        .select()
        .from(users)
        .where(eq(users.kakaoId, insertRegistration.kakaoId))
        .limit(1);
      if (registeredUser) {
        return { kind: "registered", user: registeredUser };
      }

      const [emailConflict] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${insertRegistration.email.trim().toLowerCase()}`)
        .limit(1);
      const reviewedRegistration = emailConflict
        ? {
            ...insertRegistration,
            userData: {
              ...insertRegistration.userData,
              conflictReason: "email_conflict" as const,
            },
          }
        : insertRegistration;

      const matches = await tx
        .select()
        .from(pendingRegistrations)
        .where(
          and(
            eq(pendingRegistrations.status, "pending"),
            or(
              eq(pendingRegistrations.kakaoId, reviewedRegistration.kakaoId),
              sql`lower(${pendingRegistrations.email}) = ${reviewedRegistration.email.trim().toLowerCase()}`,
            ),
          ),
        )
        .orderBy(asc(pendingRegistrations.id))
        .for("update");

      const [existing, ...duplicates] = matches;
      if (existing) {
        if (duplicates.length > 0) {
          await tx.delete(pendingRegistrations).where(
            inArray(
              pendingRegistrations.id,
              duplicates.map(({ id }) => id),
            ),
          );
        }
        const [refreshed] = await tx
          .update(pendingRegistrations)
          .set({
            ...reviewedRegistration,
            status: "pending",
            createdAt: new Date(),
          })
          .where(eq(pendingRegistrations.id, existing.id))
          .returning();
        return { kind: "pending", registration: refreshed };
      }

      const [created] = await tx
        .insert(pendingRegistrations)
        .values({ ...reviewedRegistration, status: "pending" })
        .returning();
      return { kind: "pending", registration: created };
    });
  }

  async rejectPendingRegistration(
    id: number,
    beforeDelete: (registration: PendingRegistration) => Promise<void>,
  ): Promise<{ id: number } | undefined> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await db.transaction(async (tx) => {
          const [candidate] = await tx
            .select()
            .from(pendingRegistrations)
            .where(
              and(eq(pendingRegistrations.id, id), eq(pendingRegistrations.status, "pending")),
            );
          if (!candidate) return undefined;

          await lockRegistrationIdentities(tx, candidate.kakaoId, candidate.email);
          const [registration] = await tx
            .select()
            .from(pendingRegistrations)
            .where(and(eq(pendingRegistrations.id, id), eq(pendingRegistrations.status, "pending")))
            .for("update");
          if (!registration) return undefined;
          if (
            registration.kakaoId !== candidate.kakaoId ||
            registration.email.trim().toLowerCase() !== candidate.email.trim().toLowerCase()
          ) {
            throw new RetryPendingIdentityLockError();
          }

          await beforeDelete(registration);
          await markKakaoIdentityTerminated(tx, registration.kakaoId, registration.email);

          const matchingUsers = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.kakaoId, registration.kakaoId));
          await removeLocalUsers(
            tx,
            matchingUsers.map(({ id: userId }) => userId),
            () =>
              tx
                .delete(pendingRegistrations)
                .where(
                  or(
                    eq(pendingRegistrations.kakaoId, registration.kakaoId),
                    sql`lower(${pendingRegistrations.email}) = ${registration.email.trim().toLowerCase()}`,
                  ),
                ),
          );
          return { id: registration.id };
        });
      } catch (error) {
        if (error instanceof RetryPendingIdentityLockError && attempt < 2) continue;
        throw error;
      }
    }
    throw new RetryPendingIdentityLockError();
  }

  async approvePendingRegistration(id: number): Promise<PendingRegistration | undefined> {
    return db.transaction(async (tx) => {
      const [candidate] = await tx
        .select()
        .from(pendingRegistrations)
        .where(and(eq(pendingRegistrations.id, id), eq(pendingRegistrations.status, "pending")));
      if (!candidate) return undefined;
      const candidateData = parsePendingUserData(candidate);
      if (!candidateData) throw new PendingRegistrationConflictError();
      await lockRegistrationIdentities(tx, candidateData.kakaoId, candidateData.email);

      const [registration] = await tx
        .select()
        .from(pendingRegistrations)
        .where(and(eq(pendingRegistrations.id, id), eq(pendingRegistrations.status, "pending")))
        .for("update");
      if (!registration) return undefined;

      const userData = parsePendingUserData(registration);
      if (!userData) throw new PendingRegistrationConflictError();

      return withPhoneRegistrationLock(tx, userData.phoneNumber, async (normalizedPhone) => {
        const [identityConflict] = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            or(
              eq(users.kakaoId, userData.kakaoId),
              sql`lower(${users.email}) = ${userData.email.trim().toLowerCase()}`,
            ),
          )
          .limit(1);
        if (identityConflict) throw new PendingRegistrationConflictError();

        const normalizedName = normalizeNameForComparison(userData.name);
        const alumniMatches = await tx
          .select()
          .from(alumniDatabase)
          .where(
            and(
              sql`regexp_replace(${alumniDatabase.name}, '[[:space:]]', '', 'g') = ${normalizedName}`,
              sql`${normalizedPhoneSql(alumniDatabase.mobile)} = ${normalizedPhone}`,
            ),
          )
          .orderBy(asc(alumniDatabase.id))
          .limit(2);
        const alumni = uniqueAlumniMatch(alumniMatches);
        if (!alumni || alumni.matchedUserId !== null) {
          throw new PendingRegistrationConflictError();
        }

        const [user] = await tx
          .insert(users)
          .values({
            kakaoId: userData.kakaoId,
            email: userData.email,
            name: userData.name,
            profileImage: userData.profileImage,
            phoneNumber: userData.phoneNumber,
            birthday: userData.birthday,
            birthdayType: userData.birthdayType,
            isLeapMonth: userData.isLeapMonth,
            graduationYear: alumni.graduationDate
              ? parseInt(alumni.graduationDate.substring(0, 4), 10) || null
              : null,
            isVerified: true,
            kakaoSyncEnabled: true,
          })
          .returning();
        const [claimed] = await tx
          .update(alumniDatabase)
          .set({ isMatched: true, matchedUserId: user.id })
          .where(and(eq(alumniDatabase.id, alumni.id), isNull(alumniDatabase.matchedUserId)))
          .returning();
        if (!claimed) throw new PendingRegistrationConflictError();

        const [updated] = await tx
          .update(pendingRegistrations)
          .set({ status: "approved" })
          .where(eq(pendingRegistrations.id, id))
          .returning();
        return updated || undefined;
      });
    });
  }
}
