import {
  users, alumniDatabase, alumniNameAliases, pendingRegistrations,
  type User, type InsertUser, type AlumniRecord,
  type PendingRegistration, type PendingRegistrationUserData,
  PENDING_REGISTRATION_CONFLICT_REASONS,
} from "@shared/schema";
import type { AlumniSyncReport } from "@shared/alumni-sync";
import { db } from "../../db";
import { eq, desc, and, like, or, asc, count, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { googleSheetsService } from "../../integrations/google-sheets";
import { uniqueAlumniMatch } from "./alumni-match";
import { planAlumniSync } from "./alumni-sync-plan";
import type {
  RegistryStorageContract, DirectoryAlumni, DirectoryResult,
  PendingRegistrationReviewInput, CreateOrRefreshPendingRegistrationResult,
} from "./storage-contract";
export type {
  DirectoryAlumni, DirectoryResult,
  PendingRegistrationReviewInput, CreateOrRefreshPendingRegistrationResult,
} from "./storage-contract";
import {
  normalizePhoneForComparison, normalizedPhoneSql, lockRegistrationIdentities,
  assertKakaoOAuthGenerationActive, markKakaoIdentityTerminated, removeLocalUsers,
  withPhoneRegistrationLock, PendingRegistrationConflictError,
} from "../identity/registration-support";
export {
  normalizePhoneForComparison, PhoneRegistrationConflictError, PendingRegistrationConflictError,
} from "../identity/registration-support";

// 명부 목록 반환 상한. 현재 전체 동문이 약 3,400명이므로 단일 기수/지역 범위는 물론
// 관리자 전체 열람도 한 번에 담을 수 있는 여유값. (통계 수치는 별도 count 로 정확히 산출)
const DIRECTORY_LIST_LIMIT = 5000;

function normalizeNameForComparison(name: string): string {
  return name.replace(/\s/g, "");
}

class AlumniClaimConflictError extends Error {}

export const ALUMNI_SYNC_ADVISORY_LOCK_KEY = "dgkma:alumni-sync:v1";

export class AlumniSyncFingerprintMismatchError extends Error {
  constructor() {
    super("The alumni source fingerprint does not match the preview.");
    this.name = "AlumniSyncFingerprintMismatchError";
  }
}

export class AlumniSyncBlockedError extends Error {
  constructor() {
    super("The alumni sync plan contains blocking issues.");
    this.name = "AlumniSyncBlockedError";
  }
}

export class AlumniSyncInProgressError extends Error {
  constructor() {
    super("Another alumni sync transaction holds the advisory lock.");
    this.name = "AlumniSyncInProgressError";
  }
}

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
    data.conflictReason !== undefined
    && (
      typeof data.conflictReason !== "string"
      || !PENDING_REGISTRATION_CONFLICT_REASONS.includes(data.conflictReason as any)
    )
  ) return undefined;
  const conflictReason = (data.conflictReason ?? "not_found") as PendingRegistrationUserData["conflictReason"];
  if (!kakaoId || !email || !name || !phoneNumber) return undefined;

  return {
    kakaoId,
    email,
    name,
    phoneNumber,
    profileImage: typeof data.profileImage === "string" ? data.profileImage : null,
    birthday: typeof data.birthday === "string" ? data.birthday : null,
    birthdayType: data.birthdayType === "SOLAR" || data.birthdayType === "LUNAR"
      ? data.birthdayType
      : null,
    isLeapMonth: typeof data.isLeapMonth === "boolean" ? data.isLeapMonth : null,
    conflictReason,
  };
}

// 회원 활동지역(시/도) → 동문 DB 주소 텍스트 매칭 패턴.
// 주소가 약칭/정식 혼재("충북 청주" vs "충청북도")이므로 가능한 표기를 함께 검사.
// '해외'는 주소 형식이 일정치 않아 매칭 불가(빈 배열).
const REGION_PATTERNS: Record<string, string[]> = {
  '서울특별시': ['서울'],
  '부산광역시': ['부산'],
  '대구광역시': ['대구'],
  '인천광역시': ['인천'],
  '광주광역시': ['광주'],
  '대전광역시': ['대전'],
  '울산광역시': ['울산'],
  '세종특별자치시': ['세종'],
  '경기도': ['경기'],
  '강원특별자치도': ['강원'],
  '충청북도': ['충청북', '충북'],
  '충청남도': ['충청남', '충남'],
  '전북특별자치도': ['전북', '전라북'],
  '전라남도': ['전라남', '전남'],
  '경상북도': ['경상북', '경북'],
  '경상남도': ['경상남', '경남'],
  '제주특별자치도': ['제주'],
  '해외': [],
};

