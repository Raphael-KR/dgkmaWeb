import { createHmac } from "node:crypto";
import { resolveSessionSecret } from "./session-secret";

export type KakaoOAuthGeneration = {
  kakaoId: string;
  email: string;
  startedAt: Date;
};

export class KakaoOAuthTerminatedError extends Error {
  constructor() {
    super("The Kakao OAuth generation was terminated.");
    this.name = "KakaoOAuthTerminatedError";
  }
}

function hashKakaoIdentityKey(
  kind: "kakao" | "email",
  value: string,
  secret: string = resolveSessionSecret(),
): string {
  return createHmac("sha256", secret)
    .update(`${kind}:${value}`, "utf8")
    .digest("hex");
}

export function hashKakaoIdentity(
  kakaoId: string,
  secret: string = resolveSessionSecret(),
): string {
  return hashKakaoIdentityKey("kakao", kakaoId, secret);
}

export function hashKakaoEmailIdentity(
  email: string,
  secret: string = resolveSessionSecret(),
): string {
  return hashKakaoIdentityKey("email", email.trim().toLowerCase(), secret);
}
