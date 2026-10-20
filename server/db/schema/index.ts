import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
  check,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { CommunityEventDetails } from "@shared/contracts/community-events";
import type { PendingRegistrationUserData } from "@shared/contracts";
import type { MembershipTier } from "@shared/contracts";

export {
  PENDING_REGISTRATION_CONFLICT_REASONS,
  insertObituarySchema,
  REGION_OPTIONS,
  activityRegionSchema,
  ANNUAL_DUES,
  updateProfileSchema,
} from "@shared/contracts";
export type {
  PendingRegistrationConflictReason,
  PendingRegistrationUserData,
  ClientUser,
  AdminPendingRegistrationDto,
  AdminPendingRegistrationUpdateResult,
  InsertObituary,
  MembershipTier,
  UpdateProfile,
} from "@shared/contracts";

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
  imageUrls: text("image_urls").array(), // 오브젝트 스토리지 첨부 이미지 경로 목록
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 게시글 댓글. authorId/postId 는 서버에서 세션·URL 로 채움(본문은 content 만).
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  authorId: integer("author_id").references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
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

export const alumniNameAliases = pgTable("alumni_name_aliases", {
  id: serial("id").primaryKey(),
  alumniId: integer("alumni_id")
    .notNull()
    .references(() => alumniDatabase.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  aliasType: text("alias_type").notNull(),
  isPreferred: boolean("is_preferred").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  check(
    "alumni_name_aliases_type_check",
    sql`${table.aliasType} IN ('current_name', 'former_name')`,
  ),
  check(
    "alumni_name_aliases_normalized_not_blank",
    sql`length(${table.normalizedName}) > 0`,
  ),
  uniqueIndex("alumni_name_aliases_alumni_normalized_unique")
    .on(table.alumniId, table.normalizedName),
  uniqueIndex("alumni_name_aliases_preferred_unique")
    .on(table.alumniId)
    .where(sql`${table.isPreferred} = true`),
  index("alumni_name_aliases_normalized_idx").on(table.normalizedName),
]);

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

export const communityEvents = pgTable("community_events", {
  id: serial("id").primaryKey(),
  legacyObituaryId: integer("legacy_obituary_id").unique(),
  eventType: text("event_type").notNull(),
  status: text("status").notNull().default("draft"),
  title: text("title"),
  eventDate: text("event_date"),
  location: text("location"),
  relatedMemberName: text("related_member_name"),
  contactNumber: text("contact_number"),
  accountInfo: text("account_info"),
  sourceText: text("source_text"),
  sourceUrls: text("source_urls").array().default([]),
  details: jsonb("details").$type<CommunityEventDetails>().notNull().default({}),
  authorId: integer("author_id").references(() => users.id),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const eventParseRateLimits = pgTable("event_parse_rate_limits", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  requestCount: integer("request_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pendingRegistrations = pgTable("pending_registrations", {
  id: serial("id").primaryKey(),
  kakaoId: text("kakao_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  userData: jsonb("user_data").$type<PendingRegistrationUserData>(),
  status: text("status").default("pending"), // pending, approved, rejected
  createdAt: timestamp("created_at").defaultNow(),
});

export const kakaoOAuthStates = pgTable("kakao_oauth_states", {
  stateHash: text("state_hash").primaryKey(),
  sessionBindingHash: text("session_binding_hash").notNull().unique(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kakaoIdentityTerminations = pgTable("kakao_identity_terminations", {
  identityHash: text("identity_hash").primaryKey(),
  terminatedAt: timestamp("terminated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  posts: many(posts),
  payments: many(payments),
  communityEvents: many(communityEvents),
  alumniRecord: one(alumniDatabase, {
    fields: [users.id],
    references: [alumniDatabase.matchedUserId],
  }),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [posts.categoryId],
    references: [categories.id],
  }),
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  post: one(posts, {
    fields: [comments.postId],
    references: [posts.id],
  }),
  author: one(users, {
    fields: [comments.authorId],
    references: [users.id],
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

export const alumniDatabaseRelations = relations(alumniDatabase, ({ one, many }) => ({
  matchedUser: one(users, {
    fields: [alumniDatabase.matchedUserId],
    references: [users.id],
  }),
  nameAliases: many(alumniNameAliases),
}));

export const alumniNameAliasesRelations = relations(alumniNameAliases, ({ one }) => ({
  alumni: one(alumniDatabase, {
    fields: [alumniNameAliases.alumniId],
    references: [alumniDatabase.id],
  }),
}));

export const obituariesRelations = relations(obituaries, ({ one }) => ({
  author: one(users, {
    fields: [obituaries.authorId],
    references: [users.id],
  }),
}));

export const communityEventsRelations = relations(communityEvents, ({ one }) => ({
  author: one(users, {
    fields: [communityEvents.authorId],
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

// 댓글 작성 입력 — 본문(content)만 검증. postId 는 URL, authorId 는 세션에서 채움.
export const insertCommentSchema = createInsertSchema(comments)
  .pick({ content: true })
  .extend({
    content: z
      .string()
      .min(1, "댓글 내용을 입력해주세요")
      .max(1000, "댓글은 1000자 이내로 입력해주세요"),
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

// Persistence models; browser-facing contracts live in shared/contracts.
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Post = typeof posts.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type AlumniRecord = typeof alumniDatabase.$inferSelect;
export type AlumniNameAlias = typeof alumniNameAliases.$inferSelect;
export type InsertAlumniRecord = z.infer<typeof insertAlumniSchema>;
export type PendingRegistration = typeof pendingRegistrations.$inferSelect;
export type InsertPendingRegistration = z.infer<typeof insertPendingRegistrationSchema>;
export type Obituary = typeof obituaries.$inferSelect;
export type CommunityEvent = typeof communityEvents.$inferSelect;
export type InsertCommunityEvent = typeof communityEvents.$inferInsert;

// Preserve the server model's Date timestamp; contracts expose its JSON form.
export type MembershipStatus = {
  year: number;
  tier: MembershipTier;
  isPaid: boolean;
  paidAmount: number;
  annualDues: number;
  currentYearPayment: Pick<Payment, "createdAt"> | null;
};
