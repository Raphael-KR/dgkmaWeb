import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  kakaoId: text("kakao_id").unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  graduationYear: integer("graduation_year"),
  isVerified: boolean("is_verified").default(false),
  isAdmin: boolean("is_admin").default(false),
  kakaoSyncEnabled: boolean("kakao_sync_enabled").default(false),
  profileImage: text("profile_image"),
  phoneNumber: text("phone_number"),
  birthday: text("birthday"),
  birthdayType: text("birthday_type"),
  isLeapMonth: boolean("is_leap_month"),
  activityRegion: text("activity_region"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  color: text("color").default("#6b7280"), // 배지 색상 (CSS color)
  badgeVariant: text("badge_variant").default("secondary"), // default, secondary, destructive, outline
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  authorId: integer("author_id").references(() => users.id),
  isPublished: boolean("is_published").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  amount: integer("amount").notNull(),
  year: integer("year").notNull(),
  type: text("type").notNull(), // 연회비, 기타
  status: text("status").notNull().default("completed"), // pending, completed, failed
  receiptUrl: text("receipt_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const alumniDatabase = pgTable("alumni_database", {
  id: serial("id").primaryKey(),
  department: text("department").notNull(), // 학과
  generation: text("generation").notNull(), // 기수
  name: text("name").notNull(), // 성명
  admissionDate: text("admission_date"), // 입학일자
  graduationDate: text("graduation_date"), // 졸업일자
  address: text("address"), // 주소
  mobile: text("mobile").unique(), // 핸드폰번호 (고유키)
  phone: text("phone"), // 전화번호
  group: text("group"), // 그룹
  status: text("status"), // 상태
  alumniPosition: text("alumni_position"), // 동문회직책
  memo: text("memo"), // 메모
  isMatched: boolean("is_matched").default(false),
  matchedUserId: integer("matched_user_id").references(() => users.id),
});

export const obituaries = pgTable("obituaries", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  deceasedName: text("deceased_name").notNull(),
  deceasedRelation: text("deceased_relation").notNull(),
  dateOfDeath: text("date_of_death").notNull(),
  funeralHome: text("funeral_home").default(""),
  jangji: text("jangji").default(""),
  bankAccount: text("bank_account").default(""),
  chiefMourner: text("chief_mourner").default(""),
  contactNumber: text("contact_number").default(""),
  authorId: integer("author_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pendingRegistrations = pgTable("pending_registrations", {
  id: serial("id").primaryKey(),
  kakaoId: text("kakao_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  userData: jsonb("user_data"),
  status: text("status").default("pending"), // pending, approved, rejected
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  posts: many(posts),
  payments: many(payments),
  alumniRecord: one(alumniDatabase, {
    fields: [users.id],
    references: [alumniDatabase.matchedUserId],
  }),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [posts.categoryId],
    references: [categories.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  posts: many(posts),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, {
    fields: [payments.userId],
    references: [users.id],
  }),
}));

export const alumniDatabaseRelations = relations(alumniDatabase, ({ one }) => ({
  matchedUser: one(users, {
    fields: [alumniDatabase.matchedUserId],
    references: [users.id],
  }),
}));

export const obituariesRelations = relations(obituaries, ({ one }) => ({
  author: one(users, {
    fields: [obituaries.authorId],
    references: [users.id],
  }),
}));

// Schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPostSchema = createInsertSchema(posts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});

export const insertAlumniSchema = createInsertSchema(alumniDatabase).omit({
  id: true,
});

export const insertPendingRegistrationSchema = createInsertSchema(pendingRegistrations).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Post = typeof posts.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type AlumniRecord = typeof alumniDatabase.$inferSelect;
export type InsertAlumniRecord = z.infer<typeof insertAlumniSchema>;
export type PendingRegistration = typeof pendingRegistrations.$inferSelect;
export type InsertPendingRegistration = z.infer<typeof insertPendingRegistrationSchema>;
export type Obituary = typeof obituaries.$inferSelect;

export const insertObituarySchema = z.object({
  title: z.string().min(1, "제목을 입력해주세요"),
  deceasedName: z.string().min(1, "고인의 성함을 입력해주세요"),
  deceasedRelation: z.string().min(1),
  dateOfDeath: z.string().min(1, "별세일을 입력해주세요"),
  funeralHome: z.string().optional().default(""),
  jangji: z.string().optional().default(""),
  bankAccount: z.string().optional().default(""),
  chiefMourner: z.string().optional().default(""),
  contactNumber: z.string().optional().default(""),
});
export type InsertObituary = z.infer<typeof insertObituarySchema>;

// 활동 지역(시/도) 18개 — 온보딩·프로필 편집·서버 검증에서 공통 사용.
export const REGION_OPTIONS = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시',
  '광주광역시', '대전광역시', '울산광역시', '세종특별자치시',
  '경기도', '강원특별자치도', '충청북도', '충청남도',
  '전북특별자치도', '전라남도', '경상북도', '경상남도',
  '제주특별자치도', '해외',
] as const;

// 연회비 기준액(원). 권리회원 판정 안내 및 미납 표시에 사용.
export const ANNUAL_DUES = 50000;

// 회원 등급(권리회원/일반회원) 판정 결과. 서버·클라이언트 공통 타입.
// 권리회원 = 당해년도 연회비 완납자(type='연회비' + status='completed' 합계가
// ANNUAL_DUES 이상). /about/dues 의 "회비 납부자(권리회원)" 정의와 일치.
// 별도 결제 연동 없이 기존 납부 내역으로만 산출.
export type MembershipTier = '권리회원' | '일반회원';
export type MembershipStatus = {
  year: number;
  tier: MembershipTier;
  isPaid: boolean;
  paidAmount: number; // 당해년도 완료 납부 합계(원)
  annualDues: number; // 연회비 기준액(원)
  currentYearPayment: Payment | null; // 당해년도 완료된 연회비 중 최신 1건(표시용)
};

// 프로필에서 본인이 수정 가능한 항목만 허용 (이름·졸업년도 등 검증 항목 제외).
export const updateProfileSchema = insertUserSchema
  .pick({
    activityRegion: true,
    birthday: true,
    birthdayType: true,
    isLeapMonth: true,
    kakaoSyncEnabled: true,
  })
  .partial()
  .extend({
    // 양력/음력만 허용 (클라이언트 값 제약을 서버에서도 강제).
    birthdayType: z.enum(["SOLAR", "LUNAR"]).nullable().optional(),
  });
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
