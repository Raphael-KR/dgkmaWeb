import type { Request, Response } from "express";
import type { InsertUser, User } from "@shared/schema";
import type { RouteContext } from "../../lib/route-context";
import { getErrorType } from "../../lib/safe-logging";
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
  const { kakaoId, profileImage, phoneNumber, birthday, birthdayType, isLeapMonth } = profile;
  const synchronizeKakaoUser = async (authenticatedUser: User): Promise<User | undefined> => {
    const updates: Partial<InsertUser> = {};
    if (
      !authenticatedUser.isAdmin &&
      authenticatedUser.kakaoId === kakaoId &&
      isKakaoAdministrator(kakaoId)
    )
      updates.isAdmin = true;
    if (!authenticatedUser.kakaoSyncEnabled) updates.kakaoSyncEnabled = true;
    if (authenticatedUser.profileImage !== profileImage) updates.profileImage = profileImage;
    if (phoneNumber && !authenticatedUser.phoneNumber) updates.phoneNumber = phoneNumber;
    if (authenticatedUser.birthday !== birthday) updates.birthday = birthday;
    if (authenticatedUser.birthdayType !== birthdayType) updates.birthdayType = birthdayType;
    if (authenticatedUser.isLeapMonth !== isLeapMonth) updates.isLeapMonth = isLeapMonth;
    if (Object.keys(updates).length === 0) return authenticatedUser;
    return kakaoAuthStorage.updateUser(authenticatedUser.id, updates, oauthGeneration);
  };

  const completeKakaoLogin = async (authenticatedUser: User) => {
    const synchronizedUser = await synchronizeKakaoUser(authenticatedUser);
    if (!synchronizedUser) {
      return res.status(500).json({ message: "사용자 정보 갱신에 실패했습니다" });
    }
    try {
      const saveAuthenticatedSession = async () => {
        await regenerateSession(req);
        req.session.userId = synchronizedUser.id;
        await saveSession(req);
      };
      const finalizedUser = await kakaoAuthStorage.finalizeKakaoLogin(
        synchronizedUser.id,
        oauthGeneration,
        saveAuthenticatedSession,
      );
      return res.json({ user: toClientUser(finalizedUser) });
    } catch (error) {
      delete req.session.userId;
      console.error("[Kakao Auth] session save failed:", getErrorType(error));
      throw error;
    }
  };

  return completeKakaoLogin;
}
