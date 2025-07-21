import { 
  users, posts, payments, alumniDatabase, pendingRegistrations, categories,
  type User, type InsertUser, type Post, type InsertPost, 
  type Payment, type InsertPayment, type AlumniRecord, type InsertAlumniRecord,
  type PendingRegistration, type InsertPendingRegistration, type Category, type InsertCategory
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, like, or } from "drizzle-orm";
import { googleSheetsService } from "./google-sheets";

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
  
  // Alumni methods
  findAlumniByName(name: string): Promise<AlumniRecord[]>;
  findAlumniByNameAndYear(name: string, year: number): Promise<AlumniRecord | undefined>;
  updateAlumniMatch(id: number, userId: number): Promise<AlumniRecord | undefined>;
  syncAlumniFromGoogleSheets(): Promise<number>;
  
  // Pending registration methods
  getPendingRegistrations(): Promise<PendingRegistration[]>;
  createPendingRegistration(registration: InsertPendingRegistration): Promise<PendingRegistration>;
  updatePendingRegistrationStatus(id: number, status: string): Promise<PendingRegistration | undefined>;
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
            googleSheetsService.updateSyncProgress(undefined, undefined, undefined, stats.errors);
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
}

export const storage = new DatabaseStorage();
