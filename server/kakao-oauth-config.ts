export type KakaoOAuthEnvironment = "development" | "production";

export type KakaoOAuthConfig = Readonly<{
  environment: KakaoOAuthEnvironment;
  restApiKey: string;
  clientSecret: string;
  redirectUri: string;
}>;

export class KakaoOAuthConfigurationError extends Error {
  constructor(public readonly missingVariables: readonly string[]) {
    super(`Missing or invalid Kakao OAuth variables: ${missingVariables.join(", ")}`);
    this.name = "KakaoOAuthConfigurationError";
  }
}

const KAKAO_SCOPE = "name,profile_image,account_email,birthday,phone_number";
const KAKAO_REDIRECT_URIS = {
  development:
    "https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev/kakao-callback",
  production: "https://dgkma.org/kakao-callback",
} as const;

export function resolveKakaoOAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): KakaoOAuthConfig {
  const environment: KakaoOAuthEnvironment =
    env.REPLIT_DEPLOYMENT === "1" ? "production" : "development";
  const prefix = environment === "production" ? "KAKAO_PROD" : "KAKAO_DEV";
  const names = {
    restApiKey: `${prefix}_REST_API_KEY`,
    clientSecret: `${prefix}_CLIENT_SECRET`,
    redirectUri: `${prefix}_REDIRECT_URI`,
  } as const;
  const values = {
    restApiKey: env[names.restApiKey]?.trim() ?? "",
    clientSecret: env[names.clientSecret]?.trim() ?? "",
    redirectUri: env[names.redirectUri]?.trim() ?? "",
  };
  const missingVariables = Object.entries(names)
    .filter(([key]) => !values[key as keyof typeof values])
    .map(([, variableName]) => variableName);

  if (
    values.redirectUri &&
    values.redirectUri !== KAKAO_REDIRECT_URIS[environment]
  ) {
    missingVariables.push(names.redirectUri);
  }

  if (missingVariables.length > 0) {
    throw new KakaoOAuthConfigurationError(missingVariables);
  }

  return Object.freeze({ environment, ...values });
}

export function buildKakaoAuthorizeUrl(config: KakaoOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.restApiKey,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: KAKAO_SCOPE,
    state,
  });
  return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
}

export function buildKakaoTokenBody(
  config: KakaoOAuthConfig,
  code: string,
): URLSearchParams {
  return new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.restApiKey,
    redirect_uri: config.redirectUri,
    code,
    client_secret: config.clientSecret,
  });
}
