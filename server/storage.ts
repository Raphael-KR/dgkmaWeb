import {
  users, posts, payments, alumniDatabase, pendingRegistrations, categories, obituaries, comments, communityEvents,
  type User, type InsertUser, type Post, type InsertPost,
  type Payment, type InsertPayment, type AlumniRecord, type InsertAlumniRecord,
  type PendingRegistration, type InsertPendingRegistration, type Category, type InsertCategory,
  type Obituary, type InsertObituary, type MembershipStatus, type Comment, ANNUAL_DUES,
  type CommunityEvent, type PendingRegistrationConflictReason, type PendingRegistrationUserData,
  PENDING_REGISTRATION_CONFLICT_REASONS,
} from "@shared/schema";
import type {
  CommunityEventDraftInput,
  CommunityEventPublishInput,
  CommunityEventType,
} from "@shared/community-events";
import { db } from "./db";
import { eq, desc, and, like, or, asc, count, inArray, isNull, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { googleSheetsService } from "./google-sheets";
import { getErrorType } from "./safe-logging";
import { koreaCalendarYear } from "./korea-date";
import { uniqueAlumniMatch } from "./alumni-match";
import {
  eventDraftAdvisoryLockId,
  getOrCreateEventDraft,
} from "./event-draft-creation";

// 동문 명부 노출 허용 필드 (개인정보 최소화 — 연락처·주소·메모 제외)
export type DirectoryAlumni = {
  id: number;
  name: string;
  generation: string;
  department: string;
  graduationYear: number | null;
  position: string | null;
  isMatched: boolean;
};

export type DirectoryResult = {
  alumni: DirectoryAlumni[];
  total: number; // 열람 범위 내 전체 동문 수 (검색어 q 미적용 — 통계용)
  hasScope: boolean; // 열람 범위(기수/지부)를 산출할 수 있는지 여부
  scope: { generation: string | null; region: string | null };
};

export type PendingRegistrationReviewInput = Omit<InsertPendingRegistration, "userData"> & {
  userData: PendingRegistrationUserData;
};

export type CreateOrRefreshPendingRegistrationResult =
  | { kind: "pending"; registration: PendingRegistration }
  | { kind: "registered"; user: User };

// 명부 목록 반환 상한. 현재 전체 동문이 약 3,400명이므로 단일 기수/지역 범위는 물론
// 관리자 전체 열람도 한 번에 담을 수 있는 여유값. (통계 수치는 별도 count 로 정확히 산출)
const DIRECTORY_LIST_LIMIT = 5000;

export function normalizePhoneForComparison(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  if (!digits.startsWith("82")) return digits;

  const domesticNumber = digits.slice(2);
  return domesticNumber.startsWith("0") ? domesticNumber : `0${domesticNumber}`;
}

function normalizeNameForComparison(name: string): string {
  return name.replace(/\s/g, "");
}

class AlumniClaimConflictError extends Error {}

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

function normalizedPhoneSql(phoneColumn: AnyColumn | SQL): SQL<string> {
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

async function lockRegistrationIdentities(
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

async function withPhoneRegistrationLock<T>(
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

// 댓글 + 작성자 표시 정보(이름). authorId 가 없는(탈퇴 등) 경우 author=null.
export type CommentWithAuthor = Comment & {
  author: { id: number; name: string } | null;
};

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByKakaoId(kakaoId: string): Promise<User | undefined>;
  getUserByNormalizedPhone(phoneNumber: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createUserWithAlumniClaim(
    user: InsertUser,
    name: string,
    phoneNumber: string,
  ): Promise<User | undefined>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUserAccount(user: Pick<User, "id" | "kakaoId" | "email">): Promise<void>;
  
  // Category methods
  getCategories(): Promise<Category[]>;
  getCategory(id: number): Promise<Category | undefined>;
  getCategoryByName(name: string): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: number, category: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: number): Promise<boolean>;
  
  // Post methods
  getPosts(categoryName?: string, limit?: number): Promise<(Post & { category: Category })[]>;
  getPost(id: number): Promise<(Post & { category: Category }) | undefined>;
  createPost(post: InsertPost): Promise<Post>;
  updatePost(id: number, post: Partial<InsertPost>): Promise<Post | undefined>;
  deletePost(id: number): Promise<boolean>;
  searchPosts(query: string): Promise<(Post & { category: Category })[]>;

  // Comment methods
  getCommentsByPost(postId: number): Promise<CommentWithAuthor[]>;
  getComment(id: number): Promise<Comment | undefined>;
  createComment(data: { postId: number; authorId: number; content: string }): Promise<Comment>;
  deleteComment(id: number): Promise<boolean>;

  // Payment methods
  getPaymentsByUser(userId: number): Promise<Payment[]>;
  getPayment(id: number): Promise<Payment | undefined>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  getMembershipStatus(userId: number): Promise<MembershipStatus>;
  
  // Alumni methods
  getAlumniRecordByUserId(userId: number): Promise<AlumniRecord | undefined>;
  findAlumniByName(name: string): Promise<AlumniRecord[]>;
  claimAlumniRecord(name: string, phoneNumber: string, userId: number): Promise<AlumniRecord | undefined>;
  findAlumniByNameAndYear(name: string, year: number): Promise<AlumniRecord | undefined>;
  updateAlumniMatch(id: number, userId: number): Promise<AlumniRecord | undefined>;
  syncAlumniFromGoogleSheets(): Promise<{ total: number; synced: number; errors: number }>;
  getDirectoryAlumni(viewer: User, q?: string): Promise<DirectoryResult>;
  
  // Pending registration methods
  getPendingRegistrations(): Promise<PendingRegistration[]>;
  createOrRefreshPendingRegistration(
    registration: PendingRegistrationReviewInput,
  ): Promise<CreateOrRefreshPendingRegistrationResult>;
  updatePendingRegistrationStatus(id: number, status: string): Promise<PendingRegistration | undefined>;

  // Obituary methods
  getObituaries(): Promise<Obituary[]>;
  getObituary(id: number): Promise<Obituary | undefined>;
  createObituary(data: InsertObituary & { authorId?: number }): Promise<Obituary>;

  // Community event methods
  getPublishedEvents(eventType?: CommunityEventType): Promise<CommunityEvent[]>;
  getPublishedEvent(id: number): Promise<CommunityEvent | undefined>;
  getEventDraft(id: number, authorId: number): Promise<CommunityEvent | undefined>;
  getLatestEventDraft(authorId: number, eventType: CommunityEventType): Promise<CommunityEvent | undefined>;
  createEventDraft(authorId: number, data: CommunityEventDraftInput): Promise<CommunityEvent>;
  updateEventDraft(id: number, authorId: number, data: CommunityEventDraftInput): Promise<CommunityEvent | undefined>;
  deleteEventDraft(id: number, authorId: number): Promise<boolean>;
  publishEvent(id: number, authorId: number, data: CommunityEventPublishInput): Promise<CommunityEvent | undefined>;
}

export class DatabaseStorage implements IStorage {
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

  async updateUser(id: number, updateData: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async deleteUserAccount(user: Pick<User, "id" | "kakaoId" | "email">): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(communityEvents).where(and(
        eq(communityEvents.authorId, user.id),
        eq(communityEvents.status, "draft"),
      ));
      await tx.update(communityEvents)
        .set({ authorId: null })
        .where(eq(communityEvents.authorId, user.id));
      await tx.update(posts)
        .set({ authorId: null })
        .where(eq(posts.authorId, user.id));
      await tx.update(comments)
        .set({ authorId: null })
        .where(eq(comments.authorId, user.id));
      await tx.update(obituaries)
        .set({ authorId: null })
        .where(eq(obituaries.authorId, user.id));
      await tx.update(payments)
        .set({ userId: null })
        .where(eq(payments.userId, user.id));
      await tx.update(alumniDatabase)
        .set({ isMatched: false, matchedUserId: null })
        .where(eq(alumniDatabase.matchedUserId, user.id));
      await tx.delete(pendingRegistrations).where(or(
        user.kakaoId ? eq(pendingRegistrations.kakaoId, user.kakaoId) : undefined,
        eq(pendingRegistrations.email, user.email),
      ));
      await tx.execute(sql`
        delete from "session"
        where sess ->> 'userId' = ${String(user.id)}
      `);
      await tx.delete(users).where(eq(users.id, user.id));
    });
  }

  async getCategories(): Promise<Category[]> {
    return await db.select().from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(categories.sortOrder);
  }

  async getCategory(id: number): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    return category || undefined;
  }

  async getCategoryByName(name: string): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.name, name));
    return category || undefined;
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const [category] = await db.insert(categories).values(insertCategory).returning();
    return category;
  }

  async updateCategory(id: number, updateData: Partial<InsertCategory>): Promise<Category | undefined> {
    const [category] = await db.update(categories)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();
    return category || undefined;
  }

  async deleteCategory(id: number): Promise<boolean> {
    const result = await db.delete(categories).where(eq(categories.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getPosts(categoryName?: string, limit = 50): Promise<(Post & { category: Category })[]> {
    const baseCondition = eq(posts.isPublished, true);
    const whereCondition = categoryName && categoryName !== 'all' 
      ? and(baseCondition, eq(categories.name, categoryName))
      : baseCondition;

    return await db.select({
      id: posts.id,
      title: posts.title,
      content: posts.content,
      categoryId: posts.categoryId,
      authorId: posts.authorId,
      isPublished: posts.isPublished,
      imageUrls: posts.imageUrls,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      category: categories
    })
    .from(posts)
    .innerJoin(categories, eq(posts.categoryId, categories.id))
    .where(whereCondition)
    .orderBy(desc(posts.createdAt))
    .limit(limit);
  }

  async getPost(id: number): Promise<(Post & { category: Category }) | undefined> {
    const [result] = await db.select({
      id: posts.id,
      title: posts.title,
      content: posts.content,
      categoryId: posts.categoryId,
      authorId: posts.authorId,
      isPublished: posts.isPublished,
      imageUrls: posts.imageUrls,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      category: categories
    })
    .from(posts)
    .innerJoin(categories, eq(posts.categoryId, categories.id))
    .where(eq(posts.id, id));
    
    return result || undefined;
  }

  async createPost(insertPost: InsertPost): Promise<Post> {
    const [post] = await db.insert(posts).values(insertPost).returning();
    return post;
  }

  async updatePost(id: number, updateData: Partial<InsertPost>): Promise<Post | undefined> {
    const [post] = await db.update(posts)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(posts.id, id))
      .returning();
    return post || undefined;
  }

  async deletePost(id: number): Promise<boolean> {
    const result = await db.delete(posts).where(eq(posts.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getCommentsByPost(postId: number): Promise<CommentWithAuthor[]> {
    const rows = await db.select({
      id: comments.id,
      postId: comments.postId,
      authorId: comments.authorId,
      content: comments.content,
      createdAt: comments.createdAt,
      authorName: users.name,
    })
    .from(comments)
    .leftJoin(users, eq(comments.authorId, users.id))
    .where(eq(comments.postId, postId))
    .orderBy(asc(comments.createdAt));

    return rows.map((r) => ({
      id: r.id,
      postId: r.postId,
      authorId: r.authorId,
      content: r.content,
      createdAt: r.createdAt,
      author: r.authorId ? { id: r.authorId, name: r.authorName ?? "회원" } : null,
    }));
  }

  async getComment(id: number): Promise<Comment | undefined> {
    const [comment] = await db.select().from(comments).where(eq(comments.id, id));
    return comment || undefined;
  }

  async createComment(data: { postId: number; authorId: number; content: string }): Promise<Comment> {
    const [comment] = await db.insert(comments).values(data).returning();
    return comment;
  }

  async deleteComment(id: number): Promise<boolean> {
    const result = await db.delete(comments).where(eq(comments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getPaymentsByUser(userId: number): Promise<Payment[]> {
    return await db.select().from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt));
  }

  async getPayment(id: number): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment || undefined;
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const [payment] = await db.insert(payments).values(insertPayment).returning();
    return payment;
  }

  // 권리회원 등급 판정 — 당해년도 "연회비" 완납자만 권리회원(결제 연동 없음).
  // 완납 기준: type='연회비' + status='completed' 합계가 연회비 기준액(ANNUAL_DUES) 이상.
  // (기타 납부·부분 납부·미완료 건은 등급 판정에서 제외)
  async getMembershipStatus(userId: number): Promise<MembershipStatus> {
    const year = koreaCalendarYear();
    const all = await this.getPaymentsByUser(userId); // createdAt desc 정렬
    // 당해년도 완료된 연회비 납부만 집계.
    const completedDues = all.filter(
      (p) => p.year === year && p.type === "연회비" && p.status === "completed",
    );
    const paidAmount = completedDues.reduce((sum, p) => sum + (p.amount ?? 0), 0);
    const isPaid = paidAmount >= ANNUAL_DUES;
    return {
      year,
      tier: isPaid ? "권리회원" : "일반회원",
      isPaid,
      paidAmount,
      annualDues: ANNUAL_DUES,
      // 표시용: 완료된 연회비 중 최신 1건(없으면 null) — 납부완료 카드에서만 사용.
      currentYearPayment: completedDues[0] ?? null,
    };
  }

  async findAlumniByName(name: string): Promise<AlumniRecord[]> {
    const normalizedName = normalizeNameForComparison(name);
    if (!normalizedName) return [];

    return await db.select().from(alumniDatabase)
      .where(sql`regexp_replace(${alumniDatabase.name}, '[[:space:]]', '', 'g') = ${normalizedName}`);
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
  ): Promise<CreateOrRefreshPendingRegistrationResult> {
    return db.transaction(async (tx) => {
      await lockRegistrationIdentities(
        tx,
        insertRegistration.kakaoId,
        insertRegistration.email,
      );

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

  async searchPosts(query: string): Promise<(Post & { category: Category })[]> {
    const searchTerm = `%${query}%`;
    return await db.select({
      id: posts.id,
      title: posts.title,
      content: posts.content,
      categoryId: posts.categoryId,
      authorId: posts.authorId,
      isPublished: posts.isPublished,
      imageUrls: posts.imageUrls,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      category: categories
    })
    .from(posts)
    .innerJoin(categories, eq(posts.categoryId, categories.id))
    .where(
      and(
        eq(posts.isPublished, true),
        or(
          like(posts.title, searchTerm),
          like(posts.content, searchTerm)
        )
      )
    )
    .orderBy(desc(posts.createdAt))
    .limit(20);
  }

  // Google Sheets에서 동문 데이터 동기화
  async syncAlumniFromGoogleSheets(): Promise<{ total: number; synced: number; errors: number }> {
    const stats = { total: 0, synced: 0, errors: 0 };
    
    try {
      console.log('Starting Google Sheets sync...');
      
      // 동기화 시작 알림
      googleSheetsService.startSync();
      
      // Google Sheets 연결 테스트
      googleSheetsService.updateSyncProgress('Google Sheets 연결 테스트 중...');
      const isConnected = await googleSheetsService.testConnection();
      if (!isConnected) {
        console.log('Google Sheets not configured, skipping sync');
        googleSheetsService.finishSync();
        return stats;
      }
      
      // Google Sheets에서 모든 동문 데이터 가져오기
      googleSheetsService.updateSyncProgress('Google Sheets 데이터 로딩 중...');
      const googleAlumni = await googleSheetsService.fetchAlumniData();
      stats.total = googleAlumni.length;
      googleSheetsService.updateSyncProgress('데이터 동기화 시작', 0, stats.total);
      
      if (googleAlumni.length === 0) {
        console.log('No alumni data found in Google Sheets');
        return stats;
      }
      
      // 각 동문 데이터를 로컬 DB와 비교하여 업데이트
      for (let i = 0; i < googleAlumni.length; i++) {
        const alumniData = googleAlumni[i];
        
        // 진행상황 업데이트 (10명마다)
        if (i % 10 === 0 || i === googleAlumni.length - 1) {
          googleSheetsService.updateSyncProgress(
            `동문 데이터 처리 중... (${i + 1}/${googleAlumni.length})`,
            i + 1,
            googleAlumni.length
          );
        }
        
        try {
          // 필수 데이터 검증 (휴대전화번호 포함)
          if (!alumniData.name || !alumniData.generation || !alumniData.department || !alumniData.mobile) {
            console.log(`Skipping invalid alumni source row at index ${i}`);
            stats.errors++;
            googleSheetsService.updateSyncProgress('데이터 검증 오류 발생', undefined, undefined, stats.errors);
            continue;
          }
          
          // 기존 데이터 확인 (휴대전화번호로)
          const existing = await this.findAlumniByMobile(alumniData.mobile);
          
          if (!existing) {
            // 새로운 동문 데이터 추가
            await db.insert(alumniDatabase).values({
              department: alumniData.department,
              generation: alumniData.generation,
              name: alumniData.name,
              admissionDate: alumniData.admissionDate || null,
              graduationDate: alumniData.graduationDate || null,
              address: alumniData.address || null,
              mobile: alumniData.mobile || null,
              phone: alumniData.phone || null,
              group: alumniData.group || null,
              status: alumniData.status || null,
              alumniPosition: alumniData.alumniPosition || null,
              memo: alumniData.memo || null,
              isMatched: false,
              matchedUserId: null,
            });
            stats.synced++;
            
            if (stats.synced % 50 === 0) {
              console.log(`Progress: ${stats.synced}/${stats.total} new records synced (${Math.round((stats.synced/stats.total)*100)}%)`);
            }
          }
        } catch (error) {
          console.error(`Error syncing alumni source row at index ${i}:`, getErrorType(error));
          stats.errors++;
        }
      }
      
      // 최종 통계 확인
      const finalCountResult = await db.select().from(alumniDatabase);
      const totalInDB = finalCountResult.length;
      
      // 동기화 완료
      googleSheetsService.updateSyncProgress('동기화 완료', stats.total, stats.total);
      googleSheetsService.finishSync();
      
      console.log(`Google Sheets sync completed:`);
      console.log(`- Google Sheets total: ${stats.total}`);
      console.log(`- New records synced: ${stats.synced}`);
      console.log(`- Errors: ${stats.errors}`);
      console.log(`- Total records in DB: ${totalInDB}`);
      console.log(`- Remaining to sync: ${stats.total - totalInDB}`);
      
      return stats;
    } catch (error) {
      console.error('Google Sheets sync failed:', getErrorType(error));
      // 에러 시에도 동기화 상태 정리
      googleSheetsService.finishSync();
      return stats;
    }
  }

  async getObituaries(): Promise<Obituary[]> {
    return await db.select().from(obituaries).orderBy(desc(obituaries.createdAt));
  }

  async getObituary(id: number): Promise<Obituary | undefined> {
    const [obituary] = await db.select().from(obituaries).where(eq(obituaries.id, id));
    return obituary || undefined;
  }

  async createObituary(data: InsertObituary & { authorId?: number }): Promise<Obituary> {
    const [obituary] = await db.insert(obituaries).values(data).returning();
    return obituary;
  }

  async getPublishedEvents(eventType?: CommunityEventType): Promise<CommunityEvent[]> {
    const condition = eventType
      ? and(eq(communityEvents.status, "published"), eq(communityEvents.eventType, eventType))
      : eq(communityEvents.status, "published");
    return await db.select().from(communityEvents)
      .where(condition)
      .orderBy(desc(communityEvents.publishedAt));
  }

  async getPublishedEvent(id: number): Promise<CommunityEvent | undefined> {
    const [event] = await db.select().from(communityEvents)
      .where(and(eq(communityEvents.id, id), eq(communityEvents.status, "published")));
    return event || undefined;
  }

  async getEventDraft(id: number, authorId: number): Promise<CommunityEvent | undefined> {
    const [event] = await db.select().from(communityEvents)
      .where(and(
        eq(communityEvents.id, id),
        eq(communityEvents.authorId, authorId),
        eq(communityEvents.status, "draft"),
      ));
    return event || undefined;
  }

  async getLatestEventDraft(authorId: number, eventType: CommunityEventType): Promise<CommunityEvent | undefined> {
    const [event] = await db.select().from(communityEvents)
      .where(and(
        eq(communityEvents.authorId, authorId),
        eq(communityEvents.eventType, eventType),
        eq(communityEvents.status, "draft"),
      ))
      .orderBy(desc(communityEvents.updatedAt))
      .limit(1);
    return event || undefined;
  }

  async createEventDraft(authorId: number, data: CommunityEventDraftInput): Promise<CommunityEvent> {
    return getOrCreateEventDraft(
      (work) => db.transaction(async (tx) => work({
        lock: async (lockedAuthorId, eventType) => {
          await tx.execute(sql`
            select pg_advisory_xact_lock(
              ${lockedAuthorId},
              ${eventDraftAdvisoryLockId(eventType)}
            )
          `);
        },
        find: async (draftAuthorId, eventType) => {
          const [existing] = await tx.select().from(communityEvents)
            .where(and(
              eq(communityEvents.authorId, draftAuthorId),
              eq(communityEvents.eventType, eventType),
              eq(communityEvents.status, "draft"),
            ))
            .orderBy(desc(communityEvents.updatedAt))
            .limit(1);
          return existing || undefined;
        },
        update: async (id, draftAuthorId, eventType, draftData) => {
          const [updated] = await tx.update(communityEvents)
            .set({ ...draftData, updatedAt: new Date() })
            .where(and(
              eq(communityEvents.id, id),
              eq(communityEvents.authorId, draftAuthorId),
              eq(communityEvents.eventType, eventType),
              eq(communityEvents.status, "draft"),
            ))
            .returning();
          if (!updated) throw new Error("임시 저장된 소식을 갱신하지 못했습니다.");
          return updated;
        },
        insert: async (draftAuthorId, draftData) => {
          const [created] = await tx.insert(communityEvents)
            .values({ ...draftData, authorId: draftAuthorId })
            .returning();
          return created;
        },
      })),
      authorId,
      data,
    );
  }

  async updateEventDraft(
    id: number,
    authorId: number,
    data: CommunityEventDraftInput,
  ): Promise<CommunityEvent | undefined> {
    const [event] = await db.update(communityEvents)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(communityEvents.id, id),
        eq(communityEvents.authorId, authorId),
        eq(communityEvents.status, "draft"),
      ))
      .returning();
    return event || undefined;
  }

  async deleteEventDraft(id: number, authorId: number): Promise<boolean> {
    const result = await db.delete(communityEvents).where(and(
      eq(communityEvents.id, id),
      eq(communityEvents.authorId, authorId),
      eq(communityEvents.status, "draft"),
    ));
    return (result.rowCount ?? 0) > 0;
  }

  async publishEvent(
    id: number,
    authorId: number,
    data: CommunityEventPublishInput,
  ): Promise<CommunityEvent | undefined> {
    const now = new Date();
    const [event] = await db.update(communityEvents)
      .set({ ...data, status: "published", publishedAt: now, updatedAt: now })
      .where(and(
        eq(communityEvents.id, id),
        eq(communityEvents.authorId, authorId),
        eq(communityEvents.status, "draft"),
      ))
      .returning();
    if (event) return event;

    const [published] = await db.select().from(communityEvents)
      .where(and(
        eq(communityEvents.id, id),
        eq(communityEvents.authorId, authorId),
        eq(communityEvents.status, "published"),
      ));
    return published || undefined;
  }
}

export const storage = new DatabaseStorage();
