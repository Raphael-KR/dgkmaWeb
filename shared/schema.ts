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
  profileImage: text("profile_image"),
  phoneNumber: text("phone_number"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull(), // 공지, 부고, 경조사, 일반
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
  name: text("name").notNull(),
  graduationYear: integer("graduation_year").notNull(),
  phoneNumber: text("phone_number"),
  email: text("email"),
  isMatched: boolean("is_matched").default(false),
  matchedUserId: integer("matched_user_id").references(() => users.id),
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

// Schemas
export const insertUserSchema = createInsertSchema(users).omit({
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
export type Post = typeof posts.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type AlumniRecord = typeof alumniDatabase.$inferSelect;
export type InsertAlumniRecord = z.infer<typeof insertAlumniSchema>;
export type PendingRegistration = typeof pendingRegistrations.$inferSelect;
export type InsertPendingRegistration = z.infer<typeof insertPendingRegistrationSchema>;