export class RegistryStorage implements RegistryStorageContract {
  async findAlumniByName(name: string): Promise<AlumniRecord[]> {
    const normalizedName = normalizeNameForComparison(name);
    if (!normalizedName) return [];

    return await db.select().from(alumniDatabase)
      .where(sql`regexp_replace(${alumniDatabase.name}, '[[:space:]]', '', 'g') = ${normalizedName}`);
  }

  async findAlumniByNameOrAlias(name: string): Promise<AlumniRecord[]> {
    const normalizedName = normalizeNameForComparison(name);
    if (!normalizedName) return [];

    const matchedRows = await db
      .selectDistinct({ alumni: alumniDatabase })
      .from(alumniDatabase)
      .leftJoin(alumniNameAliases, eq(alumniNameAliases.alumniId, alumniDatabase.id))
      .where(or(
        sql`regexp_replace(${alumniDatabase.name}, '[[:space:]]', '', 'g') = ${normalizedName}`,
        eq(alumniNameAliases.normalizedName, normalizedName),
      ))
      .orderBy(asc(alumniDatabase.id));
    const matches = matchedRows.map(({ alumni }) => alumni);
    if (matches.length === 0) return [];

    const preferredNames = await db
      .select({ alumniId: alumniNameAliases.alumniId, name: alumniNameAliases.name })
      .from(alumniNameAliases)
      .where(and(
        inArray(alumniNameAliases.alumniId, matches.map((alumni) => alumni.id)),
        eq(alumniNameAliases.isPreferred, true),
      ));
    const preferredByAlumniId = new Map(
      preferredNames.map((preferred) => [preferred.alumniId, preferred.name]),
    );

    return matches.map((alumni) => ({
      ...alumni,
      name: preferredByAlumniId.get(alumni.id) ?? alumni.name,
    }));
  }

  async claimAlumniRecord(
    name: string,
    phoneNumber: string,
    userId: number,
  ): Promise<AlumniRecord | undefined> {
    const normalizedName = normalizeNameForComparison(name);
    const normalizedPhone = normalizePhoneForComparison(phoneNumber);
    if (!normalizedName || !normalizedPhone) return undefined;

    return await db.transaction(async (tx) => {
      const matches = await tx.select().from(alumniDatabase)
        .where(and(
          sql`regexp_replace(${alumniDatabase.name}, '[[:space:]]', '', 'g') = ${normalizedName}`,
          sql`${normalizedPhoneSql(alumniDatabase.mobile)} = ${normalizedPhone}`,
        ))
        .orderBy(asc(alumniDatabase.id))
        .limit(2);
      const alumni = uniqueAlumniMatch(matches);
      if (!alumni || alumni.matchedUserId !== null) return undefined;

      const [claimed] = await tx.update(alumniDatabase)
        .set({ isMatched: true, matchedUserId: userId })
        .where(and(
          eq(alumniDatabase.id, alumni.id),
          isNull(alumniDatabase.matchedUserId),
        ))
        .returning();
      return claimed || undefined;
    });
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
    if (
      !normalizedName
      || !normalizedPhone
      || normalizedStoredPhone !== normalizedPhone
    ) return undefined;

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
          const [registeredUser] = await tx.select().from(users)
            .where(eq(users.kakaoId, insertUser.kakaoId))
            .limit(1);
          if (registeredUser) return registeredUser;
        }

        const [emailConflict] = await tx.select({ id: users.id }).from(users)
          .where(sql`lower(${users.email}) = ${insertUser.email.trim().toLowerCase()}`)
          .limit(1);
        if (emailConflict) {
          throw new PendingRegistrationConflictError("email_conflict");
        }

