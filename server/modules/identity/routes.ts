import type { Express, Request } from "express";
import { randomBytes } from "node:crypto";
import {
  normalizePhoneForComparison,
  PendingRegistrationConflictError,
  PhoneRegistrationConflictError,
  storage,
} from "../../storage";
import { updateProfileSchema, REGION_OPTIONS, type InsertUser, type PendingRegistrationConflictReason, type User } from "@shared/schema";
import { z } from "zod";
import { getErrorType } from "../../lib/safe-logging";
import type { RouteContext } from "../../lib/route-context";
import {
  KakaoOAuthConfigurationError,
  buildKakaoAuthorizeUrl,
  buildKakaoTokenBody,
} from "../../integrations/kakao/kakao-oauth-config";
import { toClientUser } from "./client-user";
import { KakaoAdminConfigurationError } from "../../integrations/kakao/kakao-admin-config";
import { KakaoUnlinkError } from "../../integrations/kakao/kakao-unlink";
import { requestKakaoToken, requestKakaoUser } from "../../integrations/kakao/kakao-client";
import {
  hashKakaoOAuthSessionBinding,
  hashKakaoOAuthState,
  oauthStateHashesMatch,
} from "./kakao-oauth-state";
import { KakaoOAuthTerminatedError, type KakaoOAuthGeneration } from "./kakao-identity";

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
function isKakaoDebugEnabled(): boolean {
  return process.env.DEBUG_KAKAO_AUTH === "true";
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((error) => error ? reject(error) : resolve());
  });
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => error ? reject(error) : resolve());
  });
}

