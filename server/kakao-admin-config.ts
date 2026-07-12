export type KakaoAdminEnvironment = "development" | "production";

export type KakaoAdminConfig = Readonly<{
  environment: KakaoAdminEnvironment;
  adminKey: string;
}>;

export class KakaoAdminConfigurationError extends Error {
  constructor(public readonly missingVariables: readonly string[]) {
    super(`Missing Kakao administrator variables: ${missingVariables.join(", ")}`);
    this.name = "KakaoAdminConfigurationError";
  }
}

export function resolveKakaoAdminConfig(
  env: NodeJS.ProcessEnv = process.env,
): KakaoAdminConfig {
  const environment: KakaoAdminEnvironment =
    env.REPLIT_DEPLOYMENT === "1" ? "production" : "development";
  const adminKeyVariable =
    environment === "production" ? "KAKAO_PROD_ADMIN_KEY" : "KAKAO_DEV_ADMIN_KEY";
  const adminKey = env[adminKeyVariable]?.trim() ?? "";

  if (!adminKey) {
    throw new KakaoAdminConfigurationError([adminKeyVariable]);
  }

  return Object.freeze({ environment, adminKey });
}
