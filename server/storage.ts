import {
  users, posts, payments, alumniDatabase, pendingRegistrations, categories, obituaries,
  type User, type InsertUser, type Post, type InsertPost,
  type Payment, type InsertPayment, type AlumniRecord, type InsertAlumniRecord,
  type PendingRegistration, type InsertPendingRegistration, type Category, type InsertCategory,
  type Obituary, type InsertObituary, type MembershipStatus, ANNUAL_DUES
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, like, or, asc, count, type SQL } from "drizzle-orm";
import { googleSheetsService } from "./google-sheets";

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

// 명부 목록 반환 상한. 현재 전체 동문이 약 3,400명이므로 단일 기수/지역 범위는 물론
// 관리자 전체 열람도 한 번에 담을 수 있는 여유값. (통계 수치는 별도 count 로 정확히 산출)
const DIRECTORY_LIST_LIMIT = 5000;

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

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByKakaoId(kakaoId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined>;
  
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
  
  // Payment methods
  getPaymentsByUser(userId: number): Promise<Payment[]>;
  getPayment(id: number): Promise<Payment | undefined>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  getMembershipStatus(userId: number): Promise<MembershipStatus>;
  
  // Alumni methods
  findAlumniByName(name: string): Promise<AlumniRecord[]>;
  findAlumniByNameAndYear(name: string, year: number): Promise<AlumniRecord | undefined>;
  updateAlumniMatch(id: number, userId: number): Promise<AlumniRecord | undefined>;
  syncAlumniFromGoogleSheets(): Promise<{ total: number; synced: number; errors: number }>;
  getDirectoryAlumni(viewer: User, q?: string): Promise<DirectoryResult>;
  
  // Pending registration methods
  getPendingRegistrations(): Promise<PendingRegistration[]>;
  createPendingRegistration(registration: InsertPendingRegistration): Promise<PendingRegistration>;
  updatePendingRegistrationStatus(id: number, status: string): Promise<PendingRegistration | undefined>;

  // Obituary methods
  getObituaries(): Promise<Obituary[]>;
  getObituary(id: number): Promise<Obituary | undefined>;
  createObituary(data: InsertObituary & { authorId?: number }): Promise<Obituary>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByKakaoId(kakaoId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.kakaoId, kakaoId));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, updateData: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
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

  // 권리회원 등급 판정 — 당해년도 완료 납부 내역으로만 계산(결제 연동 없음).
  async getMembershipStatus(userId: number): Promise<MembershipStatus> {
    const year = new Date().getFullYear();
    const all = await this.getPaymentsByUser(userId); // createdAt desc 정렬
    const currentYear = all.filter((p) => p.year === year);
    const completed = currentYear.filter((p) => p.status === "completed");
    const paidAmount = completed.reduce((sum, p) => sum + (p.amount ?? 0), 0);
    const isPaid = completed.length > 0;
    return {
      year,
      tier: isPaid ? "권리회원" : "일반회원",
      isPaid,
      paidAmount,
      annualDues: ANNUAL_DUES,
      currentYearPayment: currentYear[0] ?? null,
    };
  }

  async findAlumniByName(name: string): Promise<any[]> {
    // Google Sheets에서 먼저 검색
    try {
      const googleResults = await googleSheetsService.findAlumniByName(name);
      if (googleResults.length > 0) {
        console.log(`Found ${googleResults.length} matches in Google Sheets for ${name}`);
        return googleResults;
      }
    } catch (error) {
      console.error('Error searching Google Sheets, falling back to local database:', error);
    }
    
    // 로컬 데이터베이스에서 검색
    return await db.select().from(alumniDatabase).where(eq(alumniDatabase.name, name));
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

  async createPendingRegistration(insertRegistration: InsertPendingRegistration): Promise<PendingRegistration> {
    const [registration] = await db.insert(pendingRegistrations).values(insertRegistration).returning();
    return registration;
  }

  async updatePendingRegistrationStatus(id: number, status: string): Promise<PendingRegistration | undefined> {
    const [registration] = await db.update(pendingRegistrations)
      .set({ status })
      .where(eq(pendingRegistrations.id, id))
      .returning();
    return registration || undefined;
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
            console.log(`Skipping invalid alumni data at index ${i}:`, {
              name: alumniData.name,
              generation: alumniData.generation,
              department: alumniData.department,
              mobile: alumniData.mobile
            });
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
          } else {
            // 기존 데이터가 있으면 스킵 (휴대전화번호 중복 방지)
            if (stats.synced < 50) { // 처음 50건만 상세 로그
              console.log(`Skipped existing alumni (mobile exists): ${alumniData.name} (${alumniData.generation}기) - ${alumniData.mobile}`);
            }
          }
        } catch (error) {
          console.error(`Error syncing alumni ${alumniData.name} (${alumniData.generation}기):`, error);
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
      console.error('Google Sheets sync failed:', error);
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
}

export const storage = new DatabaseStorage();
