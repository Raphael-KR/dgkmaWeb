import {
  accountUserColumns,
  users,
  pendingRegistrations,
  type User,
  type InsertUser,
} from "@shared/schema";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  normalizePhoneForComparison,
  normalizedPhoneSql,
  withPhoneRegistrationLock,
  PendingRegistrationConflictError,
  lockRegistrationIdentities,
  assertKakaoOAuthGenerationActive,
  markKakaoIdentityTerminated,
  withdrawLocalMember,
} from "./registration-support";
import { KakaoOAuthTerminatedError } from "./kakao-identity";
import { findRegistrationHold, RegistrationApprovalRequiredError } from "./registration-approval";
import { kakaoLoginUpdates, type KakaoMemberLogin } from "./kakao-login-updates";
import type { IdentityStorageContract } from "./storage-contract";

export class IdentityStorage implements IdentityStorageContract {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select(accountUserColumns).from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select(accountUserColumns)
      .from(users)
      .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`);
    return user || undefined;
  }

  async getUserByKakaoId(kakaoId: string): Promise<User | undefined> {
    const [user] = await db
      .select(accountUserColumns)
      .from(users)
      .where(eq(users.kakaoId, kakaoId));
    return user || undefined;
  }

  async getUserByNormalizedPhone(phoneNumber: string): Promise<User | undefined> {
    const normalizedPhone = normalizePhoneForComparison(phoneNumber);
    if (!normalizedPhone) return undefined;

    const [user] = await db
      .select(accountUserColumns)
      .from(users)
      .where(sql`${normalizedPhoneSql(users.phoneNumber)} = ${normalizedPhone}`)
      .limit(1);
    return user || undefined;
  }

  async updateUser(id: string, updateData: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.isVerified, true)))
      .returning(accountUserColumns);
    return user || undefined;
  }

  async finalizeKakaoLogin(
    userId: string,
    login: KakaoMemberLogin,
    saveSession: () => Promise<void>,
  ): Promise<User> {
    return db.transaction(async (tx) => {
      await lockRegistrationIdentities(tx, login.kakaoId, login.email);
      await assertKakaoOAuthGenerationActive(tx, login);
      const [user] = await tx
        .select(accountUserColumns)
        .from(users)
        .where(and(eq(users.id, userId), eq(users.kakaoId, login.kakaoId)))
        .for("update");
      if (!user) throw new KakaoOAuthTerminatedError();
      if (!user.isVerified) {
        const hold = await findRegistrationHold(tx, login.kakaoId);
        throw new RegistrationApprovalRequiredError(
          hold?.status === "rejected" ? "rejected" : "pending",
        );
      }
      const [otherAccount] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(ne(users.id, userId), sql`lower(${users.email}) = ${login.email.toLowerCase()}`))
        .limit(1);
      if (otherAccount) throw new PendingRegistrationConflictError("email_conflict");

      return withPhoneRegistrationLock(
        tx,
        login.phoneNumber,
        async () => {
          const updates = kakaoLoginUpdates(user, login);
          let result = user;
          if (Object.keys(updates).length) {
            [result] = await tx
              .update(users)
              .set({ ...updates, updatedAt: new Date() })
              .where(eq(users.id, userId))
              .returning(accountUserColumns);
          }
          await saveSession();
          return result;
        },
        userId,
      );
    });
  }

  async deleteUserAccount(
    user: Pick<User, "id" | "kakaoId" | "email">,
    beforeDelete: (user: User) => Promise<void> = async () => {},
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await lockRegistrationIdentities(tx, user.kakaoId ?? "", user.email ?? "");
      const [lockedUser] = await tx
        .select(accountUserColumns)
        .from(users)
        .where(eq(users.id, user.id))
        .for("update");
      if (!lockedUser || !lockedUser.kakaoId) return;
      if (
        !lockedUser.isVerified ||
        lockedUser.kakaoId !== user.kakaoId ||
        lockedUser.email !== user.email
      )
        throw new KakaoOAuthTerminatedError();

      await beforeDelete(lockedUser);
      if (lockedUser.kakaoId && lockedUser.email) {
        await markKakaoIdentityTerminated(tx, lockedUser.kakaoId, lockedUser.email);
      }
      await withdrawLocalMember(tx, lockedUser.id, () =>
        tx
          .delete(pendingRegistrations)
          .where(
            or(
              lockedUser.kakaoId ? eq(pendingRegistrations.kakaoId, lockedUser.kakaoId) : undefined,
              lockedUser.email
                ? sql`lower(${pendingRegistrations.email}) = ${lockedUser.email.trim().toLowerCase()}`
                : undefined,
            ),
          ),
      );
    });
  }
}
