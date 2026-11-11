import type { Request, Response } from "express";
import type { PendingRegistrationConflictReason } from "@shared/schema";
import {
  normalizePhoneForComparison,
  PendingRegistrationConflictError,
  PhoneRegistrationConflictError,
} from "../../storage";
import type { RouteContext } from "../../lib/route-context";
import type { KakaoOAuthGeneration } from "./kakao-identity";
import type { KakaoLoginProfile } from "./kakao-profile";
import { createKakaoLoginCompletion } from "./kakao-login-session";
import { saveSession } from "./session";

export async function completeKakaoAuthorization(
  req: Request,
  res: Response,
  context: RouteContext,
  profile: KakaoLoginProfile,
  oauthGeneration: KakaoOAuthGeneration,
) {
  const { kakaoAuthStorage } = context;
  const { kakaoId, email, name, profileImage, phoneNumber, birthday, birthdayType, isLeapMonth } =
    profile;
  const completeKakaoLogin = createKakaoLoginCompletion(
    req,
    res,
    context,
    profile,
    oauthGeneration,
  );

  const createPendingReview = async (
    conflictReason: PendingRegistrationConflictReason,
    message: string,
    description: string,
  ) => {
    const result = await kakaoAuthStorage.createOrRefreshPendingRegistration(
      {
        kakaoId,
        email,
        name,
        userData: {
          kakaoId,
          email,
          name,
          profileImage,
          phoneNumber,
          birthday,
          birthdayType,
          isLeapMonth,
          conflictReason,
        },
      },
      oauthGeneration.startedAt,
    );
    if (result.kind === "registered") {
      return await completeKakaoLogin(result.user);
    }
    if (req.session.userId !== undefined) {
      delete req.session.userId;
      await saveSession(req);
    }
    const rejected = result.registration.status === "rejected";
    return res.status(202).json({
      message: rejected ? "가입 승인이 거부되었습니다" : message,
      description: rejected
        ? "관리자의 재심사 후 다시 승인받아야 이용할 수 있습니다."
        : description,
      requiresApproval: true,
    });
  };

  let user = await kakaoAuthStorage.getUserByKakaoId(kakaoId);
  if (user && !user.isVerified) {
    return createPendingReview(
      "approval_cancelled",
      "가입 승인 대기 중입니다",
      "기존 계정은 보존되어 있으며 관리자 승인 후 이용할 수 있습니다.",
    );
  }
  if (!user) {
    const existingUserByEmail = await kakaoAuthStorage.getUserByEmail(email);
    if (existingUserByEmail) {
      return await createPendingReview(
        "email_conflict",
        "계정 정보 확인이 필요합니다",
        "같은 이메일의 기존 회원 정보가 있어 관리자 확인 후 이용할 수 있습니다.",
      );
    } else {
      const existingUserByPhone = await kakaoAuthStorage.getUserByNormalizedPhone(phoneNumber);
      if (existingUserByPhone) {
        return await createPendingReview(
          "phone_conflict",
          "동문 정보 확인이 필요합니다",
          "같은 전화번호의 기존 회원 정보가 있어 관리자 확인 후 이용할 수 있습니다.",
        );
      }
      const normalizedPhone = normalizePhoneForComparison(phoneNumber);
      const alumniMatches = (await kakaoAuthStorage.findAlumniByName(name)).filter(
        (alumni) => normalizePhoneForComparison(alumni.mobile ?? "") === normalizedPhone,
      );
      const alumniMatch = alumniMatches.length === 1 ? alumniMatches[0] : undefined;
      if (!alumniMatch) {
        return await createPendingReview(
          "not_found",
          "가입 신청이 접수되었습니다",
          "동문 정보를 확인한 뒤 관리자가 가입을 처리합니다.",
        );
      }
      if (alumniMatch.matchedUserId !== null) {
        return await createPendingReview(
          "alumni_claimed",
          "동문 정보 확인이 필요합니다",
          "이미 연결된 동문 정보입니다. 관리자 확인 후 이용할 수 있습니다.",
        );
      }
      try {
        user = await kakaoAuthStorage.createUserWithAlumniClaim(
          {
            kakaoId,
            email,
            name,
            profileImage,
            phoneNumber,
            birthday,
            birthdayType,
            isLeapMonth,
            graduationYear: alumniMatch.graduationDate
              ? parseInt(alumniMatch.graduationDate.substring(0, 4), 10) || null
              : null,
            isVerified: true,
            kakaoSyncEnabled: true,
          },
          name,
          phoneNumber,
          oauthGeneration.startedAt,
        );
      } catch (error) {
        if (
          error instanceof PendingRegistrationConflictError &&
          error.conflictReason === "email_conflict"
        ) {
          return await createPendingReview(
            "email_conflict",
            "계정 정보 확인이 필요합니다",
            "가입 처리 중 같은 이메일의 기존 회원 정보가 확인되어 관리자 확인이 필요합니다.",
          );
        }
        if (error instanceof PhoneRegistrationConflictError) {
          return await createPendingReview(
            "phone_conflict",
            "동문 정보 확인이 필요합니다",
            "가입 처리 중 같은 전화번호가 확인되어 관리자 확인이 필요합니다.",
          );
        }
        throw error;
      }
      if (!user) {
        return await createPendingReview(
          "alumni_race",
          "동문 정보 확인이 필요합니다",
          "동문 정보 연결을 완료하지 못했습니다. 관리자 확인 후 이용할 수 있습니다.",
        );
      }
    }
  }
  return await completeKakaoLogin(user);
}
