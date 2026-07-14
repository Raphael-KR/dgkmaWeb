import type { RequestHandler } from "express";
import { pool } from "./db";

export type ConsumeEventParseQuota = (
  userId: number,
  windowMs: number,
  max: number,
) => Promise<boolean>;

export type EventParseLimiterOptions = {
  windowMs?: number;
  max?: number;
  maxConcurrentPerUser?: number;
  maxConcurrentGlobal?: number;
  consumeQuota?: ConsumeEventParseQuota;
};

export const consumePostgresEventParseQuota: ConsumeEventParseQuota = async (
  userId,
  windowMs,
  max,
) => {
  const result = await pool.query<{ request_count: number }>(`
    INSERT INTO event_parse_rate_limits (
      user_id,
      window_started_at,
      request_count,
      updated_at
    ) VALUES ($1, now(), 1, now())
    ON CONFLICT (user_id) DO UPDATE SET
      window_started_at = CASE
        WHEN event_parse_rate_limits.window_started_at <= now() - ($2::double precision * interval '1 millisecond')
          THEN now()
        ELSE event_parse_rate_limits.window_started_at
      END,
      request_count = CASE
        WHEN event_parse_rate_limits.window_started_at <= now() - ($2::double precision * interval '1 millisecond')
          THEN 1
        ELSE event_parse_rate_limits.request_count + 1
      END,
      updated_at = now()
    RETURNING request_count
  `, [userId, windowMs]);

  return Number(result.rows[0]?.request_count ?? max + 1) <= max;
};

export function createInMemoryEventParseQuota(): ConsumeEventParseQuota {
  const requestsByUserId = new Map<number, number[]>();

  return async (userId, windowMs, max) => {
    const now = Date.now();
    const recentRequests = (requestsByUserId.get(userId) ?? [])
      .filter((requestedAt) => now - requestedAt < windowMs);
    if (recentRequests.length >= max) {
      requestsByUserId.set(userId, recentRequests);
      return false;
    }
    recentRequests.push(now);
    requestsByUserId.set(userId, recentRequests);
    return true;
  };
}

export function createEventParseLimiter({
  windowMs = 60_000,
  max = 10,
  maxConcurrentPerUser = 2,
  maxConcurrentGlobal = 8,
  consumeQuota = consumePostgresEventParseQuota,
}: EventParseLimiterOptions = {}): RequestHandler {
  const activeByUserId = new Map<number, number>();
  let activeGlobal = 0;

  return async (req, res, next) => {
    const userId = req.session?.userId;
    if (!userId) {
      next();
      return;
    }

    try {
      if (!await consumeQuota(userId, windowMs, max)) {
        res.status(429).json({ message: "잠시 후 다시 시도해주세요" });
        return;
      }

      const activeForUser = activeByUserId.get(userId) ?? 0;
      if (activeGlobal >= maxConcurrentGlobal || activeForUser >= maxConcurrentPerUser) {
        res.status(429).json({ message: "현재 처리 중인 요청이 있습니다" });
        return;
      }

      activeGlobal += 1;
      activeByUserId.set(userId, activeForUser + 1);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        activeGlobal = Math.max(0, activeGlobal - 1);
        const remaining = Math.max(0, (activeByUserId.get(userId) ?? 1) - 1);
        if (remaining) activeByUserId.set(userId, remaining);
        else activeByUserId.delete(userId);
      };
      res.once("finish", release);
      res.once("close", release);
      next();
    } catch {
      res.status(503).json({ message: "분석 요청 제한을 확인하지 못했습니다" });
    }
  };
}
