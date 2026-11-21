import {
  accountUserColumns,
  users,
  type User,
  type InsertUser,
  type AlumniRecord,
} from "@shared/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { normalizeNameForComparison } from "./alumni-match";
import {
  normalizePhoneForComparison,
  lockRegistrationIdentities,
  assertKakaoOAuthGenerationActive,
  withPhoneRegistrationLock,
  PendingRegistrationConflictError,
} from "../identity/registration-support";

import {
  findRegistrationHold,
  InactiveAlumniError,
  RegistrationApprovalRequiredError,
} from "../identity/registration-approval";

import {
  inRoster,
  rosterColumns,
  preferredName,
  matchesRosterName,
  lockRegistrationMatch,
} from "./roster";

// 회원 생성과 명부 연결은 같은 트랜잭션에서 확정한다.
export class AlumniRecordStorage {
  async findAlumniByName(name: string): Promise<AlumniRecord[]> {
    const normalizedName = normalizeNameForComparison(name);
    if (!normalizedName) return [];

    return db
      .select(rosterColumns)
      .from(users)
      .where(and(inRoster, matchesRosterName(normalizedName)));
  }

  async findAlumniByNameOrAlias(name: string): Promise<AlumniRecord[]> {
    const normalizedName = normalizeNameForComparison(name);
    if (!normalizedName) return [];
    return db
      .select({ ...rosterColumns, name: preferredName })
      .from(users)
      .where(and(inRoster, matchesRosterName(normalizedName)));
  }

  async createUserWithAlumniClaim(
    insertUser: InsertUser,
    name: string,
    phoneNumber: string,
    oauthStartedAt?: Date,
  ): Promise<User | undefined> {
    const normalizedName = normalizeNameForComparison(name);
    const normalizedPhone = normalizePhoneForComparison(phoneNumber);
    const normalizedStoredPhone = normalizePhoneForComparison(insertUser.phoneNumber ?? "");
    if (!normalizedName || !normalizedPhone || normalizedStoredPhone !== normalizedPhone)
      return undefined;

    return db.transaction(async (tx) => {
      await lockRegistrationIdentities(tx, insertUser.kakaoId ?? "", insertUser.email);
      if (oauthStartedAt && insertUser.kakaoId) {
        await assertKakaoOAuthGenerationActive(tx, {
          kakaoId: insertUser.kakaoId,
          email: insertUser.email,
          startedAt: oauthStartedAt,
        });
      }

      if (insertUser.kakaoId) {
        const [registeredUser] = await tx
          .select(accountUserColumns)
          .from(users)
          .where(eq(users.kakaoId, insertUser.kakaoId))
          .limit(1);
        if (registeredUser) return registeredUser;
      }

      const hold = await findRegistrationHold(tx, insertUser.kakaoId ?? "", insertUser.email);
      if (hold)
        throw new RegistrationApprovalRequiredError(
          hold.status === "rejected" ? "rejected" : "pending",
        );

      const [emailConflict] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${insertUser.email.trim().toLowerCase()}`)
        .limit(1);
      if (emailConflict) {
        throw new PendingRegistrationConflictError("email_conflict");
      }

      return withPhoneRegistrationLock(tx, insertUser.phoneNumber ?? "", async (lockedPhone) => {
        const alumni = await lockRegistrationMatch(tx, normalizedName, lockedPhone);
        if (alumni?.status === "사망") throw new InactiveAlumniError();
        if (!alumni || alumni.hasAccount || alumni.status !== "미가입") return undefined;

        const [user] = await tx
          .update(users)
          .set({
            ...insertUser,
            alumniStatus: insertUser.isVerified ? "가입 완료" : "가입 대기",
            joinedAt: insertUser.isVerified ? sql`statement_timestamp()` : undefined,
            updatedAt: new Date(),
          })
          .where(and(eq(users.id, alumni.id), isNull(users.kakaoId), eq(users.isVerified, false)))
          .returning(accountUserColumns);
        return user;
      });
    });
  }

  async getAlumniRecordByUserId(userId: string): Promise<AlumniRecord | undefined> {
    const [record] = await db
      .select(rosterColumns)
      .from(users)
      .where(and(inRoster, eq(users.id, userId)));
    return record;
  }
}
