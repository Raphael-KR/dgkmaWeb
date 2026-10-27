export type KakaoUnlinkErrorKind =
  | "already_unlinked"
  | "invalid_response"
  | "kakao_error"
  | "network_error"
  | "response_mismatch";

export class KakaoUnlinkError extends Error {
  constructor(
    public readonly kind: KakaoUnlinkErrorKind,
    public readonly httpStatus?: number,
  ) {
    super("Kakao unlink request failed");
    this.name = "KakaoUnlinkError";
  }
}

type KakaoUnlinkArgs = {
  adminKey: string;
  kakaoId: string;
  kakaoFetch?: typeof fetch;
};

const KAKAO_UNLINK_URL = "https://kapi.kakao.com/v1/user/unlink";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAlreadyUnlinked(status: number, response: unknown): boolean {
  return status === 400 && isRecord(response) && response.code === -101;
}

function getResponseId(response: unknown): string | undefined {
  if (!isRecord(response)) return undefined;
  const { id } = response;
  return typeof id === "string" || typeof id === "number" ? String(id) : undefined;
}

export async function unlinkKakaoUser({
  adminKey,
  kakaoId,
  kakaoFetch = fetch,
}: KakaoUnlinkArgs): Promise<void> {
  let response: Response;

  try {
    response = await kakaoFetch(KAKAO_UNLINK_URL, {
      method: "POST",
      headers: { Authorization: `KakaoAK ${adminKey}` },
      body: new URLSearchParams({
        target_id_type: "user_id",
        target_id: kakaoId,
      }),
    });
  } catch {
    throw new KakaoUnlinkError("network_error");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new KakaoUnlinkError("invalid_response", response.status);
  }

  if (!response.ok) {
    if (isAlreadyUnlinked(response.status, body)) {
      throw new KakaoUnlinkError("already_unlinked", response.status);
    }
    throw new KakaoUnlinkError("kakao_error", response.status);
  }

  const responseId = getResponseId(body);
  if (!responseId) {
    throw new KakaoUnlinkError("invalid_response", response.status);
  }
  if (responseId !== kakaoId) {
    throw new KakaoUnlinkError("response_mismatch", response.status);
  }
}
