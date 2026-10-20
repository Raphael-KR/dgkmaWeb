import { users, pendingRegistrations, type User, type InsertUser } from "@shared/schema";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  normalizePhoneForComparison,
  normalizedPhoneSql,
  lockRegistrationIdentities,
  withPhoneRegistrationLock,
  assertKakaoOAuthGenerationActive,
  markKakaoIdentityTerminated,
  removeLocalUsers,
} from "./registration-support";
import { KakaoOAuthTerminatedError, type KakaoOAuthGeneration } from "./kakao-identity";
import type { IdentityStorageContract } from "./storage-contract";

export class IdentityStorage implements IdentityStorageContract {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users)
      .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`);
    return user || undefined;
  }

  async getUserByKakaoId(kakaoId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.kakaoId, kakaoId));
    return user || undefined;
  }

  async getUserByNormalizedPhone(phoneNumber: string): Promise<User | undefined> {
    const normalizedPhone = normalizePhoneForComparison(phoneNumber);
    if (!normalizedPhone) return undefined;

    const [user] = await db.select().from(users)
      .where(sql`${normalizedPhoneSql(users.phoneNumber)} = ${normalizedPhone}`)
      .limit(1);
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return db.transaction(async (tx) => {
      await lockRegistrationIdentities(tx, insertUser.kakaoId ?? "", insertUser.email);
      return withPhoneRegistrationLock(
        tx,
        insertUser.phoneNumber ?? "",
        async () => {
          const [user] = await tx.insert(users).values(insertUser).returning();
          return user;
        },
      );
    });
  }

  async updateUser(
    id: number,
    updateData: Partial<InsertUser>,
    oauthGeneration?: KakaoOAuthGeneration,
  ): Promise<User | undefined> {
    if (oauthGeneration) {
      return db.transaction(async (tx) => {
        await lockRegistrationIdentities(tx, oauthGeneration.kakaoId, oauthGeneration.email);
        await assertKakaoOAuthGenerationActive(tx, oauthGeneration);
        const [currentUser] = await tx.select().from(users)
          .where(and(eq(users.id, id), eq(users.kakaoId, oauthGeneration.kakaoId)))
          .limit(1);
        if (!currentUser) throw new KakaoOAuthTerminatedError();
        const [updatedUser] = await tx.update(users)
          .set({ ...updateData, updatedAt: new Date() })
          .where(eq(users.id, id))
          .returning();
        return updatedUser || undefined;
      });
    }

    const [user] = await db.update(users)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async finalizeKakaoLogin(
    userId: number,
    generation: KakaoOAuthGeneration,
    saveSession: () => Promise<void>,
  ): Promise<User> {
    return db.transaction(async (tx) => {
      await lockRegistrationIdentities(tx, generation.kakaoId, generation.email);
      await assertKakaoOAuthGenerationActive(tx, generation);
      const [user] = await tx.select().from(users)
        .where(and(eq(users.id, userId), eq(users.kakaoId, generation.kakaoId)))
        .limit(1);
      if (!user) throw new KakaoOAuthTerminatedError();
      await saveSession();
      return user;
    });
  }

  async deleteUserAccount(
    user: Pick<User, "id" | "kakaoId" | "email">,
    beforeDelete: (user: User) => Promise<void> = async () => {},
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await lockRegistrationIdentities(tx, user.kakaoId ?? "", user.email);
      const [lockedUser] = await tx.select().from(users)
        .where(eq(users.id, user.id))
        .for("update");
      if (!lockedUser) return;

      await beforeDelete(lockedUser);
      if (lockedUser.kakaoId) {
        await markKakaoIdentityTerminated(tx, lockedUser.kakaoId, lockedUser.email);
      }
      await removeLocalUsers(tx, [lockedUser.id], () =>
        tx.delete(pendingRegistrations).where(or(
          lockedUser.kakaoId
            ? eq(pendingRegistrations.kakaoId, lockedUser.kakaoId)
            : undefined,
          sql`lower(${pendingRegistrations.email}) = ${lockedUser.email.trim().toLowerCase()}`,
        )),
      );
    });
  }
}