export function registerIdentityRoutes(app: Express, context: RouteContext): void {
  const {
    getKakaoOAuthConfig, kakaoFetch, kakaoAuthStorage, kakaoOAuthStateStore,
    getKakaoAdminConfig, isKakaoAdministrator, getAccountDeletionUser,
    deleteUserAccount, unlinkKakaoUser,
  } = context;

  // Auth routes
  // Simple auth callback for development (Supabase OAuth 사용 안함)
  app.get("/api/auth/callback", async (req, res) => {
    try {
      console.log("Auth callback - redirecting to home");
      return res.redirect(`${process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : ''}/`);
    } catch (error) {
      console.error("Auth callback error:", getErrorType(error));
      return res.redirect(`${process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : ''}/login?error=server_error`);
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", getErrorType(err));
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      console.log("User logged out");
      res.json({ success: true, message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/kakao/start", async (req, res) => {
    try {
      const config = getKakaoOAuthConfig();
      const state = randomBytes(32).toString("hex");
      const stateHash = hashKakaoOAuthState(state);
      const sessionBindingHash = hashKakaoOAuthSessionBinding(req.sessionID);
      const issued = await kakaoOAuthStateStore.issue({ stateHash, sessionBindingHash });
      req.session.kakaoOAuthStateHash = issued.stateHash;
      req.session.kakaoOAuthStartedAt = issued.startedAt.getTime();
      req.session.kakaoOAuthStateExpiresAt = issued.expiresAt.getTime();
      try {
        await saveSession(req);
      } catch (error) {
        delete req.session.kakaoOAuthStateHash;
        delete req.session.kakaoOAuthStartedAt;
        delete req.session.kakaoOAuthStateExpiresAt;
        try {
          await kakaoOAuthStateStore.consume({
            stateHash: issued.stateHash,
            sessionBindingHash: issued.sessionBindingHash,
            startedAt: issued.startedAt,
          });
        } catch (cleanupError) {
          console.error("[Kakao OAuth] state cleanup failed:", getErrorType(cleanupError));
        }
        throw error;
      }
      return res.redirect(buildKakaoAuthorizeUrl(config, state));
    } catch (error) {
      delete req.session.kakaoOAuthStateHash;
      delete req.session.kakaoOAuthStartedAt;
      delete req.session.kakaoOAuthStateExpiresAt;
      if (error instanceof KakaoOAuthConfigurationError) {
        const { missingVariables } = error;
        console.error("[Kakao OAuth] missing configuration:", missingVariables);
        return res.status(500).json({ message: "Kakao 앱 설정 오류" });
      }
      console.error("[Kakao OAuth] authorization start failed:", getErrorType(error));
      return res.status(500).json({ message: "Kakao authorization failed" });
    }
  });

  app.post("/api/auth/kakao/authorize", async (req, res) => {
    try {
      const { code, state } = req.body;
      if (typeof code !== "string" || code.length === 0) {
        return res.status(400).json({ message: "카카오 인가 코드가 필요합니다" });
      }
      const expectedStateHash = req.session.kakaoOAuthStateHash;
      const oauthStartedAt = req.session.kakaoOAuthStartedAt;
      const stateExpiresAt = req.session.kakaoOAuthStateExpiresAt;
      const actualStateHash = typeof state === "string"
        ? hashKakaoOAuthState(state)
        : "";
      const stateMatches = typeof expectedStateHash === "string"
        && oauthStateHashesMatch(expectedStateHash, actualStateHash);
      if (
        !stateMatches
        || typeof oauthStartedAt !== "number"
        || typeof stateExpiresAt !== "number"
        || stateExpiresAt <= Date.now()
      ) {
        return res.status(400).json({ message: "유효하지 않은 카카오 로그인 요청입니다" });
      }
      let stateConsumed: boolean;
      try {
        stateConsumed = await kakaoOAuthStateStore.consume({
          stateHash: actualStateHash,
          sessionBindingHash: hashKakaoOAuthSessionBinding(req.sessionID),
          startedAt: new Date(oauthStartedAt),
        });
      } catch (error) {
        console.error("[Kakao OAuth] atomic state consumption failed:", getErrorType(error));
        return res.status(500).json({ message: "카카오 로그인 요청 처리에 실패했습니다" });
      }
      if (!stateConsumed) {
        return res.status(400).json({ message: "유효하지 않은 카카오 로그인 요청입니다" });
      }
      delete req.session.kakaoOAuthStateHash;
      delete req.session.kakaoOAuthStartedAt;
      delete req.session.kakaoOAuthStateExpiresAt;
      try {
        await saveSession(req);
      } catch (error) {
        console.error("[Kakao OAuth] state consumption failed:", getErrorType(error));
        return res.status(500).json({ message: "카카오 로그인 요청 처리에 실패했습니다" });
      }
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
        console.error('[Kakao OAuth] token exchange failed:', {
          status: tokenRes.status,
        });
        return res.status(400).json({
          message: '카카오 토큰 교환에 실패했습니다',
        });
      }
      if (typeof tokenData?.access_token !== "string") {
        return res.status(400).json({ message: "카카오 토큰 교환에 실패했습니다" });
      }

      const userRes = await requestKakaoUser(tokenData.access_token, kakaoFetch);
      const userInfo = await userRes.json();
      if (!userRes.ok) {
        console.error("[Kakao OAuth] user info request failed:", { status: userRes.status });
        return res.status(400).json({ message: "카카오 회원정보 조회에 실패했습니다" });
      }

      const account = userInfo?.kakao_account;
      if (!account?.email || account.is_email_verified !== true) {
        return res.status(400).json({
          message: "검증된 이메일이 필요합니다",
          description: "카카오 계정에서 검증된 이메일 제공에 동의해주세요."
        });
      }
      if (!account?.phone_number) {
        return res.status(400).json({
          message: "휴대전화번호 동의가 필요합니다",
          description: "본 서비스는 휴대전화번호 제공에 동의한 카카오계정 사용자만 가입 가능합니다. 카카오 로그인 시 휴대전화번호 제공에 동의해주세요."
        });
      }
      if (!account?.name) {
        return res.status(400).json({
          message: "성명 동의가 필요합니다",
          description: "카카오 로그인 시 이름 제공에 동의해주세요."
        });
      }

      const kakaoId = String(userInfo?.id ?? "");
      if (!/^[1-9]\d*$/.test(kakaoId)) {
        return res.status(400).json({ message: "카카오 회원정보 조회에 실패했습니다" });
      }
      const email = account.email as string;
      const name = account.name as string;
      const phoneNumber = account.phone_number as string;
      const profileImage = account.profile?.profile_image_url || null;
      const hasBirthday = typeof account.birthday === "string";
      const birthday = hasBirthday ? account.birthday : null;
      const birthdayType = hasBirthday && ["SOLAR", "LUNAR"].includes(account.birthday_type)
        ? account.birthday_type as "SOLAR" | "LUNAR"
        : null;
      const isLeapMonth = hasBirthday && birthdayType === "LUNAR"
        ? Boolean(account.is_leap_month)
        : hasBirthday ? false : null;
      const oauthGeneration: KakaoOAuthGeneration = {
        kakaoId, email, startedAt: new Date(oauthStartedAt),
      };

      const synchronizeKakaoUser = async (authenticatedUser: User): Promise<User | undefined> => {
        const updates: Partial<InsertUser> = {};
        if (
          !authenticatedUser.isAdmin
          && authenticatedUser.kakaoId === kakaoId
          && isKakaoAdministrator(kakaoId)
        ) updates.isAdmin = true;
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
            synchronizedUser.id, oauthGeneration, saveAuthenticatedSession,
          );
          return res.json({ user: toClientUser(finalizedUser) });
        } catch (error) {
          delete req.session.userId;
          console.error("[Kakao Auth] session save failed:", getErrorType(error));
          throw error;
        }
      };

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
              kakaoId, email, name, profileImage, phoneNumber,
              birthday, birthdayType, isLeapMonth, conflictReason,
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
        return res.status(202).json({ message, description, requiresApproval: true });
      };

      let user = await kakaoAuthStorage.getUserByKakaoId(kakaoId);
      if (!user) {
        const existingUserByEmail = await kakaoAuthStorage.getUserByEmail(email);
        if (existingUserByEmail) {
          return await createPendingReview(
            "email_conflict", "계정 정보 확인이 필요합니다",
            "같은 이메일의 기존 회원 정보가 있어 관리자 확인 후 이용할 수 있습니다.",
          );
        } else {
          const existingUserByPhone = await kakaoAuthStorage.getUserByNormalizedPhone(phoneNumber);
          if (existingUserByPhone) {
            return await createPendingReview(
              "phone_conflict", "동문 정보 확인이 필요합니다",
              "같은 전화번호의 기존 회원 정보가 있어 관리자 확인 후 이용할 수 있습니다.",
            );
          }
          const normalizedPhone = normalizePhoneForComparison(phoneNumber);
          const alumniMatches = (await kakaoAuthStorage.findAlumniByName(name))
            .filter((alumni) => normalizePhoneForComparison(alumni.mobile ?? "") === normalizedPhone);
          const alumniMatch = alumniMatches.length === 1 ? alumniMatches[0] : undefined;
          if (!alumniMatch) {
            return await createPendingReview(
              "not_found", "가입 신청이 접수되었습니다",
              "동문 정보를 확인한 뒤 관리자가 가입을 처리합니다.",
            );
          }
          if (alumniMatch.matchedUserId !== null) {
            return await createPendingReview(
              "alumni_claimed", "동문 정보 확인이 필요합니다",
              "이미 연결된 동문 정보입니다. 관리자 확인 후 이용할 수 있습니다.",
            );
          }
          try {
            user = await kakaoAuthStorage.createUserWithAlumniClaim(
              {
                kakaoId, email, name, profileImage, phoneNumber,
                birthday, birthdayType, isLeapMonth,
                graduationYear: alumniMatch.graduationDate
                  ? parseInt(alumniMatch.graduationDate.substring(0, 4), 10) || null
                  : null,
                isVerified: true,
                kakaoSyncEnabled: true,
              },
              name, phoneNumber, oauthGeneration.startedAt,
            );
          } catch (error) {
            if (
              error instanceof PendingRegistrationConflictError
              && error.conflictReason === "email_conflict"
            ) {
              return await createPendingReview(
                "email_conflict", "계정 정보 확인이 필요합니다",
                "가입 처리 중 같은 이메일의 기존 회원 정보가 확인되어 관리자 확인이 필요합니다.",
              );
            }
            if (error instanceof PhoneRegistrationConflictError) {
              return await createPendingReview(
                "phone_conflict", "동문 정보 확인이 필요합니다",
                "가입 처리 중 같은 전화번호가 확인되어 관리자 확인이 필요합니다.",
              );
            }
            throw error;
          }
          if (!user) {
            return await createPendingReview(
              "alumni_race", "동문 정보 확인이 필요합니다",
              "동문 정보 연결을 완료하지 못했습니다. 관리자 확인 후 이용할 수 있습니다.",
            );
          }
        }
      }
      if (!user) {
        return res.status(500).json({ message: "사용자 생성에 실패했습니다" });
      }
      return await completeKakaoLogin(user);
    } catch (error) {
      if (error instanceof KakaoOAuthTerminatedError) {
        delete req.session.userId;
        return res.status(409).json({
          message: "종료된 로그인 요청입니다. 카카오 로그인을 다시 시작해주세요",
        });
      }
      if (error instanceof KakaoOAuthConfigurationError) {
        const { missingVariables } = error;
        console.error("[Kakao OAuth] missing configuration:", missingVariables);
        return res.status(500).json({ message: "Kakao 앱 설정 오류" });
      }
      console.error('Kakao OAuth authorize error:', getErrorType(error));
      return res.status(500).json({ message: 'Kakao authorization failed' });
    }
  });

  // v5 — 활동 지역(시/도) 입력 (온보딩 분기). 401 (no session) / 400 (invalid region).
  app.post("/api/users/activity-region", async (req, res) => {
    // safe log — DEBUG_KAKAO_AUTH=true 일 때만 출력. 민감 정보 제외, 세션/페이로드 형태만.
    if (isKakaoDebugEnabled()) {
      console.log("[ActivityRegion] save request:", {
        hasSession: !!req.session,
        sessionId: req.sessionID ? "present" : "missing",
        bodyKeys: Object.keys(req.body ?? {}),
      });
    }
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    // body 필드명: activityRegion(권장) 또는 region(하위호환) 둘 다 허용.
    const region = req.body?.activityRegion ?? req.body?.region;
    if (!REGION_OPTIONS.includes(region)) {
      return res.status(400).json({ message: "Invalid region" });
    }
    // ⚠️ update 대상은 반드시 req.session.userId — body 로 userId 받지 않음 (보안).
    const updated = await storage.updateUser(req.session.userId, { activityRegion: region });
    if (!updated) {
      return res.status(500).json({ message: "지역 저장에 실패했습니다" });
    }
    res.json({ user: toClientUser(updated) });
  });

  app.get("/api/auth/me", async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await kakaoAuthStorage.getUser(userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    return res.json({ user: toClientUser(user) });
  });

  // 본인 프로필 수정 — 스키마에서 허용한 필드만 반영.
  // ⚠️ 대상은 항상 req.session.userId — body 로 userId 받지 않음(보안).
  app.patch("/api/users/me", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const data = updateProfileSchema.parse(req.body);
      const updated = await storage.updateUser(req.session.userId, data);
      if (!updated) {
        return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
      }
      res.json({ user: toClientUser(updated) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "입력값이 올바르지 않습니다", errors: error.errors });
      }
      res.status(500).json({ message: "프로필 저장에 실패했습니다" });
    }
  });

  app.delete("/api/users/me", async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: "로그인이 필요합니다" });
    }
    if (req.body?.confirmation !== "탈퇴") {
      return res.status(400).json({ message: "확인 문구로 '탈퇴'를 입력해주세요" });
    }
    let user: User | undefined;
    try {
      user = await getAccountDeletionUser(userId);
    } catch (error) {
      console.error("Account deletion user lookup failed:", getErrorType(error));
      return res.status(500).json({
        message: "회원 탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요",
      });
    }
    if (!user) {
      return res.status(401).json({ message: "로그인이 필요합니다" });
    }
    try {
      await deleteUserAccount(user, async (lockedUser) => {
        if (!lockedUser.kakaoId) return;
        const { adminKey } = getKakaoAdminConfig();
        try {
          await unlinkKakaoUser({ adminKey, kakaoId: lockedUser.kakaoId });
        } catch (error) {
          if (!(error instanceof KakaoUnlinkError && error.kind === "already_unlinked")) {
            throw error;
          }
        }
      });
    } catch (error) {
      if (error instanceof KakaoAdminConfigurationError) {
        console.error("Kakao unlink blocked account deletion:", getErrorType(error));
        return res.status(500).json({
          message: "회원 탈퇴 설정 오류입니다. 관리자에게 문의해주세요",
        });
      }
      if (error instanceof KakaoUnlinkError) {
        console.error("Kakao unlink blocked account deletion:", getErrorType(error));
        return res.status(502).json({
          message: "카카오 연결 해제에 실패했습니다. 잠시 후 다시 시도해주세요",
        });
      }
      console.error("Local account deletion failed:", getErrorType(error));
      return res.status(500).json({
        message: "회원 탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요",
      });
    }
    req.session.destroy((error) => {
      if (error) {
        console.error("Account deletion session cleanup failed:", getErrorType(error));
      }
      res.clearCookie("connect.sid");
      return res.json({ success: true });
    });
  });
}
