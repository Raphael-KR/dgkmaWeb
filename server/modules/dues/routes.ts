import type { Express } from "express";
import { insertPaymentSchema } from "@shared/schema";
import { z } from "zod";
import { storage } from "../../storage";
import { getErrorType } from "../../lib/safe-logging";
import type { RouteContext } from "../../lib/route-context";

export function registerMembershipRoutes(app: Express): void {
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
