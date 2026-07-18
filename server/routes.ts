import type { Express, Request, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { randomBytes } from "node:crypto";
import {
  AlumniSyncBlockedError,
  AlumniSyncFingerprintMismatchError,
  AlumniSyncInProgressError,
  normalizePhoneForComparison,
  PendingRegistrationConflictError,
  PhoneRegistrationConflictError,
  storage,
} from "./storage";
import { insertPostSchema, insertCommentSchema, insertPaymentSchema, insertCategorySchema, updateProfileSchema, REGION_OPTIONS, type CommunityEvent, type InsertUser, type PendingRegistration, type PendingRegistrationConflictReason, type User } from "@shared/schema";
import {
  COMMUNITY_EVENT_TYPES,
  communityEventDraftSchema,
  communityEventPublishSchema,
  type CommunityEventDraftInput,
  type CommunityEventPublishInput,
} from "@shared/community-events";
import { z } from "zod";
import { parseObituaryEventSource, parseObituarySms } from "./obituary-parser";
import { createEventParseLimiter } from "./event-parse-limiter";
import { readEventSources } from "./event-source-reader";
import {
  normalizeCommunityEventSources,
  sanitizeStoredCommunityEventSources,
} from "./community-event-source-policy";
import { EventSourcePolicyError } from "./event-source-policy";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage/routes";
import {
  createRequireAdmin,
  requireAuthenticated,
  type AdminUserLookup,
} from "./auth-middleware";
import { getErrorType } from "./safe-logging";
import {
  KakaoOAuthConfigurationError,
  buildKakaoAuthorizeUrl,
  buildKakaoTokenBody,
  resolveKakaoOAuthConfig,
  type KakaoOAuthConfig,
} from "./kakao-oauth-config";
import { isSelectablePostCategory } from "@shared/category-policy";
import { renderObituaryAnnouncement } from "@shared/obituary-announcement";
import { assembleObituaryPreview, parseStoredObituaryDraft } from "./obituary-preview";
import { toClientUser } from "./client-user";
import {
  KakaoAdminConfigurationError,
  resolveKakaoAdminConfig,
  type KakaoAdminConfig,
} from "./kakao-admin-config";
import {
  KakaoUnlinkError,
  unlinkKakaoUser as unlinkKakaoUserFromKakao,
} from "./kakao-unlink";
import {
  hashKakaoOAuthSessionBinding,
  hashKakaoOAuthState,
  kakaoOAuthStateStore as postgresKakaoOAuthStateStore,
  oauthStateHashesMatch,
  type KakaoOAuthStateStore,
} from "./kakao-oauth-state";
import { toAdminPendingRegistrationDto } from "./admin-pending-registration";
import {
  KakaoOAuthTerminatedError,
  type KakaoOAuthGeneration,
} from "./kakao-identity";
import { isConfiguredKakaoAdministrator } from "./kakao-admin-allowlist";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    kakaoOAuthStateHash?: string;
    kakaoOAuthStartedAt?: number;
    kakaoOAuthStateExpiresAt?: number;
  }
}

const POSTGRES_SERIAL_MAX = 2_147_483_647;

function parsePositiveInteger(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= POSTGRES_SERIAL_MAX ? parsed : undefined;
}

const adminPendingRegistrationUpdateSchema = z.object({
  params: z.object({
    id: z.string().refine((value) => parsePositiveInteger(value) !== undefined),
  }).strict(),
  body: z.object({
    status: z.enum(["approved", "rejected"]),
  }).strict(),
});

