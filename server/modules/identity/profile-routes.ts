import type { Express } from "express";
import { updateProfileSchema, REGION_OPTIONS, type User } from "@shared/schema";
import { z } from "zod";
import { storage } from "../../storage";
import type { RouteContext } from "../../lib/route-context";
import { getErrorType } from "../../lib/safe-logging";
import { KakaoAdminConfigurationError } from "../../integrations/kakao/kakao-admin-config";
import { KakaoUnlinkError } from "../../integrations/kakao/kakao-unlink";
import { toClientUser } from "./client-user";
import { isKakaoDebugEnabled } from "./session";

export function registerProfileRoutes(app: Express, context: RouteContext): void {
  const {
    kakaoAuthStorage,
    getAccountDeletionUser,
    deleteUserAccount,
    getKakaoAdminConfig,
    unlinkKakaoUser,
  } = context;

  // 활동지역 저장과 본인 프로필·탈퇴는 항상 서버 세션의 회원을 대상으로 한다.
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
    const region = req.body?.activityRegion;
    if (!REGION_OPTIONS.includes(region)) {
      return res.status(400).json({ message: "Invalid region" });
    }
    // ⚠️ update 대상은 반드시 req.session.userId — body 로 userId 받지 않음 (보안).
    try {
      const updated = await storage.updateUser(req.session.userId, { activityRegion: region });
      if (!updated) {
        return res.status(500).json({ message: "지역 저장에 실패했습니다" });
      }
      return res.json({ user: toClientUser(updated) });
    } catch (error) {
      console.error("Activity region update failed", { errorType: getErrorType(error) });
      return res.status(500).json({ message: "지역 저장에 실패했습니다" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const user = await kakaoAuthStorage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      return res.json({ user: toClientUser(user) });
    } catch (error) {
      console.error("Current user lookup failed", { errorType: getErrorType(error) });
      return res.status(500).json({ message: "회원 정보를 불러오지 못했습니다" });
    }
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
        return res
          .status(400)
          .json({ message: "입력값이 올바르지 않습니다", errors: error.errors });
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
