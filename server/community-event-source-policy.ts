import type { CommunityEventDraftInput } from "@shared/community-events";
import { assertSafeSourceUrl, EventSourcePolicyError } from "./event-source-policy";

type EventWithSources = {
  sourceUrls?: string[] | null;
  details?: unknown;
};

function canonicalSourceUrl(rawUrl: string): string {
  const url = assertSafeSourceUrl(rawUrl);
  url.hash = "";
  return url.href;
}

function canonicalSourceUrls(rawUrls: readonly string[]): string[] {
  return Array.from(new Set(rawUrls.map(canonicalSourceUrl)));
}

function sourceDetails(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeCommunityEventSources<T extends CommunityEventDraftInput>(data: T): T {
  const sourceUrls = canonicalSourceUrls(data.sourceUrls ?? []);
  const details = sourceDetails(data.details);
  const detailSourceUrl = typeof details.sourceUrl === "string"
    ? canonicalSourceUrl(details.sourceUrl)
    : undefined;

  if (detailSourceUrl && !sourceUrls.includes(detailSourceUrl)) {
    throw new EventSourcePolicyError("부고장 주소는 확인된 출처 목록에 있어야 합니다");
  }

  return {
    ...data,
    sourceUrls,
    details: {
      ...details,
      ...(detailSourceUrl ? { sourceUrl: detailSourceUrl } : {}),
    },
  } as T;
}

export function sanitizeStoredCommunityEventSources<T extends EventWithSources>(event: T): T {
  const sourceUrls = (event.sourceUrls ?? []).flatMap((rawUrl) => {
    try {
      return [canonicalSourceUrl(rawUrl)];
    } catch {
      return [];
    }
  });
  const safeSourceUrls = Array.from(new Set(sourceUrls));
  const details = sourceDetails(event.details);
  const { sourceUrl: rawDetailSourceUrl, ...remainingDetails } = details;
  let detailSourceUrl: string | undefined;

  if (typeof rawDetailSourceUrl === "string") {
    try {
      const canonical = canonicalSourceUrl(rawDetailSourceUrl);
      if (safeSourceUrls.includes(canonical)) detailSourceUrl = canonical;
    } catch {
      // Unsafe legacy links are omitted from member-facing responses.
    }
  }

  return {
    ...event,
    sourceUrls: safeSourceUrls,
    details: {
      ...remainingDetails,
      ...(detailSourceUrl ? { sourceUrl: detailSourceUrl } : {}),
    },
  };
}
