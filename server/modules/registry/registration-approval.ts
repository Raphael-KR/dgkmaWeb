import {
  accountUserColumns,
  users,
  pendingRegistrations,
  type PendingRegistration,
} from "@shared/schema";
import { and, eq, ne, or, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  withPhoneRegistrationLock,
  PendingRegistrationConflictError,
  normalizePhoneForComparison,
} from "../identity/registration-support";
import { normalizeNameForComparison } from "./alumni-match";
import { lockRegistrationMatch } from "./roster";
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
    .select(accountUserColumns)
    .from(users)
    .where(eq(users.kakaoId, data.kakaoId))
    .for("update");
  if (
    existing &&
    (existing.isVerified ||
      existing.email?.trim().toLowerCase() !== data.email.trim().toLowerCase() ||
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
      const alumni = await lockRegistrationMatch(
        tx,
        normalizeNameForComparison(data.name),
        normalizedPhone,
      );
      if (
        !alumni ||
        alumni.status === "사망" ||
        (existing ? alumni.id !== existing.id : alumni.hasAccount)
      )
        throw new PendingRegistrationConflictError();
      const [user] = existing
        ? await tx
            .update(users)
            .set({ alumniStatus: "가입 완료", isVerified: true, updatedAt: new Date() })
            .where(eq(users.id, existing.id))
            .returning(accountUserColumns)
        : await tx
            .update(users)
            .set({
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
              alumniStatus: "가입 완료",
              isVerified: true,
              joinedAt: sql`statement_timestamp()`,
              kakaoSyncEnabled: true,
              updatedAt: new Date(),
            })
            .where(and(eq(users.id, alumni.id), isNull(users.kakaoId), eq(users.isVerified, false)))
            .returning(accountUserColumns);
      if (!user) throw new PendingRegistrationConflictError();
      await tx
        .update(pendingRegistrations)
        .set({ status: "approved" })
        .where(eq(pendingRegistrations.kakaoId, data.kakaoId));
      return { ...registration, status: "approved" };
    },
    existing?.id,
  );
}
