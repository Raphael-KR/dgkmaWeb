import { normalizePhoneForComparison } from "../../lib/phone-normalization";
import {
  accountUserColumns,
  users,
  posts,
  payments,
  comments,
  kakaoIdentityTerminations,
  type PendingRegistrationConflictReason,
} from "@shared/schema";
import { and, eq, gte, inArray, ne, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { db } from "../../db";
import {
  KakaoOAuthTerminatedError,
  hashKakaoEmailIdentity,
  hashKakaoIdentity,
  type KakaoOAuthGeneration,
} from "./kakao-identity";

export { normalizePhoneForComparison } from "../../lib/phone-normalization";

export class PhoneRegistrationConflictError extends Error {
  constructor() {
    super("A user with the same normalized phone number already exists.");
    this.name = "PhoneRegistrationConflictError";
  }
}

export class PendingRegistrationConflictError extends Error {
  constructor(public readonly conflictReason?: PendingRegistrationConflictReason) {
    super("The pending registration conflict is not resolved.");
    this.name = "PendingRegistrationConflictError";
  }
}

export function normalizedPhoneSql(phoneColumn: AnyColumn | SQL): SQL<string> {
  const digits = sql`regexp_replace(coalesce(${phoneColumn}, ''), '[^0-9]', '', 'g')`;
  return sql<string>`
    CASE
      WHEN ${digits} LIKE '82%'
      THEN regexp_replace(${digits}, '^82(0)?', '0')
      ELSE ${digits}
    END
  `;
}

type RegistrationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockRegistrationIdentities(
  tx: RegistrationTransaction,
  kakaoId: string,
  email: string,
): Promise<void> {
  const lockKeys = [
    kakaoId ? `kakao:${kakaoId}` : "",
    email ? `email:${email.trim().toLowerCase()}` : "",
  ]
    .filter(Boolean)
    .sort();

  for (const lockKey of lockKeys) {
    await tx.execute(sql`
      select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `);
  }
}

export async function assertKakaoOAuthGenerationActive(
  tx: RegistrationTransaction,
  generation: KakaoOAuthGeneration,
): Promise<void> {
  if (Number.isNaN(generation.startedAt.getTime())) {
    throw new KakaoOAuthTerminatedError();
  }
  const [termination] = await tx
    .select({
      identityHash: kakaoIdentityTerminations.identityHash,
    })
    .from(kakaoIdentityTerminations)
    .where(
      and(
        inArray(kakaoIdentityTerminations.identityHash, [
          hashKakaoIdentity(generation.kakaoId),
          hashKakaoEmailIdentity(generation.email),
        ]),
        gte(kakaoIdentityTerminations.terminatedAt, generation.startedAt),
      ),
    )
    .limit(1);
  if (termination) throw new KakaoOAuthTerminatedError();
}

export async function markKakaoIdentityTerminated(
  tx: RegistrationTransaction,
  kakaoId: string,
  email: string,
): Promise<void> {
  const identityHashes = [hashKakaoIdentity(kakaoId), hashKakaoEmailIdentity(email)];
  const terminatedAt = sql<Date>`date_trunc('milliseconds', clock_timestamp())`;
  await tx
    .insert(kakaoIdentityTerminations)
    .values(identityHashes.map((identityHash) => ({ identityHash, terminatedAt })))
    .onConflictDoUpdate({
      target: kakaoIdentityTerminations.identityHash,
      set: { terminatedAt },
    });
}

export async function withdrawLocalMember(
  tx: RegistrationTransaction,
  userId: string,
  deletePendingPersonalData: () => Promise<unknown>,
): Promise<void> {
  await tx.delete(posts).where(and(eq(posts.authorId, userId), eq(posts.isPublished, false)));
  await tx.update(posts).set({ authorId: null }).where(eq(posts.authorId, userId));
  await tx.update(comments).set({ authorId: null }).where(eq(comments.authorId, userId));
  await tx.update(payments).set({ userId: null }).where(eq(payments.userId, userId));
  await deletePendingPersonalData();

  await tx.execute(sql`delete from "session" where sess ->> 'userId' = ${userId}`);
  await tx
    .update(users)
    .set({
      alumniStatus: "동문회 탈퇴자",
      name: sql`coalesce(${users.alumniName}, '동문회 미가입자')`,
      email: null,
      kakaoId: null,
      joinedAt: null,
      phoneNumber: null,
      profileImage: null,
      birthday: null,
      birthdayType: null,
      isLeapMonth: null,
      activityRegion: null,
      affiliation: null,
      affiliationTitle: null,
      isAdmin: false,
      isVerified: false,
      kakaoSyncEnabled: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function withPhoneRegistrationLock<T>(
  tx: RegistrationTransaction,
  phoneNumber: string,
  register: (normalizedPhone: string) => Promise<T>,
  existingUserId?: string,
): Promise<T> {
  const normalizedPhone = normalizePhoneForComparison(phoneNumber);
  if (!normalizedPhone) {
    throw new Error("Phone number is required for member registration.");
  }

  await tx.execute(sql`
    select pg_advisory_xact_lock(hashtextextended(${normalizedPhone}, 0))
  `);

  const [existingUser] = await tx
    .select(accountUserColumns)
    .from(users)
    .where(
      and(
        sql`${normalizedPhoneSql(users.phoneNumber)} = ${normalizedPhone}`,
        existingUserId === undefined ? undefined : ne(users.id, existingUserId),
      ),
    )
    .limit(1);
  if (existingUser) throw new PhoneRegistrationConflictError();

  return register(normalizedPhone);
}
