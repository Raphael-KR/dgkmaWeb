export class KakaoGroupConfigurationError extends Error {
  constructor(public readonly reason: "missing" | "invalid") {
    super("Kakao group invitation configuration is unavailable");
    this.name = "KakaoGroupConfigurationError";
  }
}

// Read only on an authorized request; never put the invitation in shared/client code.
export function getKakaoGroupInviteUrl(): string {
  const value = process.env.KAKAO_RIGHTS_GROUP_INVITE_URL?.trim();
  if (!value) throw new KakaoGroupConfigurationError("missing");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new KakaoGroupConfigurationError("invalid");
  }
  if (
    url.origin !== "https://invite.kakao.com" ||
    url.username ||
    url.password ||
    !/^\/tc\/[A-Za-z0-9_-]+$/.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new KakaoGroupConfigurationError("invalid");
  }
  return url.href;
}
