import type { Express } from "express";
import type { RouteContext } from "../../lib/route-context";
import { getErrorType } from "../../lib/safe-logging";
import { registerKakaoAuthorizationRoutes } from "./kakao-authorization";
import { registerProfileRoutes } from "./profile-routes";

export function registerIdentityRoutes(app: Express, context: RouteContext): void {
  app.post("/api/auth/logout", async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", getErrorType(err));
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      console.log("User logged out");
      res.json({ success: true, message: "Logged out successfully" });
    });
  });

  registerKakaoAuthorizationRoutes(app, context);
  registerProfileRoutes(app, context);
}
