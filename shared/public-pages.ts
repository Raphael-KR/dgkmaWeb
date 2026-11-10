import { PUBLIC_HOME_DESCRIPTION, SITE_NAME } from "./site";

type PublicPageMetadata = { title: string; description: string };
const home = { title: SITE_NAME, description: PUBLIC_HOME_DESCRIPTION };

// Shared by client navigation metadata, initial HTML and the public sitemap.
export const PUBLIC_PAGES = {
  "/": home,
  "/about": home,
  "/about/intro": {
    title: "동문회 소개",
    description: `${SITE_NAME}의 설립 목적, 연혁, 조직, 주요 사업을 소개합니다.`,
  },
  "/about/executives": {
    title: "임원 명단",
    description: `${SITE_NAME} 22대 임원 명단입니다.`,
  },
  "/about/presidents": {
    title: "역대회장",
    description: `${SITE_NAME} 역대회장 안내입니다.`,
  },
  "/about/heritage": {
    title: "역사관",
    description: `${SITE_NAME}의 활동, 역사 자료와 주요 행사를 담는 역사관입니다.`,
  },
  "/about/bylaws": {
    title: "동문회 회칙",
    description: `${SITE_NAME} 회칙 전문 — 회원, 임원, 총회·이사회, 재정, 경조, 기부금 등 전체 조항을 확인하세요.`,
  },
  "/about/bylaws/regulations": {
    title: "회원관리 및 회계 규정",
    description: `${SITE_NAME} 회원관리 및 회계 규정 전문과 직책별 회비 기준을 확인하세요.`,
  },
  "/about/join": {
    title: "회원가입 안내",
    description:
      "동국대학교 한의과대학 졸업생을 위한 동문회 가입 절차와 자격 안내. 카카오 로그인으로 간편하게 시작하세요.",
  },
  "/about/dues": {
    title: "2026년 회비 안내",
    description: `2026년 ${SITE_NAME} 회비 금액과 납부 계좌, 권리회원 혜택을 안내합니다.`,
  },
  "/about/condolence": {
    title: "회원 경조사 지원 안내(문자/화환/근조기)",
    description: `${SITE_NAME} 권리회원의 경조사 문자·화환·근조기 신청 절차와 비용을 안내합니다.`,
  },
  "/terms": {
    title: "이용약관",
    description: `${SITE_NAME} 홈페이지 이용약관을 안내합니다.`,
  },
  "/privacy": {
    title: "개인정보처리방침",
    description: `${SITE_NAME} 개인정보 수집 및 이용 방침을 안내합니다.`,
  },
} satisfies Record<string, PublicPageMetadata>;

export type PublicPagePath = keyof typeof PUBLIC_PAGES;

export function getPublicPageMetadata(path: string): PublicPageMetadata | undefined {
  return Object.hasOwn(PUBLIC_PAGES, path) ? PUBLIC_PAGES[path as PublicPagePath] : undefined;
}
