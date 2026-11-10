// 공개 표시 정보의 정본. 브라우저와 서버에서 함께 사용하며 환경값·비밀정보를 넣지 않는다.
export const SITE_NAME = "동국대학교한의과대학동문회";
export const SITE_SHORT_NAME = "동국한의동문회";
export const SITE_DESCRIPTION =
  "따뜻한 연대, 함께하는 성장 — 동국대학교 한의과대학 동문회 공식 플랫폼. 회칙, 회비, 경조사 지원, 동문 명부와 게시판을 한 곳에서 이용하세요.";
export const SITE_KEYWORDS = `${SITE_SHORT_NAME}, ${SITE_NAME}, 동국한의대, 동문회, 한의과대학 동문`;
export const SITE_IMAGE = "/og-image.png";
export const PUBLIC_HOME_DESCRIPTION = "모교 기여, 장학, 동문 모임, 경조사 안내";
export const SITE_HOME_CANONICAL_URL = "https://dgkma.org/";

export function siteCanonicalUrl(pathname: string, origin: string) {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  return path === "/" || path === "/about"
    ? SITE_HOME_CANONICAL_URL
    : `${origin.replace(/\/$/, "")}${path}`;
}

export function siteTitle(title: string) {
  return title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
}
