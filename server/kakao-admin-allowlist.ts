export type KakaoAdminAllowlistEnvironment = "development" | "production";

export type KakaoAdminAllowlistConfig = Readonly<{
  environment: KakaoAdminAllowlistEnvironment;
  kakaoUserIds: ReadonlySet<string>;
}>;

export class KakaoAdminAllowlistConfigurationError extends Error {
  constructor(public readonly variableName: string) {
    super(`Invalid Kakao administrator allowlist: ${variableName}`);
    this.name = "KakaoAdminAllowlistConfigurationError";
  }
}

export function resolveKakaoAdminAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): KakaoAdminAllowlistConfig {
  const environment: KakaoAdminAllowlistEnvironment =
    env.REPLIT_DEPLOYMENT === "1" ? "production" : "development";
  const variableName = environment === "production"
    ? "KAKAO_PROD_ADMIN_USER_IDS"
    : "KAKAO_DEV_ADMIN_USER_IDS";
  const rawValue = env[variableName]?.trim() ?? "";
  const kakaoUserIds = rawValue
    ? rawValue.split(",").map((value) => value.trim())
    : [];

  if (kakaoUserIds.some((value) => !/^[1-9]\d*$/.test(value))) {
    throw new KakaoAdminAllowlistConfigurationError(variableName);
  }

  return Object.freeze({
    environment,
    kakaoUserIds: new Set(kakaoUserIds),
  });
}

export function isConfiguredKakaoAdministrator(
  kakaoUserId: string,
  config: KakaoAdminAllowlistConfig = resolveKakaoAdminAllowlist(),
): boolean {
  return config.kakaoUserIds.has(kakaoUserId);
}
