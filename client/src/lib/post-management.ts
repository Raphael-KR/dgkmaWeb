import { queryClient } from "./queryClient";

export async function postRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { method, credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.message === "string" ? error.message : "게시글 요청에 실패했습니다.");
  }
  return response.status === 204 ? undefined as T : response.json();
}
export function refreshPosts() {
  return queryClient.invalidateQueries({ predicate: query =>
    typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/posts"),
  });
}
