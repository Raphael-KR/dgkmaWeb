import {
  communityEventDraftSchema,
  type CommunityEventDraftInput,
  type CommunityEventType,
} from "@shared/community-events";

export type DraftFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type EventDraftRecord = CommunityEventDraftInput & { id: number };

type RecoveryAcceptanceInput = {
  activeEventType: CommunityEventType;
  activeGeneration: number;
  currentFingerprint: string;
  isDirty: boolean;
  requestEventType: CommunityEventType;
  requestGeneration: number;
  responseEventType: CommunityEventType;
  startFingerprint: string;
};

type SaveEventDraftInput = {
  draftId?: number;
  eventType: CommunityEventType;
  fetcher: DraftFetcher;
  payload: CommunityEventDraftInput;
};

type DraftReadinessInput = {
  getDraftId: () => number | undefined;
  getSavePromise: () => Promise<void>;
  recoveryPromise: Promise<void>;
};

type ImmediateSaveRetryInput = {
  currentRevision: number;
  hasMeaningfulInput: boolean;
};

export function publishResolutionLock(
  outcome: "published" | "ambiguous",
  draftId: number,
): number | undefined {
  return outcome === "ambiguous" ? draftId : undefined;
}

export function shouldResumeAutosave(publishResolutionId: number | undefined): boolean {
  return publishResolutionId === undefined;
}

export function clearedDraftFailureState() {
  return {
    errorKind: undefined,
    errorMessage: undefined,
    recoveryFailed: false,
    status: "idle" as const,
  };
}

export function planImmediateSaveRetry({ currentRevision, hasMeaningfulInput }: ImmediateSaveRetryInput) {
  return {
    revision: currentRevision + 1,
    shouldSave: hasMeaningfulInput,
    status: hasMeaningfulInput ? "saving" as const : "idle" as const,
  };
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, normalize(child)]));
  }
  return value;
}

export function draftFingerprint(value: unknown) {
  return JSON.stringify(normalize(value)) ?? "undefined";
}

export function shouldApplyRecoveredDraft(input: RecoveryAcceptanceInput) {
  return input.activeEventType === input.requestEventType
    && input.activeGeneration === input.requestGeneration
    && input.responseEventType === input.requestEventType
    && !input.isDirty
    && input.currentFingerprint === input.startFingerprint;
}

async function errorMessage(response: Response, fallback: string) {
  try {
    const body = await response.json() as { message?: unknown };
    return typeof body.message === "string" ? body.message : fallback;
  } catch {
    return fallback;
  }
}

async function parseDraftResponse(response: Response, eventType: CommunityEventType) {
  const rawDraft = await response.json() as { id?: unknown; eventType?: unknown };
  const parsedDraft = communityEventDraftSchema.safeParse(rawDraft);
  if (
    !parsedDraft.success
    || typeof rawDraft.id !== "number"
    || rawDraft.id <= 0
    || parsedDraft.data.eventType !== eventType
  ) {
    throw new Error("임시 저장 내용의 유형 또는 형식이 올바르지 않습니다.");
  }
  return { ...parsedDraft.data, id: rawDraft.id } as EventDraftRecord;
}

function requestInit(method: "GET" | "POST" | "PATCH", payload?: CommunityEventDraftInput): RequestInit {
  return {
    method,
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    credentials: "include",
  };
}

export async function fetchLatestEventDraft(
  fetcher: DraftFetcher,
  eventType: CommunityEventType,
  signal?: AbortSignal,
) {
  const response = await fetcher(`/api/events/drafts/latest?type=${encodeURIComponent(eventType)}`, {
    ...requestInit("GET"),
    signal,
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(await errorMessage(response, "임시 저장 내용을 불러오지 못했습니다."));
  return parseDraftResponse(response, eventType);
}

async function createDraft(
  fetcher: DraftFetcher,
  eventType: CommunityEventType,
  payload: CommunityEventDraftInput,
) {
  const response = await fetcher("/api/events/drafts", requestInit("POST", payload));
  if (!response.ok) throw new Error(await errorMessage(response, "임시 저장에 실패했습니다."));
  return parseDraftResponse(response, eventType);
}

async function patchDraft(
  fetcher: DraftFetcher,
  draftId: number,
  payload: CommunityEventDraftInput,
) {
  const response = await fetcher(`/api/events/drafts/${draftId}`, requestInit("PATCH", payload));
  return response;
}

export async function saveEventDraftWithFallback({
  draftId,
  eventType,
  fetcher,
  payload,
}: SaveEventDraftInput) {
  const parsedPayload = communityEventDraftSchema.safeParse(payload);
  if (!parsedPayload.success || parsedPayload.data.eventType !== eventType) {
    throw new Error("임시 저장할 내용의 유형 또는 형식이 올바르지 않습니다.");
  }
  const safePayload = parsedPayload.data;

  if (!draftId) {
    const latestDraft = await fetchLatestEventDraft(fetcher, eventType);
    if (!latestDraft) return createDraft(fetcher, eventType, safePayload);

    const latestPatch = await patchDraft(fetcher, latestDraft.id, safePayload);
    if (!latestPatch.ok) throw new Error(await errorMessage(latestPatch, "임시 저장에 실패했습니다."));
    return parseDraftResponse(latestPatch, eventType);
  }

  const initialPatch = await patchDraft(fetcher, draftId, safePayload);
  if (initialPatch.ok) return parseDraftResponse(initialPatch, eventType);
  if (initialPatch.status !== 404) {
    throw new Error(await errorMessage(initialPatch, "임시 저장에 실패했습니다."));
  }

  const latestDraft = await fetchLatestEventDraft(fetcher, eventType);
  if (!latestDraft) return createDraft(fetcher, eventType, safePayload);

  const retryPatch = await patchDraft(fetcher, latestDraft.id, safePayload);
  if (!retryPatch.ok) throw new Error(await errorMessage(retryPatch, "임시 저장에 실패했습니다."));
  return parseDraftResponse(retryPatch, eventType);
}

export async function waitForDraftReadiness({
  getDraftId,
  getSavePromise,
  recoveryPromise,
}: DraftReadinessInput) {
  await recoveryPromise;
  await getSavePromise();
  return getDraftId();
}
