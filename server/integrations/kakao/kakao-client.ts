// Keep transport separate from identity/session policy. Responses are deliberately
// returned unread: the caller retains the historical JSON/status/error ordering.
export function requestKakaoToken(
  params: URLSearchParams,
  kakaoFetch: typeof fetch,
): Promise<Response> {
  return kakaoFetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
}

export function requestKakaoUser(
  accessToken: string,
  kakaoFetch: typeof fetch,
): Promise<Response> {
  return kakaoFetch("https://kapi.kakao.com/v2/user/me?secure_resource=true", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
