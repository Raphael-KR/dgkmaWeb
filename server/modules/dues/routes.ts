import type { Express } from "express";
import { insertPaymentSchema } from "@shared/schema";
import { KAKAO_GROUP_INVITE_ENDPOINT, type KakaoGroupInvite } from "@shared/contracts";
import { z } from "zod";
import { storage } from "../../storage";
import { getErrorType } from "../../lib/safe-logging";
import type { RouteContext } from "../../lib/route-context";
import {
  getKakaoGroupInviteUrl,
  KakaoGroupConfigurationError,
} from "../../integrations/kakao/kakao-group-config";

export function registerMembershipRoutes(app: Express): void {
  // 권리회원 등급/회비 납부 현황 — 세션 기준 본인만 조회.
  app.get("/api/membership/status", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
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

  app.get(KAKAO_GROUP_INVITE_ENDPOINT, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ message: "로그인이 필요합니다" });

    let stage = "member_lookup";
    try {
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "로그인이 필요합니다" });

      stage = "membership_lookup";
      const membership = await storage.getMembershipStatus(userId);
      if (!membership.isPaid) {
        return res.status(403).json({ message: "권리회원만 단톡방에 참여할 수 있습니다" });
      }

      stage = "invitation_configuration";
      const invitation: KakaoGroupInvite = { url: getKakaoGroupInviteUrl() };
      return res.json(invitation);
    } catch (error) {
      const configurationError = error instanceof KakaoGroupConfigurationError;
      console.error("Kakao group invitation unavailable", {
        stage,
        errorType: getErrorType(error),
        ...(configurationError && { configurationReason: error.reason }),
        privateDataOmitted: true,
      });
      return res.status(configurationError ? 503 : 500).json({
        message: "단톡방 참여 연결을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  });
}

export function registerPaymentRoutes(app: Express, { requireAdmin }: RouteContext): void {
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
      console.error("Failed to fetch payments", { errorType: getErrorType(error) });
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
}
