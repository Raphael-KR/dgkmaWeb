import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function migrationTarget(
  workspace,
  environment,
  expectedDatabase,
  { promotion = false } = {},
) {
  if (environment === "production" && !promotion)
    throw new Error("Backup import is development-only; use content promotion");
  if (!["development", "production"].includes(environment) || !expectedDatabase)
    throw new Error("Specify development|production and expected database name");
  if (process.env.REPL_ID !== "dc5e5541-525b-4ad6-b914-2d2db70cb4a9")
    throw new Error("Project Replit workspace required");
  if (
    environment === "development" &&
    (expectedDatabase !== "heliumdb" || process.env.REPLIT_DEPLOYMENT === "1")
  )
    throw new Error("Development target mismatch");
  const load = (path) => import(pathToFileURL(resolve(workspace, path)));
  return {
    environment,
    expectedDatabase,
    load,
    async pool() {
      if (environment === "development") return (await load("server/db.ts")).pool;
      if (!process.env.PROD_DATABASE_URL) throw new Error("Production database Secret required");
      const { Pool } = createRequire(resolve(workspace, "package.json"))("pg");
      return new Pool({
        connectionString: process.env.PROD_DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
    },
    privateDir() {
      const value =
        process.env[
          environment === "production" ? "PROD_PRIVATE_OBJECT_DIR" : "PRIVATE_OBJECT_DIR"
        ];
      if (!value || !/^\/?[^/]+\/.+/.test(value) || value.split("/").some((part) => part === ".."))
        throw new Error("Explicit target private storage Secret required");
      return value.replace(/\/$/, "");
    },
    async verifyDatabase(connection) {
      const actual = (await connection.query("select current_database() as name")).rows[0].name;
      if (actual !== expectedDatabase)
        throw Object.assign(new Error("Database mismatch"), {
          reason: `database-mismatch:expected=${expectedDatabase},actual=${actual}`,
        });
    },
  };
}
