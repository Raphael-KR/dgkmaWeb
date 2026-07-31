import { defineConfig } from "drizzle-kit";
import { resolveDevelopmentTarget } from "./server/db-target";

const target = resolveDevelopmentTarget(process.env, "drizzle");

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  tablesFilter: ["!session"],
  dialect: "postgresql",
  dbCredentials: {
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database: target.database,
    ssl: target.ssl === false ? false : "verify-full",
  },
});
