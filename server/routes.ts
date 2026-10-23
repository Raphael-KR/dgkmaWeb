import type { Express } from "express";
import { createServer, type Server } from "http";
import { registerIdentityRoutes } from "./modules/identity/routes";
import { createRouteContext, type RouteDependencies } from "./lib/route-context";
import { registerContentRoutes } from "./modules/content/routes";
import { registerEventRoutes } from "./modules/events/routes";
import { registerDirectoryRoutes, registerRegistryAdminRoutes } from "./modules/registry/routes";
import { registerMembershipRoutes, registerPaymentRoutes } from "./modules/dues/routes";
import { registerObjectStorageRoutes } from "./integrations/object-storage/routes";

export type { RouteDependencies } from "./lib/route-context";
export { createDefaultEventSourceReader } from "./modules/events/routes";

export async function registerRoutes(
  app: Express,
  dependencies: RouteDependencies = {},
): Promise<Server> {
  const context = createRouteContext(dependencies);

  // Preserve the historical registration sequence, including guards and literal
  // search/draft routes before parameter routes.
  registerIdentityRoutes(app, context);
  registerMembershipRoutes(app);
  registerContentRoutes(app);
  registerEventRoutes(app, context);
  registerDirectoryRoutes(app);
  registerPaymentRoutes(app, context);
  registerRegistryAdminRoutes(app, context);
  registerObjectStorageRoutes(app);

  return createServer(app);
}
