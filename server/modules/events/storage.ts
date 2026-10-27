import { communityEvents, obituaries, type CommunityEvent, type Obituary, type InsertObituary } from "@shared/schema";
import type { CommunityEventDraftInput, CommunityEventPublishInput, CommunityEventType } from "@shared/community-events";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { eventDraftAdvisoryLockId, getOrCreateEventDraft } from "./event-draft-creation";
import type { EventsStorageContract } from "./storage-contract";

export class EventsStorage implements EventsStorageContract {
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

  async getPublishedEvents(eventType?: CommunityEventType): Promise<CommunityEvent[]> {
    const condition = eventType
      ? and(eq(communityEvents.status, "published"), eq(communityEvents.eventType, eventType))
      : eq(communityEvents.status, "published");
    return await db.select().from(communityEvents)
      .where(condition)
      .orderBy(desc(communityEvents.publishedAt));
  }

  async getPublishedEvent(id: number): Promise<CommunityEvent | undefined> {
    const [event] = await db.select().from(communityEvents)
      .where(and(eq(communityEvents.id, id), eq(communityEvents.status, "published")));
    return event || undefined;
  }

  async getEventDraft(id: number, authorId: number): Promise<CommunityEvent | undefined> {
    const [event] = await db.select().from(communityEvents)
      .where(and(
        eq(communityEvents.id, id),
        eq(communityEvents.authorId, authorId),
        eq(communityEvents.status, "draft"),
      ));
    return event || undefined;
  }

  async getLatestEventDraft(authorId: number, eventType: CommunityEventType): Promise<CommunityEvent | undefined> {
    const [event] = await db.select().from(communityEvents)
      .where(and(
        eq(communityEvents.authorId, authorId),
        eq(communityEvents.eventType, eventType),
        eq(communityEvents.status, "draft"),
      ))
      .orderBy(desc(communityEvents.updatedAt))
      .limit(1);
    return event || undefined;
  }

  async createEventDraft(authorId: number, data: CommunityEventDraftInput): Promise<CommunityEvent> {
    return getOrCreateEventDraft(
      (work) => db.transaction(async (tx) => work({
        lock: async (lockedAuthorId, eventType) => {
          await tx.execute(sql`
            select pg_advisory_xact_lock(
              ${lockedAuthorId},
              ${eventDraftAdvisoryLockId(eventType)}
            )
          `);
        },
        find: async (draftAuthorId, eventType) => {
          const [existing] = await tx.select().from(communityEvents)
            .where(and(
              eq(communityEvents.authorId, draftAuthorId),
              eq(communityEvents.eventType, eventType),
              eq(communityEvents.status, "draft"),
            ))
            .orderBy(desc(communityEvents.updatedAt))
            .limit(1);
          return existing || undefined;
        },
        update: async (id, draftAuthorId, eventType, draftData) => {
          const [updated] = await tx.update(communityEvents)
            .set({ ...draftData, updatedAt: new Date() })
            .where(and(
              eq(communityEvents.id, id),
              eq(communityEvents.authorId, draftAuthorId),
              eq(communityEvents.eventType, eventType),
              eq(communityEvents.status, "draft"),
            ))
            .returning();
          if (!updated) throw new Error("임시 저장된 소식을 갱신하지 못했습니다.");
          return updated;
        },
        insert: async (draftAuthorId, draftData) => {
          const [created] = await tx.insert(communityEvents)
            .values({ ...draftData, authorId: draftAuthorId })
            .returning();
          return created;
        },
      })),
      authorId,
      data,
    );
  }

  async updateEventDraft(
    id: number,
    authorId: number,
    data: CommunityEventDraftInput,
  ): Promise<CommunityEvent | undefined> {
    const [event] = await db.update(communityEvents)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(communityEvents.id, id),
        eq(communityEvents.authorId, authorId),
        eq(communityEvents.status, "draft"),
      ))
      .returning();
    return event || undefined;
  }

  async deleteEventDraft(id: number, authorId: number): Promise<boolean> {
    const result = await db.delete(communityEvents).where(and(
      eq(communityEvents.id, id),
      eq(communityEvents.authorId, authorId),
      eq(communityEvents.status, "draft"),
    ));
    return (result.rowCount ?? 0) > 0;
  }

  async publishEvent(
    id: number,
    authorId: number,
    data: CommunityEventPublishInput,
  ): Promise<CommunityEvent | undefined> {
    const now = new Date();
    const [event] = await db.update(communityEvents)
      .set({ ...data, status: "published", publishedAt: now, updatedAt: now })
      .where(and(
        eq(communityEvents.id, id),
        eq(communityEvents.authorId, authorId),
        eq(communityEvents.status, "draft"),
      ))
      .returning();
    if (event) return event;

    const [published] = await db.select().from(communityEvents)
      .where(and(
        eq(communityEvents.id, id),
        eq(communityEvents.authorId, authorId),
        eq(communityEvents.status, "published"),
      ));
    return published || undefined;
  }
}
