import {
  users,
  alumniDatabase,
  pendingRegistrations,
  type PendingRegistration,
} from "@shared/schema";
import { and, eq, ne, or, asc, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  normalizedPhoneSql,
  withPhoneRegistrationLock,
  PendingRegistrationConflictError,
  normalizePhoneForComparison,
} from "../identity/registration-support";
import { uniqueAlumniMatch, normalizeNameForComparison } from "./alumni-match";
import { parsePendingUserData } from "./pending-registration-data";

type RegistrationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 호출자의 신원·신청 행 잠금과 트랜잭션 안에서 신규 승인과 재승인을 처리한다.
export async function approveRegistration(
  tx: RegistrationTransaction,
  registration: PendingRegistration,
): Promise<PendingRegistration> {
  const data = parsePendingUserData(registration);
  if (!data) throw new PendingRegistrationConflictError();
  const [existing] = await tx
    .select()
    .from(users)
    .where(eq(users.kakaoId, data.kakaoId))
    .for("update");
  if (
    existing &&
    (existing.isVerified ||
      existing.email.trim().toLowerCase() !== data.email.trim().toLowerCase() ||
      normalizeNameForComparison(existing.name) !== normalizeNameForComparison(data.name) ||
      normalizePhoneForComparison(existing.phoneNumber ?? "") !==
        normalizePhoneForComparison(data.phoneNumber))
  ) {
    throw new PendingRegistrationConflictError();
  }
  return withPhoneRegistrationLock(
    tx,
    data.phoneNumber,
    async (normalizedPhone) => {
      const [conflict] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            or(
              eq(users.kakaoId, data.kakaoId),
              sql`lower(${users.email}) = ${data.email.trim().toLowerCase()}`,
            ),
            existing ? ne(users.id, existing.id) : undefined,
          ),
        )
        .limit(1);
      if (conflict) throw new PendingRegistrationConflictError();
      const matches = await tx
        .select()
        .from(alumniDatabase)
        .where(
          and(
            sql`regexp_replace(${alumniDatabase.name}, '[[:space:]]', '', 'g') = ${normalizeNameForComparison(data.name)}`,
            sql`${normalizedPhoneSql(alumniDatabase.mobile)} = ${normalizedPhone}`,
          ),
        )
        .orderBy(asc(alumniDatabase.id))
        .limit(2);
      const alumni = uniqueAlumniMatch(matches);
      if (!alumni || (alumni.matchedUserId !== null && alumni.matchedUserId !== existing?.id))
        throw new PendingRegistrationConflictError();
      if (existing) {
        const links = await tx
          .select({ id: alumniDatabase.id })
          .from(alumniDatabase)
          .where(eq(alumniDatabase.matchedUserId, existing.id));
        if (links.some((link) => link.id !== alumni.id))
          throw new PendingRegistrationConflictError();
      }
      const [user] = existing
        ? await tx
            .update(users)
            .set({ isVerified: true, updatedAt: new Date() })
            .where(eq(users.id, existing.id))
            .returning()
        : await tx
            .insert(users)
            .values({
              kakaoId: data.kakaoId,
              email: data.email,
              name: data.name,
              phoneNumber: data.phoneNumber,
              profileImage: data.profileImage,
              birthday: data.birthday,
              birthdayType: data.birthdayType,
              isLeapMonth: data.isLeapMonth,
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
        .where(
          and(
            eq(alumniDatabase.id, alumni.id),
            or(
              isNull(alumniDatabase.matchedUserId),
              existing ? eq(alumniDatabase.matchedUserId, existing.id) : undefined,
            ),
          ),
        )
        .returning();
      if (!claimed) throw new PendingRegistrationConflictError();
      await tx
        .update(pendingRegistrations)
        .set({ status: "approved" })
        .where(eq(pendingRegistrations.kakaoId, data.kakaoId));
      return { ...registration, status: "approved" };
    },
    existing?.id,
  );
}
