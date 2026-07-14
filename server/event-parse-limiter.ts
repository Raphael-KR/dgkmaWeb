import type { RequestHandler } from "express";

export type EventParseLimiterOptions = {
  windowMs?: number;
  max?: number;
};

export function createEventParseLimiter({
  windowMs = 60_000,
  max = 10,
}: EventParseLimiterOptions = {}): RequestHandler {
  const requestsByUserId = new Map<number, number[]>();

  return (req, res, next) => {
    const userId = req.session?.userId;
    if (!userId) {
      next();
      return;
    }

    const now = Date.now();
    const recentRequests = (requestsByUserId.get(userId) ?? [])
      .filter((requestedAt) => now - requestedAt < windowMs);

    if (recentRequests.length >= max) {
      if (recentRequests.length) requestsByUserId.set(userId, recentRequests);
      else requestsByUserId.delete(userId);
      res.status(429).json({ message: "잠시 후 다시 시도해주세요" });
      return;
    }

    recentRequests.push(now);
    requestsByUserId.set(userId, recentRequests);
    next();
  };
}
