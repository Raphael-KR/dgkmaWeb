import { POST_IMPORT_DATA_CHECK_SQL } from "./post-import-check";
import {
  pgTable,
  text,
  serial,
  uuid,
  integer,
  boolean,
  timestamp,
  jsonb,
  check,
  foreignKey,
  index,
  uniqueIndex,
  unique,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { PostImportData } from "@shared/contracts/post-import";
import type { PostDocument } from "@shared/contracts/post-document";
import type { NoticeData } from "@shared/contracts/notices";
import type { PendingRegistrationUserData } from "@shared/contracts";
import type { MembershipTier } from "@shared/contracts";

export const sourceCollectionRules = pgTable(
  "source_collection_rules",
  {
    id: serial("id").primaryKey(),
    domain: text("domain").notNull(),
    pagePattern: text("page_pattern").notNull(),
    rule: jsonb("rule").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("source_collection_rules_domain_pattern_unique").on(table.domain, table.pagePattern),
    check("source_collection_rules_version_check", sql`${table.version}>0`),
    check(
      "source_collection_rules_json_check",
      sql`(jsonb_typeof(${table.rule})='object' AND ${table.rule}->>'schemaVersion'='1') IS TRUE`,
    ),
  ],
);

export {
  PENDING_REGISTRATION_CONFLICT_REASONS,
  insertPostSchema,
  insertCommentSchema,
  REGION_OPTIONS,
  activityRegionSchema,
  ANNUAL_DUES,
  updateProfileSchema,
} from "@shared/contracts";
export type {
  PendingRegistrationConflictReason,
  PendingRegistrationUserData,
  InsertComment,
  ClientUser,
  AdminPendingRegistrationDto,
  AdminPendingRegistrationUpdateResult,
  MembershipTier,
  UpdateProfile,
} from "@shared/contracts";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    kakaoId: text("kakao_id").unique(),
    email: text("email").unique(),
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
    affiliation: text("affiliation"),
    affiliationTitle: text("affiliation_title"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    department: text("department"),
    generation: text("generation"),
    alumniName: text("alumni_name"),
    admissionDate: text("admission_date"),
    graduationDate: text("graduation_date"),
    alumniMobile: text("alumni_mobile"),
    alumniGroup: text("alumni_group"),
    alumniStatus: text("alumni_status").notNull().default("미가입"),
    membershipHistory: jsonb("membership_history")
      .$type<{ type: string; at: string }[]>()
      .notNull()
      .default([]),
    alumniPosition: text("alumni_position"),
    alumniMemo: text("alumni_memo"),
  },
  (table) => [
    check(
      "users_alumni_status_check",
      sql`${table.alumniStatus} in ('미가입','가입 대기','가입 완료','가입 거부','동문회 탈퇴자','사망')`,
    ),
    check(
      "users_membership_history_check",
      sql`jsonb_typeof(${table.membershipHistory}) = 'array'`,
    ),
    check(
      "users_approval_status_check",
      sql`(${table.isVerified} is true) = (${table.alumniStatus} = '가입 완료') AND (${table.alumniStatus} <> '가입 완료' OR ${table.kakaoId} IS NOT NULL)`,
    ),
  ],
);

// Account reads omit private roster data, including the office memo and roster phone.
export const accountUserColumns = {
  id: users.id,
  joinedAt: users.joinedAt,
  kakaoId: users.kakaoId,
  email: users.email,
  name: users.name,
  graduationYear: users.graduationYear,
  isVerified: users.isVerified,
  isAdmin: users.isAdmin,
  kakaoSyncEnabled: users.kakaoSyncEnabled,
  profileImage: users.profileImage,
  phoneNumber: users.phoneNumber,
  birthday: users.birthday,
  birthdayType: users.birthdayType,
  isLeapMonth: users.isLeapMonth,
  activityRegion: users.activityRegion,
  affiliation: users.affiliation,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

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

export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    content: jsonb("content").$type<PostDocument>().notNull(),
    categoryId: integer("category_id").references(() => categories.id),
    authorId: uuid("author_id").references(() => users.id),
    authorName: text("author_name"),
    authorAffiliation: text("author_affiliation"),
    importData: jsonb("import_data").$type<PostImportData>(),
    isPublished: boolean("is_published").default(true),
    isHidden: boolean("is_hidden").notNull().default(false),
    imageUrls: text("image_urls").array(), // 오브젝트 스토리지 첨부 이미지 경로 목록
    eventData: jsonb("event_data").$type<NoticeData>(),
    sourceText: text("source_text"),
    revision: integer("revision").notNull().default(0),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    check(
      "posts_content_document_check",
      sql`(jsonb_typeof(${table.content}) = 'object' AND ${table.content}->>'type' = 'doc' AND jsonb_typeof(${table.content}->'content') = 'array') IS TRUE`,
    ),
    check(
      "posts_notice_type_check",
      sql`${table.eventData} IS NULL OR (${table.eventData}->>'schemaVersion' = '1' AND ${table.eventData}->>'eventType' IN ('obituary', 'wedding', 'opening')) IS TRUE`,
    ),
    check("posts_import_data_check", sql.raw(POST_IMPORT_DATA_CHECK_SQL)),
    uniqueIndex("posts_import_source_unique")
      .on(
        sql`(${table.importData}->>'platform')`,
        sql`(${table.importData}->>'containerId')`,
        sql`(${table.importData}->>'sourceId')`,
      )
      .where(sql`${table.importData} IS NOT NULL`),
    check("posts_revision_check", sql`${table.revision} >= 0`),
    uniqueIndex("posts_notice_draft_unique")
      .on(table.authorId, sql`(${table.eventData}->>'eventType')`)
      .where(sql`${table.isPublished} = false AND ${table.eventData} IS NOT NULL`),
  ],
);

