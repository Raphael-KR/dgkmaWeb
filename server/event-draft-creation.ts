import type { CommunityEventDraftInput, CommunityEventType } from "@shared/community-events";
import type { CommunityEvent } from "@shared/schema";

const EVENT_TYPE_LOCK_IDS: Record<CommunityEventType, number> = {
  obituary: 1,
  wedding: 2,
  opening: 3,
  other: 4,
};

export function eventDraftAdvisoryLockId(eventType: CommunityEventType): number {
  return EVENT_TYPE_LOCK_IDS[eventType];
}

export type EventDraftTransaction = {
  lock: (authorId: number, eventType: CommunityEventType) => Promise<void>;
  find: (authorId: number, eventType: CommunityEventType) => Promise<CommunityEvent | undefined>;
  insert: (authorId: number, data: CommunityEventDraftInput) => Promise<CommunityEvent>;
};

export type EventDraftTransactionRunner = <T>(
  work: (transaction: EventDraftTransaction) => Promise<T>,
) => Promise<T>;

export function getOrCreateEventDraft(
  runTransaction: EventDraftTransactionRunner,
  authorId: number,
  data: CommunityEventDraftInput,
): Promise<CommunityEvent> {
  return runTransaction(async (transaction) => {
    await transaction.lock(authorId, data.eventType);
    const existing = await transaction.find(authorId, data.eventType);
    if (existing) return existing;
    return transaction.insert(authorId, data);
  });
}
