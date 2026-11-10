import type { Request } from "express";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    kakaoOAuthStateHash?: string;
    kakaoOAuthStartedAt?: number;
    kakaoOAuthStateExpiresAt?: number;
  }
}

// 카카오 인증/온보딩 디버그 로그 게이팅. 운영 환경에서는 기본 OFF.
// 실패/에러 로그는 게이팅과 무관하게 항상 출력.
export function isKakaoDebugEnabled(): boolean {
  return process.env.DEBUG_KAKAO_AUTH === "true";
}

export function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}
