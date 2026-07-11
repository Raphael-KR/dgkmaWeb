import type { CommunityEventType } from "@shared/community-events";

const URL_PATTERN = /https?:\/\/[^\s]+/g;

export function splitEventSource(sourceText: string) {
  return {
    sourceUrls: sourceText.match(URL_PATTERN)?.slice(0, 3) ?? [],
    textOnly: sourceText.replace(URL_PATTERN, " ").trim(),
  };
}

type ParseAcceptanceInput = {
  activeToken: number;
  currentEventType: CommunityEventType;
  currentSourceText: string;
  requestEventType: CommunityEventType;
  requestSourceText: string;
  requestToken: number;
};

export function canApplyParsedSource(input: ParseAcceptanceInput) {
  return input.requestToken === input.activeToken
    && input.requestEventType === input.currentEventType
    && input.requestSourceText === input.currentSourceText;
}

export function classifyPublishRecovery(event: { status?: unknown } | undefined) {
  return event?.status === "published" ? "published" : "retain-draft";
}

type PublishDraftWithRecoveryInput<T> = {
  createDraft: (payload: T) => Promise<{ id: number }>;
  getEvent: (draftId: number) => Promise<{ status?: unknown }>;
  payload: T;
  publishDraft: (draftId: number, payload: T) => Promise<void>;
  rememberDraftId: (draftId: number) => void;
  draftId?: number;
};

export async function publishDraftWithRecovery<T>({
  createDraft,
  draftId,
  getEvent,
  payload,
  publishDraft,
  rememberDraftId,
}: PublishDraftWithRecoveryInput<T>) {
  let knownDraftId = draftId;
  if (!knownDraftId) {
    const draft = await createDraft(payload);
    knownDraftId = draft.id;
    rememberDraftId(knownDraftId);
  }

  try {
    await publishDraft(knownDraftId, payload);
    return { draftId: knownDraftId, outcome: "published" as const };
  } catch {
    let recoveredEvent: { status?: unknown } | undefined;
    try {
      recoveredEvent = await getEvent(knownDraftId);
    } catch {
      recoveredEvent = undefined;
    }
    return { draftId: knownDraftId, outcome: classifyPublishRecovery(recoveredEvent) };
  }
}
