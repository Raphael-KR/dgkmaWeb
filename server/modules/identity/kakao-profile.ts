import type { Response } from "express";
import type { PendingRegistrationUserData } from "@shared/contracts";
import type { RouteContext } from "../../lib/route-context";
import { buildKakaoTokenBody } from "../../integrations/kakao/kakao-oauth-config";
import { requestKakaoToken, requestKakaoUser } from "../../integrations/kakao/kakao-client";
import { isKakaoDebugEnabled } from "./session";

export type KakaoLoginProfile = Omit<PendingRegistrationUserData, "conflictReason">;

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
  if (!account?.email || account.is_email_verified !== true) {
    res.status(400).json({
      message: "검증된 이메일이 필요합니다",
      description: "카카오 계정에서 검증된 이메일 제공에 동의해주세요.",
    });
    return;
  }
  if (!account?.phone_number) {
    res.status(400).json({
      message: "휴대전화번호 동의가 필요합니다",
      description:
        "본 서비스는 휴대전화번호 제공에 동의한 카카오계정 사용자만 가입 가능합니다. 카카오 로그인 시 휴대전화번호 제공에 동의해주세요.",
    });
    return;
  }
  if (!account?.name) {
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
  const email = account.email as string;
  const name = account.name as string;
  const phoneNumber = account.phone_number as string;
  const profileImage = account.profile?.profile_image_url || null;
  const hasBirthday = typeof account.birthday === "string";
  const birthday = hasBirthday ? account.birthday : null;
  const birthdayType =
    hasBirthday && ["SOLAR", "LUNAR"].includes(account.birthday_type)
      ? (account.birthday_type as "SOLAR" | "LUNAR")
      : null;
  const isLeapMonth =
    hasBirthday && birthdayType === "LUNAR"
      ? Boolean(account.is_leap_month)
      : hasBirthday
        ? false
        : null;
  return { kakaoId, email, name, phoneNumber, profileImage, birthday, birthdayType, isLeapMonth };
}
