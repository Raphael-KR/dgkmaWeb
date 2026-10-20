// "/" chooses the public/member layout dynamically based on auth state.
const PUBLIC_PATHS = ["/login", "/terms", "/privacy", "/kakao-callback", "/onboarding/region"];
const PUBLIC_PREFIXES = ["/about/"];

export function isPublicPath(path: string) {
  if (PUBLIC_PATHS.includes(path)) return true;
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}
