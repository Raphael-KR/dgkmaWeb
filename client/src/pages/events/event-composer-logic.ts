import type { CommunityEventDraftInput, CommunityEventType } from "@shared/community-events";
import { missingFieldLabel } from "./obituary-preview-logic";

const URL_PATTERN = /https?:\/\/[^\s]+/g;

type DraftResultAcceptanceInput = {
  activeEventType: CommunityEventType;
  activeGeneration: number;
  requestEventType: CommunityEventType;
  requestGeneration: number;
};

type SubmitGateInput = {
  eventType: CommunityEventType;
  isBusy: boolean;
  isPreviewCurrent: boolean;
  isPublishResolutionPending: boolean;
};

export function canSubmitCommunityEvent({
  eventType,
  isBusy,
  isPreviewCurrent,
  isPublishResolutionPending,
}: SubmitGateInput): boolean {
  if (isBusy) return false;
  if (isPublishResolutionPending) return true;
  return eventType !== "obituary" || isPreviewCurrent;
}

export function canApplyDraftResult(input: DraftResultAcceptanceInput) {
  return input.activeEventType === input.requestEventType
    && input.activeGeneration === input.requestGeneration;
}

export function hasMeaningfulDraftInput(input: object) {
  const hasValue = (value: unknown): boolean => {
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number") return true;
    if (Array.isArray(value)) return value.some(hasValue);
    if (value && typeof value === "object") return Object.values(value).some(hasValue);
    return false;
  };

  return Object.entries(input).some(([key, value]) => key !== "eventType" && hasValue(value));
}

function hasDraftValue(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  return value !== undefined && value !== null;
}

export function mergeMissingDraftValues<T extends object>(current: T, parsed: Partial<T>): T {
  const next = { ...current } as Record<string, unknown>;
  Object.entries(parsed).forEach(([key, value]) => {
    if (!hasDraftValue(next[key]) && hasDraftValue(value)) next[key] = value;
  });
  return next as T;
}

export function mergeParsedEventDraft(
  current: CommunityEventDraftInput,
  parsed: CommunityEventDraftInput,
): CommunityEventDraftInput {
  const common = mergeMissingDraftValues(current, parsed);
  const details = mergeMissingDraftValues(
    current.details as Record<string, unknown>,
    parsed.details as Record<string, unknown>,
  );

  return {
    ...common,
    eventType: current.eventType,
    sourceText: current.sourceText,
    sourceUrls: parsed.sourceUrls,
    details,
  } as CommunityEventDraftInput;
}

function valueAtPath(input: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!isRecord(value)) return undefined;
    return value[key];
  }, input);
}

function hasResolvedParseValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

export function remainingParseMissingFields(missingFields: string[], draft: unknown): string[] {
  return missingFields.filter((field) => !hasResolvedParseValue(valueAtPath(draft, field)));
}

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
  return event?.status === "published" ? "published" : "ambiguous";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function publishErrorReason(body: unknown): string {
  if (!isRecord(body) || typeof body.message !== "string" || !body.message.trim()) {
    return "게시 요청이 거절되었습니다.";
  }
  return body.message.trim();
}

export class ConclusivePublishError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(publishErrorReason(body));
  }
}

export function conclusivePublishErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof ConclusivePublishError)) return undefined;
  const reason = publishErrorReason(error.body);
  if (!isRecord(error.body) || !Array.isArray(error.body.missingFields)) return reason;
  const labels = Array.from(new Set(error.body.missingFields
    .filter((field): field is string => typeof field === "string")
    .map(missingFieldLabel)));
  return labels.length > 0 ? `${reason} (${labels.join(", ")})` : reason;
}

export async function requestEventPublish(
  fetcher: (url: string, init?: RequestInit) => Promise<Response>,
  draftId: number,
  payload: unknown,
): Promise<void> {
  const response = await fetcher(`/api/events/${draftId}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (response.ok) return;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (response.status >= 400 && response.status < 500 && response.status !== 408) {
    throw new ConclusivePublishError(response.status, body);
  }
  throw new Error(publishErrorReason(body));
}

export type FormErrorEntry = {
  message: string;
  path: string;
};

export function collectFormErrorEntries(errors: unknown): FormErrorEntry[] {
  const entries: FormErrorEntry[] = [];

  const visit = (value: unknown, path: string[]) => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.message === "string" && path.length > 0) {
      entries.push({ message: record.message, path: path.join(".") });
      return;
    }

    Object.entries(record).forEach(([key, child]) => {
      if (key !== "ref" && key !== "type" && key !== "types") visit(child, [...path, key]);
    });
  };

  visit(errors, []);
  return entries;
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
  } catch (error) {
    if (error instanceof ConclusivePublishError) throw error;
    let recoveredEvent: { status?: unknown } | undefined;
    try {
      recoveredEvent = await getEvent(knownDraftId);
    } catch {
      recoveredEvent = undefined;
    }
    return { draftId: knownDraftId, outcome: classifyPublishRecovery(recoveredEvent) };
  }
}