        return withPhoneRegistrationLock(tx, insertUser.phoneNumber ?? "", async (lockedPhone) => {
          const matches = await tx.select().from(alumniDatabase)
            .where(and(
              sql`regexp_replace(${alumniDatabase.name}, '[[:space:]]', '', 'g') = ${normalizedName}`,
              sql`${normalizedPhoneSql(alumniDatabase.mobile)} = ${lockedPhone}`,
            ))
            .orderBy(asc(alumniDatabase.id))
            .limit(2);
          const alumni = uniqueAlumniMatch(matches);
          if (!alumni || alumni.matchedUserId !== null) return undefined;

          const [user] = await tx.insert(users).values(insertUser).returning();
          const [claimed] = await tx.update(alumniDatabase)
            .set({ isMatched: true, matchedUserId: user.id })
            .where(and(
              eq(alumniDatabase.id, alumni.id),
              isNull(alumniDatabase.matchedUserId),
            ))
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
    const alumni = await db.select().from(alumniDatabase)
      .where(eq(alumniDatabase.matchedUserId, userId))
      .orderBy(asc(alumniDatabase.id))
      .limit(2);
    return uniqueAlumniMatch(alumni);
  }

  async findAlumniByNameAndGeneration(name: string, generation: string): Promise<any | undefined> {
    // 로컬 데이터베이스에서만 검색 (Google Sheets 중복 체크는 여기서 하지 않음)
    const [alumni] = await db.select().from(alumniDatabase)
      .where(and(eq(alumniDatabase.name, name), eq(alumniDatabase.generation, generation)));
    return alumni || undefined;
  }

  async findAlumniByNameAndYear(name: string, year: number): Promise<AlumniRecord | undefined> {
    // 졸업년도를 기수로 변환하여 검색 (동국대 한의대는 보통 6년제)
    const generation = (year - 1994).toString(); // 대략적인 기수 계산
    return await this.findAlumniByNameAndGeneration(name, generation);
  }

  // 휴대전화번호로 동문 찾기 (고유키)
  async findAlumniByMobile(mobile: string): Promise<any | undefined> {
    if (!mobile || mobile.trim() === '') {
      return undefined;
    }
    
    const [alumni] = await db.select().from(alumniDatabase)
      .where(eq(alumniDatabase.mobile, mobile.trim()));
    return alumni || undefined;
  }

  async updateAlumniMatch(id: number, userId: number): Promise<AlumniRecord | undefined> {
    const [alumni] = await db.update(alumniDatabase)
      .set({ isMatched: true, matchedUserId: userId })
      .where(eq(alumniDatabase.id, id))
      .returning();
    return alumni || undefined;
  }

  // 회원 전용 동문 명부 — 본인 기수(동기회) 또는 지부(지역) 범위만 열람. 관리자는 전체.
  // q 가 있으면 그 범위 안에서 이름·기수로 추가 필터링. 노출 필드는 DirectoryAlumni 로 최소화.
  async getDirectoryAlumni(viewer: User, q?: string): Promise<DirectoryResult> {
    const isAdmin = !!viewer.isAdmin;

    // 1) 뷰어 기수 산출: 매칭된 동문 레코드 우선 → 없으면 휴대폰번호로 조회
    let generation: string | null = null;
    const [matched] = await db
      .select({ generation: alumniDatabase.generation })
      .from(alumniDatabase)
      .where(eq(alumniDatabase.matchedUserId, viewer.id))
      .limit(1);
    if (matched?.generation) {
      generation = matched.generation;
    } else if (viewer.phoneNumber) {
      const byMobile = await this.findAlumniByMobile(viewer.phoneNumber);
      if (byMobile?.generation) generation = byMobile.generation;
    }

    // 2) 뷰어 지부(지역) — users.activityRegion 기준
    const region = viewer.activityRegion ?? null;
    const regionPatterns = region ? (REGION_PATTERNS[region] ?? []) : [];

    // 열람 범위를 산출할 수 없으면(기수·지역 모두 없음, 관리자 아님) 빈 결과 + 안내 플래그
    const hasScope = isAdmin || !!generation || regionPatterns.length > 0;
    if (!hasScope) {
      return { alumni: [], total: 0, hasScope: false, scope: { generation, region } };
    }

    // 3) 열람 범위 조건 (관리자는 제한 없음 = 전체). 검색어와 무관한 "통계용" 조건.
    let scopeCond: SQL | undefined = undefined;
    if (!isAdmin) {
      const scopeOrs: SQL[] = [];
      if (generation) scopeOrs.push(eq(alumniDatabase.generation, generation));
      for (const p of regionPatterns) {
        scopeOrs.push(like(alumniDatabase.address, `%${p}%`));
      }
      scopeCond = scopeOrs.length === 1 ? scopeOrs[0] : or(...scopeOrs)!;
    }

    // 통계용 총원 — 검색어(q) 미적용, 열람 범위 전체 기준 (목록이 상한에 걸려도 정확).
    const [{ n: totalCount }] = await db
      .select({ n: count() })
      .from(alumniDatabase)
      .where(scopeCond);
    const total = Number(totalCount);

    // 4) 목록 조건 = 열람 범위 AND 검색어(이름 또는 기수)
    let listCond = scopeCond;
    const term = q?.trim();
    if (term) {
      const qCond = or(
        like(alumniDatabase.name, `%${term}%`),
        like(alumniDatabase.generation, `%${term}%`),
      )!;
      listCond = scopeCond ? and(scopeCond, qCond) : qCond;
    }

    const rows = await db
      .select({
        id: alumniDatabase.id,
        name: alumniDatabase.name,
        generation: alumniDatabase.generation,
        department: alumniDatabase.department,
        graduationDate: alumniDatabase.graduationDate,
        alumniPosition: alumniDatabase.alumniPosition,
        isMatched: alumniDatabase.isMatched,
      })
      .from(alumniDatabase)
      .where(listCond)
      .orderBy(asc(alumniDatabase.generation), asc(alumniDatabase.name))
      .limit(DIRECTORY_LIST_LIMIT);

    const alumni: DirectoryAlumni[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      generation: r.generation,
      department: r.department,
      graduationYear: r.graduationDate ? parseInt(r.graduationDate.substring(0, 4), 10) || null : null,
      position: r.alumniPosition ?? null,
      isMatched: !!r.isMatched,
    }));

