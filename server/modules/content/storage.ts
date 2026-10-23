import {
  users, posts, categories, comments,
  type Post, type InsertPost, type Category, type InsertCategory, type Comment,
} from "@shared/schema";
import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { db } from "../../db";
import type { CommentWithAuthor, ContentStorageContract } from "./storage-contract";

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
}
