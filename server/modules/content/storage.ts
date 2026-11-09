import { normalizePostDocument } from "@shared/editor/post-document";
import type { NoticeType, UpdatePost } from "@shared/contracts";
import { postBodyTextExpression } from "./post-body-query";
import {
  users, posts, categories, comments,
  type Post, type InsertPost, type Category, type InsertCategory, type Comment,
} from "@shared/schema";
import { and, asc, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import { db } from "../../db";
import type { CommentWithAuthor, ContentStorageContract, PublishedPost, PostViewer } from "./storage-contract";

const publicColumns = {
  id: posts.id, title: posts.title, content: posts.content, categoryId: posts.categoryId,
  authorId: posts.authorId, isPublished: posts.isPublished, isHidden: posts.isHidden,
  revision: posts.revision, imageUrls: posts.imageUrls, createdAt: posts.createdAt,
  updatedAt: posts.updatedAt, publishedAt: posts.publishedAt,
  eventType: sql<NoticeType | null>`${posts.eventData}->>'eventType'`, category: categories,
};
const visible = () => and(eq(posts.isPublished, true), eq(posts.isHidden, false));

export class ContentStorage implements ContentStorageContract {
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

  async getPosts(categoryName?: string, limit = 50): Promise<(PublishedPost & { category: Category })[]> {
    const baseCondition = visible();
    const whereCondition = categoryName && categoryName !== 'all'
      ? and(baseCondition, eq(categories.name, categoryName))
      : baseCondition;

    return await db.select(publicColumns)
    .from(posts)
    .innerJoin(categories, eq(posts.categoryId, categories.id))
    .where(whereCondition)
    .orderBy(desc(sql`coalesce(${posts.publishedAt}, ${posts.createdAt})`))
    .limit(limit);
  }

  async getPost(id: number, viewer?: PostViewer): Promise<(PublishedPost & { category: Category }) | undefined> {
    const [result] = await db.select(publicColumns)
    .from(posts)
    .innerJoin(categories, eq(posts.categoryId, categories.id))
    .where(and(eq(posts.id, id), eq(posts.isPublished, true),
      viewer?.isAdmin ? undefined : or(eq(posts.isHidden, false), viewer ? eq(posts.authorId, viewer.id) : undefined)));

    return result || undefined;
  }

  async createPost(insertPost: InsertPost): Promise<Post> {
    const [post] = await db.insert(posts).values({ ...insertPost, content: normalizePostDocument(insertPost.content) }).returning();
    return post;
  }

  async getPostForManagement(id: number): Promise<Post | undefined> {
    const [post] = await db.select().from(posts).where(and(eq(posts.id, id), eq(posts.isPublished, true)));
    return post;
  }

  async getHiddenPosts(viewer: PostViewer, categoryName?: string): Promise<(PublishedPost & { category: Category })[]> {
    return db.select(publicColumns).from(posts).innerJoin(categories, eq(posts.categoryId, categories.id))
      .where(and(eq(posts.isPublished, true), eq(posts.isHidden, true),
        viewer.isAdmin ? undefined : eq(posts.authorId, viewer.id),
        categoryName && categoryName !== "all" ? eq(categories.name, categoryName) : undefined))
      .orderBy(desc(posts.updatedAt)).limit(100);
  }

  async canReadPostAttachment(path: string, viewer: PostViewer): Promise<boolean> {
    const references = await db.select({ authorId: posts.authorId, isHidden: posts.isHidden, isPublished: posts.isPublished })
      .from(posts).where(sql`${path} = ANY(${posts.imageUrls})`);
    // Unattached uploads retain the existing member-only preview boundary.
    return references.length === 0 || references.some(post =>
      viewer.isAdmin || post.authorId === viewer.id || (post.isPublished && !post.isHidden));
  }

  async updatePost(id: number, authorId: number, data: UpdatePost): Promise<Post | undefined> {
    const { revision, ...editable } = data;
    const [post] = await db.update(posts)
      .set({ ...editable, content: normalizePostDocument(data.content), revision: sql`${posts.revision} + 1`, updatedAt: new Date() })
      .where(and(eq(posts.id, id), eq(posts.authorId, authorId), eq(posts.revision, revision),
        eq(posts.isPublished, true), isNull(posts.eventData)))
      .returning();
    return post;
  }

  async deletePost(id: number, authorId: number, revision: number): Promise<boolean> {
    const rows = await db.delete(posts).where(and(eq(posts.id, id), eq(posts.authorId, authorId),
      eq(posts.revision, revision), eq(posts.isPublished, true))).returning({ id: posts.id });
    return rows.length === 1;
  }

  async setPostHidden(id: number, adminId: number, revision: number, isHidden: boolean): Promise<boolean> {
    const rows = await db.update(posts).set({ isHidden, revision: sql`${posts.revision} + 1`, updatedAt: new Date() })
      .where(and(eq(posts.id, id), eq(posts.isPublished, true), eq(posts.revision, revision),
        sql`exists (select 1 from ${users} where ${users.id} = ${adminId} and ${users.isAdmin} = true)`))
      .returning({ id: posts.id });
    return rows.length === 1;
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
    .innerJoin(posts, eq(comments.postId, posts.id))
    .leftJoin(users, eq(comments.authorId, users.id))
    .where(and(eq(comments.postId, postId), visible()))
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

  async createComment(data: { postId: number; authorId: number; content: string }): Promise<Comment | undefined> {
    return db.transaction(async tx => {
      const [parent] = await tx.select({ id: posts.id }).from(posts)
        .where(and(eq(posts.id, data.postId), visible())).for("update");
      if (!parent) return undefined;
      const [comment] = await tx.insert(comments).values(data).returning();
      return comment;
    });
  }

  async deleteComment(id: number): Promise<boolean> {
    const result = await db.delete(comments).where(eq(comments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async searchPosts(query: string): Promise<(PublishedPost & { category: Category })[]> {
    const searchTerm = `%${query}%`;
    return await db.select(publicColumns)
    .from(posts)
    .innerJoin(categories, eq(posts.categoryId, categories.id))
    .where(
      and(
        visible(),
        or(
          like(posts.title, searchTerm),
          like(postBodyTextExpression(), searchTerm)
        )
      )
    )
    .orderBy(desc(sql`coalesce(${posts.publishedAt}, ${posts.createdAt})`))
    .limit(20);
  }
}
