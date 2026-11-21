import type { RequestHandler } from "express";
import type { Pool } from "pg";

const retrySeconds = 5;

// These three objects become visible together when the 6.3.0 migration commits.
const catalogCheck = `SELECT current_database() = 'neondb'
  AND to_regclass('public.dues_receipts') IS NOT NULL
  AND EXISTS (SELECT FROM pg_catalog.pg_trigger
    WHERE tgrelid = to_regclass('public.users') AND tgname = 'users_record_membership_change'
      AND tgfoid = to_regprocedure('public.record_membership_change()') AND tgenabled IN ('O', 'A'))
  AND EXISTS (SELECT FROM pg_catalog.pg_trigger
    WHERE tgrelid = to_regclass('public.payments') AND tgname = 'payments_clear_dues_source_labels'
      AND tgfoid = to_regprocedure('public.clear_dues_allocation_identity()') AND tgenabled IN ('O', 'A'))
  AS ready`;

export function createMembershipCutoverGuard(pool: Pool): RequestHandler {
  let ready = false;
  let nextProbeAt = 0;
  let pending: Promise<void> | undefined;

  function probe() {
    // Limit the HTTP wait even when the pool is still acquiring a connection.
    // The database request remains shared until it settles, including after timeout.
    return new Promise<void>((releaseWaiters) => {
      const timer = setTimeout(releaseWaiters, 2000);
      timer.unref();
      pool
        .query<{ ready: boolean }>(catalogCheck)
        .then((result) => {
          ready = result.rows[0]?.ready === true;
        })
        .catch(() => {
          ready = false;
        })
        .finally(() => {
          clearTimeout(timer);
          nextProbeAt = Date.now() + retrySeconds * 1000;
          pending = undefined;
          releaseWaiters();
        });
    });
  }

  return async (_req, res, next) => {
    if (ready) return next();
    if (Date.now() >= nextProbeAt) {
      pending ??= probe();
      await pending;
    }
    if (ready) return next();
    res.set({ "Retry-After": String(retrySeconds), "Cache-Control": "no-store" });
    res
      .status(503)
      .json({ message: "서비스를 업데이트하고 있습니다. 잠시 후 다시 시도해 주세요." });
  };
}
