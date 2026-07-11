export type EventDetailFetcher = (url: string, init?: RequestInit) => Promise<Response>;

class EventDetailRequestError extends Error {
  constructor(readonly status: number) {
    super("경조사 상세를 불러오지 못했습니다.");
  }
}

export async function loadCommunityEventDetail<T>(
  fetcher: EventDetailFetcher,
  id: string,
): Promise<T> {
  const response = await fetcher(`/api/events/${id}`, { credentials: "include" });
  if (!response.ok) throw new EventDetailRequestError(response.status);
  return response.json() as Promise<T>;
}

export function classifyEventDetailError(error: unknown): "not-found" | "transient" {
  return error instanceof EventDetailRequestError && error.status === 404
    ? "not-found"
    : "transient";
}

export function safeExternalHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? trimmed : undefined;
  } catch {
    return undefined;
  }
}
