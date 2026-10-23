export const DEVELOPMENT_SESSION_SECRET = "dev-secret-change-in-production";

export class SessionSecretConfigurationError extends Error {
  constructor() {
    super("SESSION_SECRET is required in production.");
    this.name = "SessionSecretConfigurationError";
  }
}

export function resolveSessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  if (typeof env.SESSION_SECRET === "string" && env.SESSION_SECRET.length > 0) {
    return env.SESSION_SECRET;
  }
  if (env.NODE_ENV === "production") {
    throw new SessionSecretConfigurationError();
  }
  return DEVELOPMENT_SESSION_SECRET;
}
