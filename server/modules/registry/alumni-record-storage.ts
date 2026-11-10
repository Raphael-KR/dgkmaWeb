import {
  users,
  alumniDatabase,
  alumniNameAliases,
  type User,
  type InsertUser,
  type AlumniRecord,
} from "@shared/schema";
import { eq, and, or, asc, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { uniqueAlumniMatch, normalizeNameForComparison } from "./alumni-match";
import {
  normalizePhoneForComparison,
  normalizedPhoneSql,
  lockRegistrationIdentities,
  assertKakaoOAuthGenerationActive,
  withPhoneRegistrationLock,
  PendingRegistrationConflictError,
} from "../identity/registration-support";

class AlumniClaimConflictError extends Error {}

// 회원 생성과 명부 연결은 같은 트랜잭션에서 확정한다.
export class AlumniRecordStorage {
  async findAlumniByName(name: string): Promise<AlumniRecord[]> {
    const normalizedName = normalizeNameForComparison(name);
    if (!normalizedName) return [];

    return await db
      .select()
      .from(alumniDatabase)
      .where(
        sql`regexp_replace(${alumniDatabase.name}, '[[:space:]]', '', 'g') = ${normalizedName}`,
      );
  }

  async findAlumniByNameOrAlias(name: string): Promise<AlumniRecord[]> {
    const normalizedName = normalizeNameForComparison(name);
    if (!normalizedName) return [];

    const matchedRows = await db
      .selectDistinct({ alumni: alumniDatabase })
      .from(alumniDatabase)
      .leftJoin(alumniNameAliases, eq(alumniNameAliases.alumniId, alumniDatabase.id))
      .where(
        or(
          sql`regexp_replace(${alumniDatabase.name}, '[[:space:]]', '', 'g') = ${normalizedName}`,
          eq(alumniNameAliases.normalizedName, normalizedName),
        ),
      )
      .orderBy(asc(alumniDatabase.id));
    const matches = matchedRows.map(({ alumni }) => alumni);
    if (matches.length === 0) return [];

    const preferredNames = await db
      .select({ alumniId: alumniNameAliases.alumniId, name: alumniNameAliases.name })
      .from(alumniNameAliases)
      .where(
        and(
          inArray(
            alumniNameAliases.alumniId,
            matches.map((alumni) => alumni.id),
          ),
          eq(alumniNameAliases.isPreferred, true),
        ),
      );
    const preferredByAlumniId = new Map(
      preferredNames.map((preferred) => [preferred.alumniId, preferred.name]),
    );

    return matches.map((alumni) => ({
      ...alumni,
      name: preferredByAlumniId.get(alumni.id) ?? alumni.name,
    }));
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

    try {
      return await db.transaction(async (tx) => {
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
            .select()
            .from(users)
            .where(eq(users.kakaoId, insertUser.kakaoId))
            .limit(1);
          if (registeredUser) return registeredUser;
        }

        const [emailConflict] = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = ${insertUser.email.trim().toLowerCase()}`)
          .limit(1);
        if (emailConflict) {
          throw new PendingRegistrationConflictError("email_conflict");
        }

        return withPhoneRegistrationLock(tx, insertUser.phoneNumber ?? "", async (lockedPhone) => {
          const matches = await tx
            .select()
            .from(alumniDatabase)
            .where(
              and(
                sql`regexp_replace(${alumniDatabase.name}, '[[:space:]]', '', 'g') = ${normalizedName}`,
                sql`${normalizedPhoneSql(alumniDatabase.mobile)} = ${lockedPhone}`,
              ),
            )
            .orderBy(asc(alumniDatabase.id))
            .limit(2);
          const alumni = uniqueAlumniMatch(matches);
          if (!alumni || alumni.matchedUserId !== null) return undefined;

          const [user] = await tx.insert(users).values(insertUser).returning();
          const [claimed] = await tx
            .update(alumniDatabase)
            .set({ isMatched: true, matchedUserId: user.id })
            .where(and(eq(alumniDatabase.id, alumni.id), isNull(alumniDatabase.matchedUserId)))
            .returning();
          if (!claimed) throw new AlumniClaimConflictError();
          return user;
        });
      });
    } catch (error) {
      if (error instanceof AlumniClaimConflictError) return undefined;
      throw error;
    }
  }

  async getAlumniRecordByUserId(userId: number): Promise<AlumniRecord | undefined> {
    const alumni = await db
      .select()
      .from(alumniDatabase)
      .where(eq(alumniDatabase.matchedUserId, userId))
      .orderBy(asc(alumniDatabase.id))
      .limit(2);
    return uniqueAlumniMatch(alumni);
  }

  // 휴대전화번호로 동문 찾기 (고유키)
  async findAlumniByMobile(mobile: string): Promise<AlumniRecord | undefined> {
    if (!mobile || mobile.trim() === "") {
      return undefined;
    }

    const [alumni] = await db
      .select()
      .from(alumniDatabase)
      .where(eq(alumniDatabase.mobile, mobile.trim()));
    return alumni || undefined;
  }
}