const alumniSyncApplySchema = z.object({
  fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();

const eventParseRequestSchema = z.object({
  eventType: z.enum(COMMUNITY_EVENT_TYPES),
  input: z.string().min(1).max(20_000),
}).strict();

type RouteEventSourceReader = (
  input: string,
  signal?: AbortSignal,
) => ReturnType<typeof readEventSources>;

export function createDefaultEventSourceReader(
  sourceReader: typeof readEventSources = readEventSources,
): RouteEventSourceReader {
  return (input, signal) => sourceReader(input, undefined, signal);
}

function sanitizePublishedEvent(event: CommunityEvent) {
  const safeEvent = sanitizeStoredCommunityEventSources(event);
  const { sourceText: _sourceText, ...publishedEvent } = safeEvent;
  return publishedEvent;
}

type TrustedObituaryAssembly =
  | { kind: "invalid"; missingFields: string[] }
  | { kind: "missing"; missingFields: string[] }
  | {
    kind: "ready";
    input: NonNullable<ReturnType<typeof assembleObituaryPreview>["input"]>;
    text: string;
  };

async function assembleTrustedObituary(
  draft: CommunityEvent,
  userId: number,
): Promise<TrustedObituaryAssembly> {
  const validatedDraft = parseStoredObituaryDraft(draft);
  if (!validatedDraft.draft) {
    return { kind: "invalid", missingFields: validatedDraft.missingFields };
  }

  const [user, alumni, membership] = await Promise.all([
    storage.getUser(userId),
    storage.getAlumniRecordByUserId(userId),
    storage.getMembershipStatus(userId),
  ]);
  const preview = assembleObituaryPreview({ draft: validatedDraft.draft, user, alumni, membership });
  if (!preview.input) {
    return { kind: "missing", missingFields: preview.missingFields };
  }

  return {
    kind: "ready",
    input: preview.input,
    text: renderObituaryAnnouncement(preview.input),
  };
}

// 카카오 인증/온보딩 디버그 로그 게이팅. 운영 환경에서는 기본 OFF.
//   - DEBUG_KAKAO_AUTH=true → 상세 로그 ON (성공 경로 포함).
//   - 미설정/false           → 성공 경로의 디버그 로그 미출력.
//   - 실패/에러 로그(token exchange failed, session save failed 등)는 게이팅과 무관하게 항상 출력.
function isKakaoDebugEnabled(): boolean {
  return process.env.DEBUG_KAKAO_AUTH === "true";
}

export type RouteDependencies = {
  getUserForAdmin?: AdminUserLookup;
  getKakaoOAuthConfig?: () => KakaoOAuthConfig;
  kakaoFetch?: typeof fetch;
  getKakaoAdminConfig?: () => KakaoAdminConfig;
  getAccountDeletionUser?: (userId: number) => Promise<User | undefined>;
  deleteUserAccount?: (
    user: Pick<User, "id" | "kakaoId" | "email">,
    beforeDelete?: (user: User) => Promise<void>,
  ) => Promise<void>;
  unlinkKakaoUser?: typeof unlinkKakaoUserFromKakao;
  pendingRegistrationStorage?: Partial<Pick<
    typeof storage,
    "rejectPendingRegistration" | "updatePendingRegistrationStatus"
  >>;
  alumniSyncStorage?: Pick<typeof storage, "previewAlumniSync" | "applyAlumniSync">;
  kakaoOAuthStateStore?: KakaoOAuthStateStore;
  kakaoAuthStorage?: Pick<
    typeof storage,
    | "getUser"
    | "getUserByEmail"
    | "getUserByKakaoId"
    | "getUserByNormalizedPhone"
    | "findAlumniByName"
    | "createUser"
    | "createUserWithAlumniClaim"
    | "updateUser"
    | "claimAlumniRecord"
    | "createOrRefreshPendingRegistration"
    | "finalizeKakaoLogin"
  >;
  readEventSources?: RouteEventSourceReader;
  eventParseTimeoutMs?: number;
  eventParseLimiter?: RequestHandler;
  isKakaoAdministrator?: (kakaoId: string) => boolean;
};

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((error) => error ? reject(error) : resolve());
  });
}

class InvalidPendingKakaoIdError extends Error {
  constructor() {
    super("The pending registration has no trustworthy Kakao user id.");
    this.name = "InvalidPendingKakaoIdError";
  }
}

function getPendingKakaoId(registration: PendingRegistration): string {
  const userData = registration.userData;
  if (!userData || typeof userData !== "object" || Array.isArray(userData)) {
    throw new InvalidPendingKakaoIdError();
  }
  const kakaoId = (userData as Record<string, unknown>).kakaoId;
  if (
    typeof kakaoId !== "string"
    || !/^[1-9]\d*$/.test(kakaoId)
    || kakaoId !== registration.kakaoId
  ) {
    throw new InvalidPendingKakaoIdError();
  }
  return kakaoId;
}

