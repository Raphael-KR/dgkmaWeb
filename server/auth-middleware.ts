import type { RequestHandler } from "express";
import { getErrorType } from "./safe-logging";

export const requireAuthenticated: RequestHandler = (req, res, next) => {
  if (!req.session?.userId) {
    res.status(401).json({ message: "로그인이 필요합니다" });
    return;
  }
  next();
};

export type AdminUserLookup = (
  userId: number,
) => Promise<{ isAdmin?: boolean | null } | undefined>;

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
