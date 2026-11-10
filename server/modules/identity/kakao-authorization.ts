import type { Express, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import type { RouteContext } from "../../lib/route-context";
import { getErrorType } from "../../lib/safe-logging";
import {
  KakaoOAuthConfigurationError,
  buildKakaoAuthorizeUrl,
} from "../../integrations/kakao/kakao-oauth-config";
import {
  hashKakaoOAuthSessionBinding,
  hashKakaoOAuthState,
  oauthStateHashesMatch,
} from "./kakao-oauth-state";
import { KakaoOAuthTerminatedError, type KakaoOAuthGeneration } from "./kakao-identity";
import { saveSession } from "./session";
import { readKakaoProfile } from "./kakao-profile";
import { completeKakaoAuthorization } from "./kakao-login";

async function consumeKakaoLoginState(req: Request, res: Response, context: RouteContext) {
  const { state } = req.body;
  const { kakaoOAuthStateStore } = context;
  const expectedStateHash = req.session.kakaoOAuthStateHash;
  const oauthStartedAt = req.session.kakaoOAuthStartedAt;
  const stateExpiresAt = req.session.kakaoOAuthStateExpiresAt;
  const actualStateHash = typeof state === "string" ? hashKakaoOAuthState(state) : "";
  const stateMatches =
    typeof expectedStateHash === "string" &&
    oauthStateHashesMatch(expectedStateHash, actualStateHash);
  if (
    !stateMatches ||
    typeof oauthStartedAt !== "number" ||
    typeof stateExpiresAt !== "number" ||
    stateExpiresAt <= Date.now()
  ) {
    res.status(400).json({ message: "유효하지 않은 카카오 로그인 요청입니다" });
    return;
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
    res.status(500).json({ message: "카카오 로그인 요청 처리에 실패했습니다" });
    return;
  }
  if (!stateConsumed) {
    res.status(400).json({ message: "유효하지 않은 카카오 로그인 요청입니다" });
    return;
  }
  delete req.session.kakaoOAuthStateHash;
  delete req.session.kakaoOAuthStartedAt;
  delete req.session.kakaoOAuthStateExpiresAt;
  try {
    await saveSession(req);
  } catch (error) {
    console.error("[Kakao OAuth] state consumption failed:", getErrorType(error));
    res.status(500).json({ message: "카카오 로그인 요청 처리에 실패했습니다" });
    return;
  }
  return oauthStartedAt;
}

export function registerKakaoAuthorizationRoutes(app: Express, context: RouteContext): void {
  const { getKakaoOAuthConfig, kakaoOAuthStateStore } = context;
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
      const { code } = req.body;
      if (typeof code !== "string" || code.length === 0) {
        return res.status(400).json({ message: "카카오 인가 코드가 필요합니다" });
      }
      const oauthStartedAt = await consumeKakaoLoginState(req, res, context);
      if (oauthStartedAt === undefined) return;
      const profile = await readKakaoProfile(code, res, context);
      if (!profile) return;
      const oauthGeneration: KakaoOAuthGeneration = {
        kakaoId: profile.kakaoId,
        email: profile.email,
        startedAt: new Date(oauthStartedAt),
      };
      return await completeKakaoAuthorization(req, res, context, profile, oauthGeneration);
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
      console.error("Kakao OAuth authorize error:", getErrorType(error));
      return res.status(500).json({ message: "Kakao authorization failed" });
    }
  });
}
