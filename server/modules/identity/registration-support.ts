import {
  users, posts, payments, alumniDatabase, obituaries, comments, communityEvents,
  kakaoIdentityTerminations, type PendingRegistrationConflictReason,
} from "@shared/schema";
import { and, eq, gte, inArray, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { db } from "../../db";
import {
  KakaoOAuthTerminatedError,
  hashKakaoEmailIdentity,
  hashKakaoIdentity,
  type KakaoOAuthGeneration,
} from "./kakao-identity";

export function normalizePhoneForComparison(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  if (!digits.startsWith("82")) return digits;

  const domesticNumber = digits.slice(2);
  return domesticNumber.startsWith("0") ? domesticNumber : `0${domesticNumber}`;
}

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
  ].filter(Boolean).sort();

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
  const [termination] = await tx.select({
    identityHash: kakaoIdentityTerminations.identityHash,
  }).from(kakaoIdentityTerminations)
    .where(and(
      inArray(kakaoIdentityTerminations.identityHash, [
        hashKakaoIdentity(generation.kakaoId),
        hashKakaoEmailIdentity(generation.email),
      ]),
      gte(kakaoIdentityTerminations.terminatedAt, generation.startedAt),
    ))
    .limit(1);
  if (termination) throw new KakaoOAuthTerminatedError();
}

export async function markKakaoIdentityTerminated(
  tx: RegistrationTransaction,
  kakaoId: string,
  email: string,
): Promise<void> {
  const identityHashes = [
    hashKakaoIdentity(kakaoId),
    hashKakaoEmailIdentity(email),
  ];
  const terminatedAt = sql<Date>`date_trunc('milliseconds', clock_timestamp())`;
  await tx.insert(kakaoIdentityTerminations)
    .values(identityHashes.map((identityHash) => ({ identityHash, terminatedAt })))
    .onConflictDoUpdate({
      target: kakaoIdentityTerminations.identityHash,
      set: { terminatedAt },
    });
}

export async function removeLocalUsers(
  tx: RegistrationTransaction,
  userIds: number[],
  deletePendingPersonalData: () => Promise<unknown>,
): Promise<void> {
  if (userIds.length > 0) {
    const userCondition = inArray(users.id, userIds);
    await tx.delete(communityEvents).where(and(
      inArray(communityEvents.authorId, userIds),
      eq(communityEvents.status, "draft"),
    ));
    await tx.update(communityEvents)
      .set({ authorId: null })
      .where(inArray(communityEvents.authorId, userIds));
    await tx.update(posts)
      .set({ authorId: null })
      .where(inArray(posts.authorId, userIds));
    await tx.update(comments)
      .set({ authorId: null })
      .where(inArray(comments.authorId, userIds));
    await tx.update(obituaries)
      .set({ authorId: null })
      .where(inArray(obituaries.authorId, userIds));
    await tx.update(payments)
      .set({ userId: null })
      .where(inArray(payments.userId, userIds));
    await tx.update(alumniDatabase)
      .set({ isMatched: false, matchedUserId: null })
      .where(inArray(alumniDatabase.matchedUserId, userIds));

    await deletePendingPersonalData();

    for (const userId of userIds) {
      await tx.execute(sql`
        delete from "session"
        where sess ->> 'userId' = ${String(userId)}
      `);
    }
    await tx.delete(users).where(userCondition);
    return;
  }

  await deletePendingPersonalData();
}

export async function withPhoneRegistrationLock<T>(
  tx: RegistrationTransaction,
  phoneNumber: string,
  register: (normalizedPhone: string) => Promise<T>,
): Promise<T> {
  const normalizedPhone = normalizePhoneForComparison(phoneNumber);
  if (!normalizedPhone) {
    throw new Error("Phone number is required for member registration.");
  }

  await tx.execute(sql`
    select pg_advisory_xact_lock(hashtextextended(${normalizedPhone}, 0))
  `);

  const [existingUser] = await tx.select().from(users)
    .where(sql`${normalizedPhoneSql(users.phoneNumber)} = ${normalizedPhone}`)
    .limit(1);
  if (existingUser) throw new PhoneRegistrationConflictError();

  return register(normalizedPhone);
}
