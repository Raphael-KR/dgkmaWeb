import { emptyPostDocument, type PostDocument } from "@shared/contracts/post-document";
import { posts, categories, type Post } from "../../db/schema";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { noticeCategory, type NoticeData, type NoticeType } from "@shared/contracts/notices";
import type { EventsStorageContract } from "./storage-contract";

export class EventsStorage implements EventsStorageContract {
  async getNoticeDraft(authorId: number, type: NoticeType): Promise<Post> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`notice:${authorId}:${type}`}, 0))`);
      const [existing] = await tx.select().from(posts).where(and(
        eq(posts.authorId, authorId), eq(posts.isPublished, false),
        sql`${posts.eventData}->>'eventType' = ${type}`,
      ));
      if (existing) return existing;
      const [category] = await tx.select().from(categories).where(and(
        eq(categories.name, noticeCategory(type)), eq(categories.isActive, true),
      ));
      if (!category) throw new Error("Notice category unavailable");
      const [draft] = await tx.insert(posts).values({
        title: "", content: emptyPostDocument(), authorId, categoryId: category.id, isPublished: false,
        sourceText: "", eventData: { schemaVersion: 1, eventType: type, facts: null, questions: [], sources: [] },
      }).returning();
      return draft;
    });
  }
  async getOwnNotice(id: number, authorId: number): Promise<Post | undefined> {
    const [row] = await db.select().from(posts).where(and(eq(posts.id, id), eq(posts.authorId, authorId)));
    return row?.eventData ? row : undefined;
  }
  async saveNotice(id: number, authorId: number, revision: number, data: {
    sourceText?: string; eventData: NoticeData; title: string; content: PostDocument;
  }): Promise<Post | undefined> {
    const [row] = await db.update(posts).set({ ...data, revision: sql`${posts.revision} + 1`, updatedAt: new Date() })
      .where(and(eq(posts.id, id), eq(posts.authorId, authorId), eq(posts.revision, revision), eq(posts.isPublished, false)))
      .returning();
    return row;
  }
  async publishNotice(id: number, authorId: number, revision: number): Promise<Post | undefined> {
    const [row] = await db.update(posts).set({
      isPublished: true, publishedAt: new Date(), updatedAt: new Date(), sourceText: null,
      revision: sql`${posts.revision} + 1`,
    }).where(and(eq(posts.id, id), eq(posts.authorId, authorId), eq(posts.revision, revision), eq(posts.isPublished, false)))
      .returning();
    return row;
  }
  async deleteNoticeDraft(id: number, authorId: number, revision: number): Promise<boolean> {
    const rows = await db.delete(posts).where(and(
      eq(posts.id, id), eq(posts.authorId, authorId), eq(posts.revision, revision), eq(posts.isPublished, false),
      sql`${posts.eventData} IS NOT NULL`,
    )).returning({ id: posts.id });
    return rows.length === 1;
  }
  async updatePublishedNotice(id: number, authorId: number, revision: number, data: {
    eventData: NoticeData; title: string; content: PostDocument;
  }): Promise<Post | undefined> {
    const [row] = await db.update(posts).set({ ...data, sourceText: null,
      revision: sql`${posts.revision} + 1`, updatedAt: new Date(),
    }).where(and(eq(posts.id, id), eq(posts.authorId, authorId), eq(posts.revision, revision),
      eq(posts.isPublished, true), sql`${posts.eventData} IS NOT NULL`)).returning();
    return row;
  }
}
