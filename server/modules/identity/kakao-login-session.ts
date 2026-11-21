import type { Request, Response } from "express";
import type { User } from "@shared/schema";
import type { RouteContext } from "../../lib/route-context";
import {
  PendingRegistrationConflictError,
  PhoneRegistrationConflictError,
} from "./registration-support";
import { toClientUser } from "./client-user";
import type { KakaoOAuthGeneration } from "./kakao-identity";
import type { KakaoLoginProfile } from "./kakao-profile";
import { regenerateSession, saveSession } from "./session";

export function createKakaoLoginCompletion(
  req: Request,
  res: Response,
  context: RouteContext,
  profile: KakaoLoginProfile,
  oauthGeneration: KakaoOAuthGeneration,
) {
  const { kakaoAuthStorage, isKakaoAdministrator } = context;
  return async (authenticatedUser: User) => {
    const login = {
      ...profile,
      startedAt: oauthGeneration.startedAt,
      grantAdmin:
        !authenticatedUser.isAdmin &&
        authenticatedUser.kakaoId === profile.kakaoId &&
        isKakaoAdministrator(profile.kakaoId),
    };
    try {
      const user = await kakaoAuthStorage.finalizeKakaoLogin(
        authenticatedUser.id,
        login,
        async () => {
          await regenerateSession(req);
          req.session.userId = authenticatedUser.id;
          await saveSession(req);
        },
      );
      return res.json({ user: toClientUser(user) });
    } catch (error) {
      delete req.session.userId;
      const emailConflict =
        error instanceof PendingRegistrationConflictError &&
        error.conflictReason === "email_conflict";
      if (emailConflict || error instanceof PhoneRegistrationConflictError) {
        await saveSession(req);
        return res.status(409).json({
          message: `다른 회원 계정과 ${emailConflict ? "이메일이" : "휴대전화번호가"} 겹칩니다. 관리자에게 확인을 요청해 주세요.`,
        });
      }
      throw error;
    }
  };
}
