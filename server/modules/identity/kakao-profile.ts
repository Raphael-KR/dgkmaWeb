import { z } from "zod";
import type { Response } from "express";
import type { PendingRegistrationUserData } from "@shared/contracts";
import type { RouteContext } from "../../lib/route-context";
import { buildKakaoTokenBody } from "../../integrations/kakao/kakao-oauth-config";
import { requestKakaoToken, requestKakaoUser } from "../../integrations/kakao/kakao-client";
import { isKakaoDebugEnabled } from "./session";

export type KakaoLoginProfile = Omit<PendingRegistrationUserData, "conflictReason"> & {
  photoNeedsAgreement: boolean;
  birthdayNeedsAgreement: boolean;
};

const emailSchema = z.string().trim().email();
const photoSchema = z
  .string()
  .url()
  .regex(/^https?:\/\//i);

function readBirthday(value: unknown, type: KakaoLoginProfile["birthdayType"]): string | null {
  if (typeof value !== "string" || !/^\d{4}$/.test(value)) return null;
  const month = Number(value.slice(0, 2));
  const day = Number(value.slice(2));
  if (month < 1 || month > 12 || day < 1) return null;
  // 음력에는 2월 30일도 있다. 양력은 윤년을 기준으로 2월 29일까지 허용한다.
  const lastDay = type === "LUNAR" ? 30 : new Date(Date.UTC(2000, month, 0)).getUTCDate();
  return day <= lastDay ? value : null;
}

export async function readKakaoProfile(
  code: string,
  res: Response,
  context: RouteContext,
): Promise<KakaoLoginProfile | undefined> {
  const { getKakaoOAuthConfig, kakaoFetch } = context;
  const config = getKakaoOAuthConfig();
  const params = buildKakaoTokenBody(config, code);

  if (isKakaoDebugEnabled()) {
    console.log("[Kakao OAuth] configuration:", {
      environment: config.environment,
      redirectUri: config.redirectUri,
      hasClientSecret: true,
    });
  }

  const tokenRes = await requestKakaoToken(params, kakaoFetch);
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    console.error("[Kakao OAuth] token exchange failed:", {
      status: tokenRes.status,
    });
    res.status(400).json({
      message: "카카오 토큰 교환에 실패했습니다",
    });
    return;
  }
  if (typeof tokenData?.access_token !== "string") {
    res.status(400).json({ message: "카카오 토큰 교환에 실패했습니다" });
    return;
  }

  const userRes = await requestKakaoUser(tokenData.access_token, kakaoFetch);
  const userInfo = await userRes.json();
  if (!userRes.ok) {
    console.error("[Kakao OAuth] user info request failed:", { status: userRes.status });
    res.status(400).json({ message: "카카오 회원정보 조회에 실패했습니다" });
    return;
  }

  const account = userInfo?.kakao_account;
  const email = emailSchema.safeParse(account?.email);
  if (!email.success || account.is_email_verified !== true || account.is_email_valid === false) {
    res.status(400).json({
      message: "검증된 이메일이 필요합니다",
      description: "카카오 계정에서 검증된 이메일 제공에 동의해주세요.",
    });
    return;
  }
  const phoneNumber = typeof account.phone_number === "string" ? account.phone_number.trim() : "";
  if (!/^\+?[\d ()-]+$/.test(phoneNumber) || !/^\d{4,15}$/.test(phoneNumber.replace(/\D/g, ""))) {
    res.status(400).json({
      message: "휴대전화번호 동의가 필요합니다",
      description:
        "본 서비스는 휴대전화번호 제공에 동의한 카카오계정 사용자만 가입 가능합니다. 카카오 로그인 시 휴대전화번호 제공에 동의해주세요.",
    });
    return;
  }
  const name = typeof account.name === "string" ? account.name.trim() : "";
  if (!name) {
    res.status(400).json({
      message: "성명 동의가 필요합니다",
      description: "카카오 로그인 시 이름 제공에 동의해주세요.",
    });
    return;
  }

  const kakaoId = String(userInfo?.id ?? "");
  if (!/^[1-9]\d*$/.test(kakaoId)) {
    res.status(400).json({ message: "카카오 회원정보 조회에 실패했습니다" });
    return;
  }
  const photoNeedsAgreement = account.profile_image_needs_agreement === true;
  const birthdayNeedsAgreement = account.birthday_needs_agreement === true;
  const photo = photoSchema.safeParse(account.profile?.profile_image_url);
  const profileImage = !photoNeedsAgreement && photo.success ? photo.data : null;
  const calendar = account.birthday_type;
  const type = calendar === "SOLAR" || calendar === "LUNAR" ? calendar : null;
  const birthday = birthdayNeedsAgreement ? null : readBirthday(account.birthday, type);
  const birthdayType = birthday ? type : null;
  const isLeapMonth =
    birthdayType === "SOLAR"
      ? false
      : birthdayType === "LUNAR" && typeof account.is_leap_month === "boolean"
        ? account.is_leap_month
        : null;
  return {
    kakaoId,
    email: email.data,
    name,
    phoneNumber,
    profileImage,
    birthday,
    birthdayType,
    isLeapMonth,
    photoNeedsAgreement,
    birthdayNeedsAgreement,
  };
}