    return { alumni, total, hasScope: true, scope: { generation, region } };
  }

  async getPendingRegistrations(): Promise<PendingRegistration[]> {
    return await db.select().from(pendingRegistrations)
      .where(eq(pendingRegistrations.status, "pending"))
      .orderBy(desc(pendingRegistrations.createdAt));
  }

  async createOrRefreshPendingRegistration(
    insertRegistration: PendingRegistrationReviewInput,
    oauthStartedAt: Date,
  ): Promise<CreateOrRefreshPendingRegistrationResult> {
    return db.transaction(async (tx) => {
      await lockRegistrationIdentities(
        tx,
        insertRegistration.kakaoId,
        insertRegistration.email,
      );
      await assertKakaoOAuthGenerationActive(tx, {
        kakaoId: insertRegistration.kakaoId,
        email: insertRegistration.email,
        startedAt: oauthStartedAt,
      });

      const [registeredUser] = await tx.select().from(users)
        .where(eq(users.kakaoId, insertRegistration.kakaoId))
        .limit(1);
      if (registeredUser) {
        return { kind: "registered", user: registeredUser };
      }

      const [emailConflict] = await tx.select({ id: users.id }).from(users)
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

      const matches = await tx.select().from(pendingRegistrations)
        .where(and(
          eq(pendingRegistrations.status, "pending"),
          or(
            eq(pendingRegistrations.kakaoId, reviewedRegistration.kakaoId),
            sql`lower(${pendingRegistrations.email}) = ${reviewedRegistration.email.trim().toLowerCase()}`,
          ),
        ))
        .orderBy(asc(pendingRegistrations.id))
        .for("update");

      const [existing, ...duplicates] = matches;
      if (existing) {
        if (duplicates.length > 0) {
          await tx.delete(pendingRegistrations)
            .where(inArray(pendingRegistrations.id, duplicates.map(({ id }) => id)));
        }
        const [refreshed] = await tx.update(pendingRegistrations)
          .set({
            ...reviewedRegistration,
            status: "pending",
            createdAt: new Date(),
          })
          .where(eq(pendingRegistrations.id, existing.id))
          .returning();
        return { kind: "pending", registration: refreshed };
      }

      const [created] = await tx.insert(pendingRegistrations)
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
          const [candidate] = await tx.select().from(pendingRegistrations)
            .where(and(
              eq(pendingRegistrations.id, id),
              eq(pendingRegistrations.status, "pending"),
            ));
          if (!candidate) return undefined;

          await lockRegistrationIdentities(tx, candidate.kakaoId, candidate.email);
          const [registration] = await tx.select().from(pendingRegistrations)
            .where(and(
              eq(pendingRegistrations.id, id),
              eq(pendingRegistrations.status, "pending"),
            ))
            .for("update");
          if (!registration) return undefined;
          if (
            registration.kakaoId !== candidate.kakaoId
            || registration.email.trim().toLowerCase()
              !== candidate.email.trim().toLowerCase()
          ) {
            throw new RetryPendingIdentityLockError();
          }

          await beforeDelete(registration);
          await markKakaoIdentityTerminated(
            tx,
            registration.kakaoId,
            registration.email,
          );

          const matchingUsers = await tx.select({ id: users.id }).from(users)
            .where(eq(users.kakaoId, registration.kakaoId));
          await removeLocalUsers(
            tx,
            matchingUsers.map(({ id: userId }) => userId),
            () => tx.delete(pendingRegistrations).where(or(
              eq(pendingRegistrations.kakaoId, registration.kakaoId),
              sql`lower(${pendingRegistrations.email}) = ${registration.email.trim().toLowerCase()}`,
            )),
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

  async updatePendingRegistrationStatus(id: number, status: string): Promise<PendingRegistration | undefined> {
    return db.transaction(async (tx) => {
      if (status === "approved") {
        const [candidate] = await tx.select().from(pendingRegistrations)
          .where(and(
            eq(pendingRegistrations.id, id),
            eq(pendingRegistrations.status, "pending"),
          ));
        if (!candidate) return undefined;
        const candidateData = parsePendingUserData(candidate);
        if (!candidateData) throw new PendingRegistrationConflictError();
        await lockRegistrationIdentities(tx, candidateData.kakaoId, candidateData.email);
      }

      const [registration] = await tx.select().from(pendingRegistrations)
        .where(and(
          eq(pendingRegistrations.id, id),
          eq(pendingRegistrations.status, "pending"),
        ))
        .for("update");
      if (!registration) return undefined;

      if (status !== "approved") {
        const [updated] = await tx.update(pendingRegistrations)
          .set({ status })
          .where(eq(pendingRegistrations.id, id))
          .returning();
        return updated || undefined;
      }

      const userData = parsePendingUserData(registration);
      if (!userData) throw new PendingRegistrationConflictError();

      return withPhoneRegistrationLock(tx, userData.phoneNumber, async (normalizedPhone) => {
        const [identityConflict] = await tx.select({ id: users.id }).from(users)
          .where(or(
            eq(users.kakaoId, userData.kakaoId),
            sql`lower(${users.email}) = ${userData.email.trim().toLowerCase()}`,
          ))
          .limit(1);
        if (identityConflict) throw new PendingRegistrationConflictError();

        const normalizedName = normalizeNameForComparison(userData.name);
        const alumniMatches = await tx.select().from(alumniDatabase)
          .where(and(
            sql`regexp_replace(${alumniDatabase.name}, '[[:space:]]', '', 'g') = ${normalizedName}`,
            sql`${normalizedPhoneSql(alumniDatabase.mobile)} = ${normalizedPhone}`,
          ))
          .orderBy(asc(alumniDatabase.id))
          .limit(2);
        const alumni = uniqueAlumniMatch(alumniMatches);
        if (!alumni || alumni.matchedUserId !== null) {
          throw new PendingRegistrationConflictError();
        }

        const [user] = await tx.insert(users).values({
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
        }).returning();
        const [claimed] = await tx.update(alumniDatabase)
          .set({ isMatched: true, matchedUserId: user.id })
          .where(and(
            eq(alumniDatabase.id, alumni.id),
            isNull(alumniDatabase.matchedUserId),
          ))
          .returning();
        if (!claimed) throw new PendingRegistrationConflictError();

        const [updated] = await tx.update(pendingRegistrations)
          .set({ status })
          .where(eq(pendingRegistrations.id, id))
          .returning();
        return updated || undefined;
      });
    });
  }

  async previewAlumniSync(): Promise<AlumniSyncReport> {
    const snapshot = await googleSheetsService.fetchAlumniSnapshot();
    const databaseRecords = await db.select().from(alumniDatabase);
    return planAlumniSync(snapshot, databaseRecords).report;
  }

  async applyAlumniSync(fingerprint: string): Promise<AlumniSyncReport> {
    return db.transaction(async (tx) => {
      const lockResult = await tx.execute<{ locked: boolean }>(sql`
        select pg_try_advisory_xact_lock(
          hashtextextended(${ALUMNI_SYNC_ADVISORY_LOCK_KEY}, 0)
        ) as locked
      `);
      if (lockResult.rows[0]?.locked !== true) {
        throw new AlumniSyncInProgressError();
      }

      const snapshot = await googleSheetsService.fetchAlumniSnapshot();
      const databaseRecords = await tx.select().from(alumniDatabase);
      const plan = planAlumniSync(snapshot, databaseRecords);
      if (plan.report.blocked) throw new AlumniSyncBlockedError();
      if (plan.report.sourceFingerprint !== fingerprint) {
        throw new AlumniSyncFingerprintMismatchError();
      }

      for (const change of plan.changes) {
        if (change.kind === "insert") {
          await tx.insert(alumniDatabase).values({
            ...change.source,
            isMatched: false,
            matchedUserId: null,
          });
          continue;
        }
        await tx.update(alumniDatabase)
          .set(change.source)
          .where(eq(alumniDatabase.id, change.databaseId));
      }

      return plan.report;
    });
  }

}