export async function registerRoutes(
  app: Express,
  dependencies: RouteDependencies = {},
): Promise<Server> {
  const getUserForAdmin = dependencies.getUserForAdmin
    ?? ((userId: number) => storage.getUser(userId));
  const requireAdmin = createRequireAdmin(getUserForAdmin);
  const getKakaoOAuthConfig =
    dependencies.getKakaoOAuthConfig ?? (() => resolveKakaoOAuthConfig());
  const kakaoFetch = dependencies.kakaoFetch ?? fetch;
  const kakaoAuthStorage = dependencies.kakaoAuthStorage ?? storage;
  const pendingRegistrationStorage = {
    rejectPendingRegistration: dependencies.pendingRegistrationStorage?.rejectPendingRegistration
      ?? storage.rejectPendingRegistration.bind(storage),
    updatePendingRegistrationStatus: dependencies.pendingRegistrationStorage?.updatePendingRegistrationStatus
      ?? storage.updatePendingRegistrationStatus.bind(storage),
  };
  const alumniSyncStorage = dependencies.alumniSyncStorage ?? storage;
  const kakaoOAuthStateStore = dependencies.kakaoOAuthStateStore
    ?? postgresKakaoOAuthStateStore;
  const getKakaoAdminConfig = dependencies.getKakaoAdminConfig
    ?? (() => resolveKakaoAdminConfig());
  const isKakaoAdministrator = dependencies.isKakaoAdministrator
    ?? isConfiguredKakaoAdministrator;
  const getAccountDeletionUser = dependencies.getAccountDeletionUser
    ?? ((userId: number) => storage.getUser(userId));
  const deleteUserAccount = dependencies.deleteUserAccount
    ?? ((
      user: Pick<User, "id" | "kakaoId" | "email">,
      beforeDelete?: (user: User) => Promise<void>,
    ) => storage.deleteUserAccount(user, beforeDelete));
  const unlinkKakaoUser = dependencies.unlinkKakaoUser ?? unlinkKakaoUserFromKakao;
  const readSources = dependencies.readEventSources ?? createDefaultEventSourceReader();
  const eventParseLimiter = dependencies.eventParseLimiter
    ?? createEventParseLimiter({ windowMs: 60_000, max: 10 });
  const eventParseTimeoutMs = dependencies.eventParseTimeoutMs ?? 15_000;

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

      const tokenRes = await kakaoFetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
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

      const userRes = await kakaoFetch('https://kapi.kakao.com/v2/user/me?secure_resource=true', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
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
        kakaoId,
        email,
        startedAt: new Date(oauthStartedAt),
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
        return kakaoAuthStorage.updateUser(
          authenticatedUser.id,
          updates,
          oauthGeneration,
        );
      };

      const completeKakaoLogin = async (authenticatedUser: User) => {
        const synchronizedUser = await synchronizeKakaoUser(authenticatedUser);
        if (!synchronizedUser) {
          return res.status(500).json({ message: "사용자 정보 갱신에 실패했습니다" });
        }

        try {
          const saveAuthenticatedSession = async () => {
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
        return res.status(202).json({ message, description, requiresApproval: true });
      };

      let user = await kakaoAuthStorage.getUserByKakaoId(kakaoId);

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
          const alumniMatches = (await kakaoAuthStorage.findAlumniByName(name))
            .filter((alumni) => normalizePhoneForComparison(alumni.mobile ?? "") === normalizedPhone);
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
              error instanceof PendingRegistrationConflictError
              && error.conflictReason === "email_conflict"
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
    // ⚠️ DB 컬럼은 users.activityRegion (snake: activity_region).
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
      if (data.activityRegion != null && !REGION_OPTIONS.includes(data.activityRegion as any)) {
        return res.status(400).json({ message: "유효하지 않은 활동지역입니다" });
      }
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

  // 권리회원 등급/회비 납부 현황 — 세션 기준 본인만 조회.
  app.get("/api/membership/status", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const status = await storage.getMembershipStatus(req.session.userId);
      res.json(status);
    } catch (error) {
      console.error("Membership status error:", getErrorType(error));
      res.status(500).json({ message: "회원 등급 조회에 실패했습니다" });
    }
  });

  // Categories routes
  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post("/api/categories", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }

      const viewer = await storage.getUser(userId);
      if (!viewer?.isAdmin) {
        return res.status(403).json({ message: "관리자 권한이 필요합니다" });
      }

      const validatedData = insertCategorySchema.parse(req.body);
      const category = await storage.createCategory(validatedData);
      res.status(201).json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  // Posts routes
  app.get("/api/posts", async (req, res) => {
    try {
      const { category, limit } = req.query;
      const posts = await storage.getPosts(
        category as string, 
        limit ? parseInt(limit as string) : undefined
      );
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch posts" });
    }
  });

  // Search posts (must be before the /:id route)
  app.get("/api/posts/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.trim() === "") {
        return res.json([]);
      }

      const posts = await storage.searchPosts(query);
      res.json(posts);
    } catch (error) {
      console.error("Search error:", getErrorType(error));
      res.status(500).json({ 
        message: "Failed to search posts", 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/posts/:id", async (req, res) => {
    try {
      const post = await storage.getPost(parseInt(req.params.id));
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      res.json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch post" });
    }
  });

  app.post("/api/posts", async (req, res) => {
    try {
      // 로그인 필수 + authorId 는 세션에서만 (body 의 authorId 스푸핑 방지).
      if (!req.session?.userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const { authorId: _ignoredAuthorId, ...rest } = req.body ?? {};
      const validatedData = insertPostSchema.parse(rest);
      const category = validatedData.categoryId == null
        ? undefined
        : await storage.getCategory(validatedData.categoryId);
      if (!isSelectablePostCategory(category)) {
        return res.status(400).json({ message: "게시글 카테고리를 선택해주세요" });
      }
      // 첨부 이미지 경로는 오브젝트 스토리지 상대경로만 허용 (외부 URL <img src> 주입 차단).
      if (
        validatedData.imageUrls &&
        !validatedData.imageUrls.every((u) => /^\/objects\//.test(u))
      ) {
        return res.status(400).json({ message: "잘못된 첨부 이미지 경로입니다" });
      }
      const post = await storage.createPost({
        ...validatedData,
        authorId: req.session.userId,
      });
      res.status(201).json(post);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create post" });
    }
  });

  // 게시글 댓글 목록 — GET 게시글과 동일 정책(비게이팅). 회원 전용 접근은 클라이언트 라우트가 담당.
  app.get("/api/posts/:postId/comments", async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      if (Number.isNaN(postId)) {
        return res.status(400).json({ message: "잘못된 게시글입니다" });
      }
      const list = await storage.getCommentsByPost(postId);
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "댓글을 불러오지 못했습니다" });
    }
  });

  // 댓글 작성 — 로그인 필수. authorId 는 세션, postId 는 URL 에서만 채움.
  app.post("/api/posts/:postId/comments", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const postId = parseInt(req.params.postId);
      if (Number.isNaN(postId)) {
        return res.status(400).json({ message: "잘못된 게시글입니다" });
      }
      const post = await storage.getPost(postId);
      if (!post) {
        return res.status(404).json({ message: "게시글을 찾을 수 없습니다" });
      }
      const { content } = insertCommentSchema.parse(req.body);
      const comment = await storage.createComment({
        postId,
        authorId: req.session.userId,
        content,
      });
      res.status(201).json(comment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "댓글 작성에 실패했습니다" });
    }
  });

  // 댓글 삭제 — 작성자 본인 또는 관리자만.
  app.delete("/api/comments/:id", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const id = parseInt(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: "잘못된 댓글입니다" });
      }
      const comment = await storage.getComment(id);
      if (!comment) {
        return res.status(404).json({ message: "댓글을 찾을 수 없습니다" });
      }
      if (comment.authorId !== userId) {
        const viewer = await storage.getUser(userId);
        if (!viewer?.isAdmin) {
          return res.status(403).json({ message: "권한이 없습니다" });
        }
      }
      await storage.deleteComment(id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "댓글 삭제에 실패했습니다" });
    }
  });

  app.use("/api/obituary", requireAuthenticated);
  app.use("/api/obituaries", requireAuthenticated);

  // Obituary URL parsing route
  app.post("/api/obituary/parse", (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ message: "text 필드가 필요합니다" });
      }
      const parsed = parseObituarySms(text);
      res.json(parsed);
    } catch (error) {
      res.status(500).json({ message: "부고 문자 분석에 실패했습니다" });
    }
  });

  app.get("/api/obituaries", async (req, res) => {
    try {
      const list = await storage.getObituaries();
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "부고 목록 조회에 실패했습니다" });
    }
  });

  app.get("/api/obituaries/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: "잘못된 부고입니다" });
      }
      const obituary = await storage.getObituary(id);
      if (!obituary) {
        return res.status(404).json({ message: "부고를 찾을 수 없습니다" });
      }
      res.json(obituary);
    } catch (error) {
      res.status(500).json({ message: "부고 조회에 실패했습니다" });
    }
  });

  app.post("/api/obituaries", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const obituary = await storage.createObituary({
        ...req.body,
        authorId: req.session.userId,
      });
      res.status(201).json(obituary);
    } catch (error) {
      res.status(500).json({ message: "부고 등록에 실패했습니다" });
    }
  });

  app.post("/api/events/parse", requireAuthenticated, eventParseLimiter, async (req, res) => {
    const controller = new AbortController();
    let timedOut = false;
    const onDisconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once("aborted", onDisconnect);
    res.once("close", onDisconnect);
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, eventParseTimeoutMs);

    try {
      const { eventType, input } = eventParseRequestSchema.parse(req.body);
      const sourceResult = await readSources(input, controller.signal);
      const fetchedSourceUrls = sourceResult.sources
        .filter((source) => source.status === "fetched")
        .map((source) => source.url);

      if (eventType === "obituary") {
        const parsed = parseObituaryEventSource(sourceResult.combinedText);
        const sourceUrl = fetchedSourceUrls[0];
        return res.json({
          draft: {
            ...parsed.draft,
            sourceText: input,
            sourceUrls: fetchedSourceUrls,
            details: {
              ...parsed.draft.details,
              ...(sourceUrl ? { sourceUrl } : {}),
            },
          },
          missingFields: parsed.missingFields,
          sources: sourceResult.sources,
        });
      }

      return res.json({
        draft: {
          eventType,
          sourceText: input,
          sourceUrls: fetchedSourceUrls,
          details: { memo: sourceResult.combinedText.slice(0, 5_000) },
        },
        missingFields: [],
        sources: sourceResult.sources,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 요청입니다", errors: error.errors });
      }
      if (timedOut) {
        return res.status(504).json({ message: "분석 시간이 초과되었습니다" });
      }
      if (controller.signal.aborted) return;
      return res.status(500).json({ message: "소식 초안 분석에 실패했습니다" });
    } finally {
      clearTimeout(timeout);
      req.removeListener("aborted", onDisconnect);
      res.removeListener("close", onDisconnect);
    }
  });

  app.use("/api/events", requireAuthenticated);

  app.get("/api/events/drafts/latest", async (req, res) => {
    try {
      const eventType = z.enum(COMMUNITY_EVENT_TYPES).parse(req.query.type);
      const event = await storage.getLatestEventDraft(req.session.userId!, eventType);
      if (!event) {
        return res.status(404).json({ message: "임시 저장된 소식을 찾을 수 없습니다" });
      }
      res.json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 요청입니다", errors: error.errors });
      }
      res.status(500).json({ message: "임시 저장된 소식 조회에 실패했습니다" });
    }
  });

  app.post("/api/events/drafts", async (req, res) => {
    try {
      const data = normalizeCommunityEventSources(communityEventDraftSchema.parse(req.body));
      const event = await storage.createEventDraft(req.session.userId!, data);
      res.status(201).json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 요청입니다", errors: error.errors });
      }
      if (error instanceof EventSourcePolicyError) {
        return res.status(400).json({ message: "공개 링크 형식을 확인해주세요" });
      }
      res.status(500).json({ message: "임시 저장된 소식 작성에 실패했습니다" });
    }
  });

  app.patch("/api/events/drafts/:id", async (req, res) => {
    try {
      const id = parsePositiveInteger(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "잘못된 소식입니다" });
      }
      const data = normalizeCommunityEventSources(communityEventDraftSchema.parse(req.body));
      const event = await storage.updateEventDraft(id, req.session.userId!, data);
      if (!event) {
        return res.status(404).json({ message: "임시 저장된 소식을 찾을 수 없습니다" });
      }
      res.json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 요청입니다", errors: error.errors });
      }
      if (error instanceof EventSourcePolicyError) {
        return res.status(400).json({ message: "공개 링크 형식을 확인해주세요" });
      }
      res.status(500).json({ message: "임시 저장된 소식 수정에 실패했습니다" });
    }
  });

  app.delete("/api/events/drafts/:id", async (req, res) => {
    try {
      const id = parsePositiveInteger(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "잘못된 소식입니다" });
      }
      const deleted = await storage.deleteEventDraft(id, req.session.userId!);
      if (!deleted) {
        return res.status(404).json({ message: "임시 저장된 소식을 찾을 수 없습니다" });
      }
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "임시 저장된 소식 삭제에 실패했습니다" });
    }
  });

  app.post("/api/events/:id/preview", async (req, res) => {
    try {
      const id = parsePositiveInteger(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "잘못된 소식입니다" });
      }
      const userId = req.session.userId!;
      const draft = await storage.getEventDraft(id, userId);
      if (!draft || draft.eventType !== "obituary") {
        return res.status(404).json({ message: "임시 저장된 부고를 찾을 수 없습니다" });
      }
      const preview = await assembleTrustedObituary(draft, userId);
      if (preview.kind === "invalid") {
        return res.status(400).json({
          message: "저장된 부고 초안이 올바르지 않습니다",
          missingFields: preview.missingFields,
        });
      }
      if (preview.kind === "missing") {
        return res.status(400).json({
          message: "부고문 미리보기에 필요한 정보가 부족합니다",
          missingFields: preview.missingFields,
        });
      }

      res.json({ text: preview.text });
    } catch {
      res.status(500).json({ message: "부고문 미리보기를 만들지 못했습니다" });
    }
  });

  app.post("/api/events/:id/publish", async (req, res) => {
    try {
      const id = parsePositiveInteger(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "잘못된 소식입니다" });
      }
      const userId = req.session.userId!;
      const ownedDraft = await storage.getEventDraft(id, userId);
      if (!ownedDraft) {
        const alreadyPublished = await storage.getPublishedEvent(id);
        if (alreadyPublished?.authorId === userId) {
          return res.json(sanitizePublishedEvent(alreadyPublished));
        }
        return res.status(404).json({ message: "소식을 찾을 수 없습니다" });
      }

      let data: CommunityEventPublishInput;
      if (req.body?.eventType === "obituary") {
        const draftData = normalizeCommunityEventSources(
          communityEventDraftSchema.parse(req.body),
        );
        if (draftData.eventType !== "obituary" || ownedDraft.eventType !== "obituary") {
          return res.status(400).json({ message: "잘못된 요청입니다" });
        }
        const candidate = {
          ...ownedDraft,
          ...draftData,
          details: draftData.details,
        } as CommunityEvent;
        const announcement = await assembleTrustedObituary(candidate, userId);
        if (announcement.kind !== "ready") {
          return res.status(400).json({
            message: announcement.kind === "invalid"
              ? "저장된 부고 초안이 올바르지 않습니다"
              : "부고문 게시에 필요한 정보가 부족합니다",
            missingFields: announcement.missingFields,
          });
        }
        const canonicalDraft: CommunityEventDraftInput = {
          ...draftData,
          relatedMemberName: announcement.input.memberName,
          contactNumber: announcement.input.memberPhone,
          details: {
            ...draftData.details,
            memberTitle: announcement.input.memberTitle,
          },
        };
        data = normalizeCommunityEventSources(communityEventPublishSchema.parse(canonicalDraft));
      } else {
        data = normalizeCommunityEventSources(communityEventPublishSchema.parse(req.body));
        if (data.eventType !== ownedDraft.eventType) {
          return res.status(400).json({ message: "잘못된 요청입니다" });
        }
      }

      const event = await storage.publishEvent(id, userId, data);
      if (!event) {
        return res.status(404).json({ message: "소식을 찾을 수 없습니다" });
      }
      res.json(sanitizePublishedEvent(event));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 요청입니다", errors: error.errors });
      }
      if (error instanceof EventSourcePolicyError) {
        return res.status(400).json({ message: "공개 링크 형식을 확인해주세요" });
      }
      res.status(500).json({ message: "소식 발행에 실패했습니다" });
    }
  });

  app.get("/api/events", async (req, res) => {
    try {
      const eventType = req.query.type === undefined
        ? undefined
        : z.enum(COMMUNITY_EVENT_TYPES).parse(req.query.type);
      const events = await storage.getPublishedEvents(eventType);
      res.json(events.map(sanitizePublishedEvent));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 요청입니다", errors: error.errors });
      }
      res.status(500).json({ message: "소식 목록 조회에 실패했습니다" });
    }
  });

  app.get("/api/events/:id", async (req, res) => {
    try {
      const id = parsePositiveInteger(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "잘못된 소식입니다" });
      }
      const event = await storage.getPublishedEvent(id);
      if (!event) {
        return res.status(404).json({ message: "소식을 찾을 수 없습니다" });
      }
      res.json(sanitizePublishedEvent(event));
    } catch (error) {
      res.status(500).json({ message: "소식 조회에 실패했습니다" });
    }
  });

  // Alumni directory (회원 전용) — 본인 기수/지부 범위 동문만 열람. q 로 이름·기수 검색.
  app.get("/api/alumni", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const viewer = await storage.getUser(userId);
      if (!viewer) {
        return res.status(401).json({ message: "사용자를 찾을 수 없습니다" });
      }
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const result = await storage.getDirectoryAlumni(viewer, q);
      res.json(result);
    } catch (error) {
      console.error("Alumni directory error:", getErrorType(error));
      res.status(500).json({ message: "동문 명부 조회에 실패했습니다" });
    }
  });

  // Payments routes
  app.get("/api/payments/user/:userId", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const targetUserId = parseInt(req.params.userId);
      // 본인 또는 관리자만 열람 가능 (타인 납부 내역 노출 방지).
      if (targetUserId !== sessionUserId) {
        const viewer = await storage.getUser(sessionUserId);
        if (!viewer?.isAdmin) {
          return res.status(403).json({ message: "권한이 없습니다" });
        }
      }
      const payments = await storage.getPaymentsByUser(targetUserId);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.post("/api/payments", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertPaymentSchema.parse(req.body);
      const payment = await storage.createPayment(validatedData);
      res.status(201).json(payment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create payment" });
    }
  });

  // Admin routes
  app.use("/api/admin", requireAdmin);

  app.get("/api/admin/pending-registrations", async (req, res) => {
    try {
      const registrations = await storage.getPendingRegistrations();
      res.json(registrations.map(toAdminPendingRegistrationDto));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch pending registrations" });
    }
  });

  app.patch("/api/admin/pending-registrations/:id", async (req, res) => {
    try {
      const parsedRequest = adminPendingRegistrationUpdateSchema.safeParse({
        params: req.params,
        body: req.body,
      });
      if (!parsedRequest.success) {
        return res.status(400).json({ message: "Invalid data" });
      }
      const { status } = parsedRequest.data.body;
      const id = parsePositiveInteger(parsedRequest.data.params.id)!;

      if (status === "rejected") {
        const deleted = await pendingRegistrationStorage.rejectPendingRegistration(
          id,
          async (registration) => {
            const kakaoId = getPendingKakaoId(registration);
            const { adminKey } = getKakaoAdminConfig();
            try {
              await unlinkKakaoUser({ adminKey, kakaoId });
            } catch (error) {
              if (!(error instanceof KakaoUnlinkError && error.kind === "already_unlinked")) {
                throw error;
              }
            }
          },
        );
        if (!deleted) {
          return res.status(404).json({ message: "Registration not found" });
        }
        return res.json({ deleted: true, id: deleted.id });
      }
      
      const registration = await pendingRegistrationStorage.updatePendingRegistrationStatus(id, status);
      
      if (!registration) {
        return res.status(404).json({ message: "Registration not found" });
      }
      
      res.json(toAdminPendingRegistrationDto(registration));
    } catch (error) {
      if (error instanceof InvalidPendingKakaoIdError) {
        return res.status(409).json({
          message: "가입 신청의 카카오 식별정보를 확인할 수 없어 거절할 수 없습니다",
        });
      }
      if (error instanceof KakaoAdminConfigurationError) {
        console.error("Kakao unlink blocked pending rejection:", getErrorType(error));
        return res.status(500).json({
          message: "가입 거절 설정 오류입니다. 관리자에게 문의해주세요",
        });
      }
      if (error instanceof KakaoUnlinkError) {
        console.error("Kakao unlink blocked pending rejection:", getErrorType(error));
        return res.status(502).json({
          message: "카카오 연결 해제에 실패해 가입 거절을 완료하지 못했습니다. 잠시 후 다시 시도해주세요",
        });
      }
      if (error instanceof PhoneRegistrationConflictError) {
        return res.status(409).json({
          message: "이미 가입된 전화번호입니다",
          description: "승인 상태는 변경되지 않았습니다.",
        });
      }
      if (error instanceof PendingRegistrationConflictError) {
        return res.status(409).json({
          message: "가입 충돌이 아직 해소되지 않았습니다",
          description: "승인 상태는 변경되지 않았습니다.",
        });
      }
      res.status(500).json({ message: "Failed to update registration" });
    }
  });

  app.post("/api/admin/sync-alumni/preview", async (_req, res) => {
    try {
      const report = await alumniSyncStorage.previewAlumniSync();
      res.json({ report, fingerprint: report.sourceFingerprint });
    } catch (error) {
      console.error("Alumni sync preview error:", getErrorType(error));
      res.status(500).json({ message: "동기화에 실패했습니다. 잠시 후 다시 시도해주세요" });
    }
  });

  app.post("/api/admin/sync-alumni", async (req, res) => {
    const parsedRequest = alumniSyncApplySchema.safeParse(req.body);
    if (!parsedRequest.success) {
      return res.status(400).json({ message: "유효한 미리보기가 필요합니다" });
    }

    try {
      const report = await alumniSyncStorage.applyAlumniSync(
        parsedRequest.data.fingerprint,
      );
      res.json({ report });
    } catch (error) {
      if (error instanceof AlumniSyncFingerprintMismatchError) {
        return res.status(409).json({
          message: "명부가 변경되었습니다. 다시 미리보기 해주세요",
        });
      }
      if (error instanceof AlumniSyncBlockedError) {
        return res.status(422).json({
          message: "차단 오류를 해결한 뒤 다시 미리보기 해주세요",
        });
      }
      if (error instanceof AlumniSyncInProgressError) {
        return res.status(409).json({ message: "다른 명부 동기화가 진행 중입니다" });
      }
      console.error("Alumni sync error:", getErrorType(error));
      res.status(500).json({ message: "동기화에 실패했습니다. 잠시 후 다시 시도해주세요" });
    }
  });

  // 동기화 진행상황 조회 API
  app.get("/api/admin/sync-progress", async (req, res) => {
    try {
      const { googleSheetsService } = await import("./google-sheets");
      const progress = googleSheetsService.getSyncProgress();
      res.json(progress);
    } catch (error) {
      console.error("Sync progress error:", getErrorType(error));
      res.status(500).json({ error: "진행상황 조회 실패" });
    }
  });

  // Google Sheets 연결 테스트 API
  app.get("/api/admin/test-google-sheets", async (req, res) => {
    try {
      const { googleSheetsService } = await import("./google-sheets");
      const isConnected = await googleSheetsService.testConnection();
      
      if (isConnected) {
        const sampleData = await googleSheetsService.fetchAlumniData();
        res.json({ 
          connected: true, 
          message: "Google Sheets 연결 성공",
          sampleCount: sampleData.length
        });
      } else {
        res.json({ 
          connected: false, 
          message: "Google Sheets 설정이 필요합니다" 
        });
      }
    } catch (error) {
      console.error("Google Sheets test error:", getErrorType(error));
      res.status(500).json({
        connected: false, 
        message: "Google Sheets 연결에 실패했습니다. 잠시 후 다시 시도해주세요",
      });
    }
  });

  // 오브젝트 스토리지 라우트 (업로드 URL 발급 + /objects/ 서빙)
  registerObjectStorageRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
