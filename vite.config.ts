import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const routeRecoveryBuildLabel = process.env.ROUTE_RECOVERY_BROWSER_BUILD;
const routeRecoveryBuildMarkerPlugin = routeRecoveryBuildLabel
  ? {
      name: "route-recovery-browser-build-marker",
      apply: "build" as const,
      transform(source: string, id: string) {
        const targetModule = `${path.sep}features${path.sep}about${path.sep}intro.tsx`;
        if (!id.endsWith(targetModule)) return null;
        return `${source}\nwindow.__routeRecoveryBrowserBuild = ${JSON.stringify(routeRecoveryBuildLabel)};\n`;
      },
    }
  : null;

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(routeRecoveryBuildMarkerPlugin ? [routeRecoveryBuildMarkerPlugin] : []),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    manifest: true,
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