// 작성자·게시글 식별자와 첨부 메타데이터는 서버가 채운다.
export const comments = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id),
    authorName: text("author_name"),
    authorAffiliation: text("author_affiliation"),
    parentCommentId: integer("parent_comment_id"),
    importSourceId: text("import_source_id"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    isHidden: boolean("is_hidden").notNull().default(false),
    editedAt: timestamp("edited_at"),
    revision: integer("revision").notNull().default(0),
    attachment:
      jsonb("attachment").$type<import("@shared/contracts/comments").CommentAttachmentData>(),
  },
  (table) => [
    unique("comments_post_id_id_unique").on(table.postId, table.id),
    foreignKey({
      name: "comments_same_post_parent_fk",
      columns: [table.postId, table.parentCommentId],
      foreignColumns: [table.postId, table.id],
    }),
    uniqueIndex("comments_import_source_unique")
      .on(table.postId, table.importSourceId)
      .where(sql`${table.importSourceId} IS NOT NULL`),
    check(
      "comments_import_origin_check",
      sql`(
        (${table.importSourceId} IS NULL AND ${table.authorName} IS NULL AND ${table.parentCommentId} IS NULL)
        OR (${table.importSourceId} IS NOT NULL AND btrim(${table.importSourceId}) <> '' AND ${table.authorId} IS NULL
          AND ${table.authorName} IS NOT NULL AND btrim(${table.authorName}) <> ''
          AND ${table.parentCommentId} IS DISTINCT FROM ${table.id})
      )`,
    ),
    check("comments_revision_check", sql`${table.revision} >= 0`),
    check(
      "comments_attachment_check",
      sql`${table.attachment} IS NULL OR (CASE jsonb_typeof(${table.attachment})
    WHEN 'object' THEN jsonb_typeof(${table.attachment}->'objectPath') = 'string'
      AND jsonb_typeof(${table.attachment}->'name') = 'string' AND jsonb_typeof(${table.attachment}->'size') = 'number'
      AND jsonb_typeof(${table.attachment}->'contentType') = 'string'
    WHEN 'array' THEN ${table.authorId} IS NULL AND ${table.importSourceId} ~ '^post:[1-9][0-9]*/comment:[1-9][0-9]*(/reply:[1-9][0-9]*)?$'
      AND jsonb_array_length(${table.attachment}) > 0 AND ${table.attachment} = jsonb_path_query_array(${table.attachment},
        'strict $[*] ? (@.type() == "object" && @.objectPath.type() == "string" && @.objectPath like_regex "^/objects/band-imports/[0-9a-f-]{36}$" && @.name.type() == "string" && @.size.type() == "number" && @.size > 0 && @.contentType.type() == "string" && @.contentType like_regex "^(image/(jpeg|png|gif|webp)|video/mp4)$")', '{}', true)
    ELSE false END) IS TRUE`,
    ),
  ],
);

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id),
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
  matchedUserId: uuid("matched_user_id")
    .unique()
    .references(() => users.id),
});

export const alumniNameAliases = pgTable(
  "alumni_name_aliases",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    aliasType: text("alias_type").notNull(),
    isPreferred: boolean("is_preferred").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "alumni_name_aliases_type_check",
      sql`${table.aliasType} IN ('current_name', 'former_name')`,
    ),
    check("alumni_name_aliases_normalized_not_blank", sql`length(${table.normalizedName}) > 0`),
    uniqueIndex("alumni_name_aliases_alumni_normalized_unique").on(
      table.userId,
      table.normalizedName,
    ),
    uniqueIndex("alumni_name_aliases_preferred_unique")
      .on(table.userId)
      .where(sql`${table.isPreferred} = true`),
    index("alumni_name_aliases_normalized_idx").on(table.normalizedName),
  ],
);

export const eventParseRateLimits = pgTable("event_parse_rate_limits", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
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
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  payments: many(payments),
  nameAliases: many(alumniNameAliases),
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

export const alumniNameAliasesRelations = relations(alumniNameAliases, ({ one }) => ({
  user: one(users, {
    fields: [alumniNameAliases.userId],
    references: [users.id],
  }),
}));

// Schemas
export const insertUserSchema = createInsertSchema(users, { email: z.string().email() }).pick({
  kakaoId: true,
  email: true,
  name: true,
  graduationYear: true,
  isVerified: true,
  isAdmin: true,
  kakaoSyncEnabled: true,
  profileImage: true,
  phoneNumber: true,
  birthday: true,
  birthdayType: true,
  isLeapMonth: true,
  activityRegion: true,
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});

export const insertPendingRegistrationSchema = createInsertSchema(pendingRegistrations).omit({
  id: true,
  createdAt: true,
});

// Persistence models; browser-facing contracts live in shared/contracts.
export type User = Pick<typeof users.$inferSelect, keyof typeof accountUserColumns>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type AlumniRecord = {
  id: string;
  name: string;
  generation: string | null;
  admissionDate: string | null;
  graduationDate: string | null;
  mobile: string | null;
  status: string | null;
  hasAccount: boolean;
};
export type PendingRegistration = typeof pendingRegistrations.$inferSelect;
export type InsertPendingRegistration = z.infer<typeof insertPendingRegistrationSchema>;

// Preserve the server model's Date timestamp; contracts expose its JSON form.
export type MembershipStatus = {
  year: number;
  tier: MembershipTier;
  isPaid: boolean;
  paidAmount: number;
  annualDues: number;
  currentYearPayment: Pick<Payment, "createdAt"> | null;
};
