import type { Express } from "express";
import {
  ADMIN_STATISTICS_PATH,
  adminStatisticsPeriodSchema,
} from "@shared/contracts/admin-statistics";
import type { RouteContext } from "../../lib/route-context";
import { getErrorType } from "../../lib/safe-logging";
import { getAdminStatistics } from "./queries";

export function registerStatisticsRoutes(app: Express, { requireAdmin }: RouteContext): void {
  app.get(ADMIN_STATISTICS_PATH, requireAdmin, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const parsed = adminStatisticsPeriodSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    try {
      res.json(await getAdminStatistics(parsed.data));
    } catch (error) {
      // Never log a query error's SQL/parameters or an underlying connection URL.
      const cause = error instanceof Error && error.cause ? error.cause : error;
      const code = cause && typeof cause === "object" && "code" in cause ? cause.code : null;
      console.error("Admin statistics query failed", {
        errorType: getErrorType(error),
        databaseCode: typeof code === "string" && /^[A-Z0-9]{5}$/.test(code) ? code : null,
        from: parsed.data.from,
        to: parsed.data.to,
        privateDataOmitted: true,
      });
      res.status(500).json({ message: "관리자 통계를 불러오지 못했습니다." });
    }
  });
}
