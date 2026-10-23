import type { RequestHandler } from "express";
import type { User } from "@shared/schema";
import { storage } from "../storage";
import { createRequireAdmin, type AdminUserLookup } from "../middleware/auth";
import { resolveKakaoOAuthConfig, type KakaoOAuthConfig } from "../integrations/kakao/kakao-oauth-config";
import { resolveKakaoAdminConfig, type KakaoAdminConfig } from "../integrations/kakao/kakao-admin-config";
import { unlinkKakaoUser as unlinkKakaoUserFromKakao } from "../integrations/kakao/kakao-unlink";
import { isConfiguredKakaoAdministrator } from "../integrations/kakao/kakao-admin-allowlist";
import { kakaoOAuthStateStore as postgresKakaoOAuthStateStore, type KakaoOAuthStateStore } from "../modules/identity/kakao-oauth-state";
import { createEventParseLimiter } from "../modules/events/event-parse-limiter";
import { createDefaultEventSourceReader, type RouteEventSourceReader } from "../modules/events/routes";

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

export function createRouteContext(dependencies: RouteDependencies = {}) {
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

  return {
    requireAdmin, getKakaoOAuthConfig, kakaoFetch, kakaoAuthStorage,
    pendingRegistrationStorage, alumniSyncStorage, kakaoOAuthStateStore,
    getKakaoAdminConfig, isKakaoAdministrator, getAccountDeletionUser,
    deleteUserAccount, unlinkKakaoUser, readSources, eventParseLimiter, eventParseTimeoutMs,
  };
}

export type RouteContext = ReturnType<typeof createRouteContext>;
