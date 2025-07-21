import { 
  users, posts, payments, alumniDatabase, pendingRegistrations,
  type User, type InsertUser, type Post, type InsertPost, 
  type Payment, type InsertPayment, type AlumniRecord, type InsertAlumniRecord,
  type PendingRegistration, type InsertPendingRegistration
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByKakaoId(kakaoId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined>;
  
  // Post methods
  getPosts(category?: string, limit?: number): Promise<Post[]>;
  getPost(id: number): Promise<Post | undefined>;
  createPost(post: InsertPost): Promise<Post>;
  updatePost(id: number, post: Partial<InsertPost>): Promise<Post | undefined>;
  deletePost(id: number): Promise<boolean>;
  
  // Payment methods
  getPaymentsByUser(userId: number): Promise<Payment[]>;
  getPayment(id: number): Promise<Payment | undefined>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  
  // Alumni methods
  findAlumniByName(name: string): Promise<AlumniRecord[]>;
  findAlumniByNameAndYear(name: string, year: number): Promise<AlumniRecord | undefined>;
  updateAlumniMatch(id: number, userId: number): Promise<AlumniRecord | undefined>;
  
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

  async getPosts(category?: string, limit = 50): Promise<Post[]> {
    let query = db.select().from(posts).where(eq(posts.isPublished, true));
    
    if (category) {
      query = query.where(and(eq(posts.isPublished, true), eq(posts.category, category)));
    }
    
    return await query.orderBy(desc(posts.createdAt)).limit(limit);
  }

  async getPost(id: number): Promise<Post | undefined> {
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    return post || undefined;
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
    return result.rowCount > 0;
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

  async findAlumniByName(name: string): Promise<AlumniRecord[]> {
    return await db.select().from(alumniDatabase).where(eq(alumniDatabase.name, name));
  }

  async findAlumniByNameAndYear(name: string, year: number): Promise<AlumniRecord | undefined> {
    const [alumni] = await db.select().from(alumniDatabase)
      .where(and(eq(alumniDatabase.name, name), eq(alumniDatabase.graduationYear, year)));
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
}

export const storage = new DatabaseStorage();
