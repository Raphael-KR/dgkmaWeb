export const AUTH_RETURN_PATH_KEY = "auth:returnTo";

export function consumeAuthReturnPath(): string {
  let destination = "/";
  try {
    const stored = sessionStorage.getItem(AUTH_RETURN_PATH_KEY);
    if (stored && stored.startsWith("/") && !stored.startsWith("//")) {
      destination = stored;
    }
    sessionStorage.removeItem(AUTH_RETURN_PATH_KEY);
  } catch {
    // 저장소 접근에 실패해도 이미 확인한 경로 또는 기본 홈으로 이동한다.
  }
  return destination;
}
