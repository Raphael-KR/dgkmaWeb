const base = "/api/posts/notices";
export async function requestNoticeDraft<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(base + path, {
    method,
    credentials: "include",
    signal,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "요청을 처리하지 못했습니다.");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
