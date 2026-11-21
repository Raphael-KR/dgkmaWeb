import type { Express, Response } from "express";
import { REGISTRATION_APPROVAL_STATUSES } from "@shared/contracts";
import { z } from "zod";
import {
  storage,
  PendingRegistrationConflictError,
  PhoneRegistrationConflictError,
} from "../../storage";
import { getErrorType } from "../../lib/safe-logging";
import { parsePositiveInteger } from "../../lib/route-params";
import { KakaoAdminConfigurationError } from "../../integrations/kakao/kakao-admin-config";
import { KakaoUnlinkError } from "../../integrations/kakao/kakao-unlink";
import { getPendingKakaoId, InvalidPendingKakaoIdError } from "./pending-registration-identity";
import { RegistrationStateConflictError } from "./registration-decision-storage";
import { toAdminPendingRegistrationDto } from "./admin-pending-registration";
import type { RouteContext } from "../../lib/route-context";

const adminPendingRegistrationUpdateSchema = z.object({
  params: z
    .object({
      id: z.string().refine((value) => parsePositiveInteger(value) !== undefined),
    })
    .strict(),
  body: z
    .object({
      status: z.enum(REGISTRATION_APPROVAL_STATUSES),
    })
    .strict(),
});

function sendDecisionError(res: Response, error: unknown) {
  if (error instanceof InvalidPendingKakaoIdError)
    return res
      .status(409)
      .json({ message: "신청의 카카오 식별정보를 확인할 수 없어 삭제할 수 없습니다." });
  if (error instanceof KakaoAdminConfigurationError || error instanceof KakaoUnlinkError) {
    console.error("Kakao unlink blocked application deletion", { errorType: getErrorType(error) });
    const statusCode = error instanceof KakaoAdminConfigurationError ? 500 : 502;
    return res.status(statusCode).json({
      message: "카카오 연결을 해제하지 못해 신청정보를 보존했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }
  if (error instanceof RegistrationStateConflictError)
    return res.status(409).json({ message: error.message });
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
  console.error("Registration decision failed", { errorType: getErrorType(error) });
  return res.status(500).json({ message: "가입 승인 상태를 변경하지 못했습니다." });
}

export function registerDirectoryRoutes(app: Express): void {
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
}

export function registerRegistryAdminRoutes(
  app: Express,
  {
    requireAdmin,
    pendingRegistrationStorage,
    registeredRosterCount,
    getKakaoAdminConfig,
    unlinkKakaoUser,
  }: RouteContext,
): void {
  // Admin routes
  app.use("/api/admin", requireAdmin);

  app.get("/api/admin/pending-registrations", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const parsedStatus = z
        .enum(REGISTRATION_APPROVAL_STATUSES)
        .safeParse(req.query.status ?? "pending");
      if (!parsedStatus.success)
        return res.status(400).json({ message: "유효하지 않은 승인 상태입니다." });
      const registrations = await pendingRegistrationStorage.getPendingRegistrationReviews(
        parsedStatus.data,
      );
      res.json(
        registrations.map((row) =>
          row.recordType === "member"
            ? { ...row, isSelf: row.memberId === req.session.userId }
            : row,
        ),
      );
    } catch (error) {
      console.error("Failed to fetch pending registrations", { errorType: getErrorType(error) });
      res.status(500).json({ message: "가입 목록을 불러오지 못했습니다." });
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

      const registration =
        status === "approved"
          ? await pendingRegistrationStorage.approvePendingRegistration(id)
          : status === "rejected"
            ? await pendingRegistrationStorage.rejectPendingRegistration(id)
            : await pendingRegistrationStorage.reopenPendingRegistration(id);
      if (!registration) return res.status(404).json({ message: "가입 신청을 찾을 수 없습니다." });
      return res.json(toAdminPendingRegistrationDto(registration));
    } catch (error) {
      return sendDecisionError(res, error);
    }
  });

  app.delete("/api/admin/pending-registrations/:id", async (req, res) => {
    const id = parsePositiveInteger(req.params.id);
    if (id === undefined)
      return res.status(400).json({ message: "유효하지 않은 신청 번호입니다." });
    try {
      const deleted = await pendingRegistrationStorage.deleteRejectedRegistration(
        id,
        async (registration) => {
          const kakaoId = getPendingKakaoId(registration);
          const { adminKey } = getKakaoAdminConfig();
          try {
            await unlinkKakaoUser({ adminKey, kakaoId });
          } catch (error) {
            if (!(error instanceof KakaoUnlinkError && error.kind === "already_unlinked"))
              throw error;
          }
        },
      );
      if (!deleted) return res.status(404).json({ message: "신청정보를 찾을 수 없습니다." });
      return res.json({ deleted: true, id: deleted.id });
    } catch (error) {
      return sendDecisionError(res, error);
    }
  });

  app.post("/api/admin/members/:id/cancel-approval", async (req, res) => {
    const id = req.params.id;
    if (!z.string().uuid().safeParse(id).success)
      return res.status(400).json({ message: "유효하지 않은 회원 번호입니다." });
    try {
      const registration = await pendingRegistrationStorage.cancelMemberApproval(
        id,
        req.session.userId!,
      );
      if (!registration) return res.status(404).json({ message: "회원을 찾을 수 없습니다." });
      return res.json(toAdminPendingRegistrationDto(registration));
    } catch (error) {
      return sendDecisionError(res, error);
    }
  });

  app.get("/api/admin/roster-count", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      res.json({ registered: await registeredRosterCount() });
    } catch (error) {
      console.error("Roster count failed", { errorType: getErrorType(error) });
      res.status(500).json({ message: "동문 명부 인원을 조회하지 못했습니다." });
    }
  });
}
