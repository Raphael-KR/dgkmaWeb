import type { Express } from "express";
import type { PendingRegistration } from "@shared/schema";
import { z } from "zod";
import {
  storage, AlumniSyncBlockedError, AlumniSyncFingerprintMismatchError,
  AlumniSyncInProgressError, PendingRegistrationConflictError, PhoneRegistrationConflictError,
} from "../../storage";
import { getErrorType } from "../../lib/safe-logging";
import { parsePositiveInteger } from "../../lib/route-params";
import { KakaoAdminConfigurationError } from "../../integrations/kakao/kakao-admin-config";
import { KakaoUnlinkError } from "../../integrations/kakao/kakao-unlink";
import { toAdminPendingRegistrationDto } from "./admin-pending-registration";
import type { RouteContext } from "../../lib/route-context";

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
  { requireAdmin, pendingRegistrationStorage, alumniSyncStorage, getKakaoAdminConfig, unlinkKakaoUser }: RouteContext,
): void {
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
      const report = await alumniSyncStorage.applyAlumniSync(parsedRequest.data.fingerprint);
      res.json({ report });
    } catch (error) {
      if (error instanceof AlumniSyncFingerprintMismatchError) {
        return res.status(409).json({ message: "명부가 변경되었습니다. 다시 미리보기 해주세요" });
      }
      if (error instanceof AlumniSyncBlockedError) {
        return res.status(422).json({ message: "차단 오류를 해결한 뒤 다시 미리보기 해주세요" });
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
      const { googleSheetsService } = await import("../../integrations/google-sheets");
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
      const { googleSheetsService } = await import("../../integrations/google-sheets");
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
}
