import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { injectSeo } from "./seo";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

function rejectUnknownApiPath(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (req.originalUrl.split("?", 1)[0].startsWith("/api/")) {
    res.status(404).json({ message: "요청한 API를 찾을 수 없습니다" });
    return;
  }
  next();
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", rejectUnknownApiPath);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const transformed = await vite.transformIndexHtml(url, template);
      const page = await injectSeo(req, transformed);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(
  app: Express,
  distPath = path.resolve(import.meta.dirname, "public"),
) {
  const resolvedDistPath = path.resolve(distPath);

  if (!fs.existsSync(resolvedDistPath)) {
    throw new Error(
      `Could not find the build directory: ${resolvedDistPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(resolvedDistPath, {
    setHeaders: (res, filePath) => {
      if (path.basename(filePath) === "index.html") {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }));

  app.use("*", rejectUnknownApiPath);

  // Never return the SPA document for a missing script/style/media request.
  // Browsers need a real missing-asset response so lazy imports fail cleanly
  // and route-level recovery can show its reload action.
  app.use("*", (req, res, next) => {
    const pathname = req.originalUrl.split("?", 1)[0];
    if (/\.(?:js|mjs|css|map|woff2?|ttf|otf|png|jpe?g|svg|avif|webp|gif|ico)$/i.test(pathname)) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    next();
  });

  // fall through to index.html if the file doesn't exist
  app.use("*", async (req, res, next) => {
    try {
      const template = await fs.promises.readFile(
        path.resolve(resolvedDistPath, "index.html"),
        "utf-8",
      );
      const page = await injectSeo(req, template);
      res.status(200)
        .set({
          "Content-Type": "text/html",
          "Cache-Control": "no-cache",
        })
        .end(page);
    } catch (error) {
      next(error);
    }
  });
}
