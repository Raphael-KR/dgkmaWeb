import type { PendingRegistration } from "@shared/schema";

export class InvalidPendingKakaoIdError extends Error {
  constructor() {
    super("The pending registration has no trustworthy Kakao user id.");
    this.name = "InvalidPendingKakaoIdError";
  }
}

export function getPendingKakaoId(registration: PendingRegistration): string {
  const data = registration.userData;
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new InvalidPendingKakaoIdError();
  const kakaoId = (data as Record<string, unknown>).kakaoId;
  if (
    typeof kakaoId !== "string" ||
    !/^[1-9]\d*$/.test(kakaoId) ||
    kakaoId !== registration.kakaoId
  ) {
    throw new InvalidPendingKakaoIdError();
  }
  return kakaoId;
}
