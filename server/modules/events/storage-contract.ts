import type { CommunityEvent, Obituary, InsertObituary } from "@shared/schema";
import type { CommunityEventDraftInput, CommunityEventPublishInput, CommunityEventType } from "@shared/community-events";

export interface EventsStorageContract {
  getObituaries(): Promise<Obituary[]>;
  getObituary(id: number): Promise<Obituary | undefined>;
  createObituary(data: InsertObituary & { authorId?: number }): Promise<Obituary>;
  getPublishedEvents(eventType?: CommunityEventType): Promise<CommunityEvent[]>;
  getPublishedEvent(id: number): Promise<CommunityEvent | undefined>;
  getEventDraft(id: number, authorId: number): Promise<CommunityEvent | undefined>;
  getLatestEventDraft(authorId: number, eventType: CommunityEventType): Promise<CommunityEvent | undefined>;
  createEventDraft(authorId: number, data: CommunityEventDraftInput): Promise<CommunityEvent>;
  updateEventDraft(id: number, authorId: number, data: CommunityEventDraftInput): Promise<CommunityEvent | undefined>;
  deleteEventDraft(id: number, authorId: number): Promise<boolean>;
  publishEvent(id: number, authorId: number, data: CommunityEventPublishInput): Promise<CommunityEvent | undefined>;
}
