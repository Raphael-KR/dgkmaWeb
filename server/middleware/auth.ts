import type { RequestHandler } from "express";
import { getErrorType } from "../lib/safe-logging";

export const requireAuthenticated: RequestHandler = (req, res, next) => {
  if (!req.session?.userId) {
    res.status(401).json({ message: "로그인이 필요합니다" });
    return;
  }
  next();
};

export type AdminUserLookup = (userId: number) => Promise<{ isAdmin?: boolean | null } | undefined>;

export function createRequireAdmin(getUser: AdminUserLookup): RequestHandler {
  return async (req, res, next) => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ message: "로그인이 필요합니다" });
      return;
    }

    try {
      const user = await getUser(userId);
      if (!user) {
        res.status(401).json({ message: "로그인이 필요합니다" });
        return;
      }
      if (!user.isAdmin) {
        res.status(403).json({ message: "관리자 권한이 필요합니다" });
        return;
      }
      next();
    } catch (error) {
      console.error("Admin authorization failed:", getErrorType(error));
      res.status(500).json({ message: "관리자 권한 확인에 실패했습니다" });
    }
  };
}

// 세션 행 삭제 후 늦게 저장된 요청도 다음 API 접근에서 승인 상태를 다시 확인한다.
export function createVerifiedSessionGuard(
  getUser: (userId: number) => Promise<{ isVerified: boolean | null } | undefined>,
): RequestHandler {
  return async (req, res, next) => {
    if (!req.session?.userId) return next();
    try {
      const user = await getUser(req.session.userId);
      if (user?.isVerified) return next();
      delete req.session.userId;
      req.session.destroy((error) => {
        if (error)
          console.error("Unapproved session cleanup failed", { errorType: getErrorType(error) });
        res.clearCookie("connect.sid");
        res
          .status(401)
          .json({ message: "회원 승인이 필요합니다. 다시 로그인해 승인 상태를 확인해 주세요." });
      });
    } catch (error) {
      console.error("Session approval lookup failed", { errorType: getErrorType(error) });
      res.status(500).json({ message: "회원 승인 상태를 확인하지 못했습니다." });
    }
  };
}
