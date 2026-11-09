import type { Request } from "express";

import {
  SITE_NAME, SITE_DESCRIPTION as DEFAULT_DESCRIPTION, SITE_KEYWORDS as DEFAULT_KEYWORDS,
  SITE_IMAGE as DEFAULT_IMAGE, siteTitle,
} from "@shared/site";

type SeoMeta = {
  title: string;
  description?: string;
  keywords?: string;
  image?: string;
  type?: "website" | "article";
  noIndex?: boolean;
};

const STATIC_SEO: Record<string, SeoMeta> = {
  "/": {
    title: SITE_NAME,
    description: "모교 기여, 장학, 동문 모임, 경조사 안내",
  },
  "/about": {
    title: SITE_NAME,
    description: "모교 기여, 장학, 동문 모임, 경조사 안내",
  },
  "/login": {
    title: "로그인",
    description: `${SITE_NAME} 회원 전용 서비스에 로그인합니다.`,
  },
  "/kakao-callback": {
    title: "카카오 로그인 처리",
    description: `${SITE_NAME} 카카오 로그인을 처리하고 있습니다.`,
  },
  "/onboarding/region": {
    title: "활동 지역 선택",
    description: "동문회 서비스 이용을 위해 활동 지역 정보를 입력합니다.",
  },
  "/terms": {
    title: "이용약관",
    description: `${SITE_NAME} 홈페이지 이용약관을 안내합니다.`,
  },
  "/privacy": {
    title: "개인정보처리방침",
    description: `${SITE_NAME} 개인정보 수집 및 이용 방침을 안내합니다.`,
  },
  "/about/intro": {
    title: "동문회 소개",
    description: `${SITE_NAME}의 설립 목적, 연혁, 조직, 주요 사업을 소개합니다.`,
  },
  "/about/executives": {
    title: "임원 명단",
    description: `${SITE_NAME} 임원진과 조직 구성을 소개합니다.`,
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
    description: `${SITE_NAME} 회칙과 운영 기준을 안내합니다.`,
  },
  "/about/join": {
    title: "회원가입 안내",
    description: "동국대학교 한의과대학 동문을 위한 회원가입 절차와 승인 과정을 안내합니다.",
  },
  "/about/dues": {
    title: "2026년 회비 안내",
    description: `2026년 ${SITE_NAME} 회비 금액과 납부 계좌, 권리회원 혜택을 안내합니다.`,
  },
  "/about/condolence": {
    title: "회원 경조사 지원 안내",
    description: "동문회 회원 경조사 문자, 화환, 근조기 지원 기준과 신청 방법을 안내합니다.",
  },
  "/admin": {
    title: "관리자",
    description: `${SITE_NAME} 관리자 전용 메뉴입니다.`,
  },
  "/b": {
    title: "공지 및 게시판",
    description: `${SITE_NAME}의 공지사항과 동문 소식을 확인합니다.`,
  },
  "/directory": {
    title: "동문 명부",
    description: "동국대학교 한의과대학 동문 연락처와 활동 정보를 확인합니다.",
  },
  "/profile": {
    title: "내 정보",
    description: `${SITE_NAME} 회원 정보를 확인하고 관리합니다.`,
  },
  "/search": {
    title: "검색",
    description: "동문회 게시글과 정보를 검색합니다.",
  },
  "/o": {
    title: "부고 알림",
    description: "동국대학교 한의과대학 동문들의 부고 소식을 함께 나눕니다.",
  },
  "/o/new": {
    title: "부고 등록",
    description: "동문회 부고 알림을 등록합니다.",
  },
  "/events": {
    title: "경조사",
    description: `${SITE_NAME} 회원 경조사 소식을 확인합니다.`,
    noIndex: true,
  },
};

function stripQueryAndHash(url: string) {
  return url.split("?")[0]?.split("#")[0] || "/";
}

function plainText(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function excerpt(value: string, maxLength = 150) {
  const text = plainText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getOrigin(req: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const protocol = req.protocol || "https";
  return `${protocol}://${req.get("host")}`;
}

async function getRouteSeo(pathname: string): Promise<SeoMeta> {
  if (/^\/(?:post|p|o|events|b)(?:\/|$)/.test(pathname) || pathname === "/b" || pathname === "/search") {
    return { title: "회원 게시판", description: "로그인한 회원만 게시글을 확인할 수 있습니다.", noIndex: true };
  }

  return (
    STATIC_SEO[pathname] || {
      title: "페이지를 찾을 수 없습니다",
      description: `요청하신 ${SITE_NAME} 페이지를 찾을 수 없습니다.`,
    }
  );
}

function upsertMetaTag(html: string, selector: string, tag: string) {
  const [attr, rawKey] = selector.split("=") as ["name" | "property", string];
  const key = rawKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attrPattern = `<meta\\s+[^>]*${attr}=["']${key}["'][^>]*>`;
  const regex = new RegExp(attrPattern, "i");

  if (regex.test(html)) {
    return html.replace(regex, tag);
  }

  return html.replace("</head>", `    ${tag}\n  </head>`);
}

function upsertLinkTag(html: string, rel: string, tag: string) {
  const regex = new RegExp(`<link\\s+[^>]*rel=["']${rel}["'][^>]*>`, "i");
  if (regex.test(html)) return html.replace(regex, tag);
  return html.replace("</head>", `    ${tag}\n  </head>`);
}

export async function injectSeo(req: Request, html: string) {
  const pathname = stripQueryAndHash(req.originalUrl || req.url);
  const origin = getOrigin(req);
  const meta = await getRouteSeo(pathname);
  const title = siteTitle(meta.title);
  const description = meta.description || DEFAULT_DESCRIPTION;
  const keywords = meta.keywords || DEFAULT_KEYWORDS;
  const url = `${origin}${pathname}`;
  const imagePath = meta.image || DEFAULT_IMAGE;
  const image = imagePath.startsWith("http") ? imagePath : `${origin}${imagePath}`;
  const type = meta.type || "website";
  const robots = meta.noIndex ? "noindex, nofollow" : "index, follow";

  let nextHtml = html.replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  nextHtml = upsertLinkTag(nextHtml, "canonical", `<link rel="canonical" href="${escapeHtml(url)}" />`);

  const tags: Array<[string, string]> = [
    ["name=description", `<meta name="description" content="${escapeHtml(description)}" />`],
    ["name=keywords", `<meta name="keywords" content="${escapeHtml(keywords)}" />`],
    ["name=robots", `<meta name="robots" content="${robots}" />`],
    ["property=og:site_name", `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`],
    ["property=og:title", `<meta property="og:title" content="${escapeHtml(title)}" />`],
    ["property=og:description", `<meta property="og:description" content="${escapeHtml(description)}" />`],
    ["property=og:type", `<meta property="og:type" content="${type}" />`],
    ["property=og:url", `<meta property="og:url" content="${escapeHtml(url)}" />`],
    ["property=og:image", `<meta property="og:image" content="${escapeHtml(image)}" />`],
    ["property=og:locale", `<meta property="og:locale" content="ko_KR" />`],
    ["name=twitter:card", `<meta name="twitter:card" content="summary_large_image" />`],
    ["name=twitter:title", `<meta name="twitter:title" content="${escapeHtml(title)}" />`],
    ["name=twitter:description", `<meta name="twitter:description" content="${escapeHtml(description)}" />`],
    ["name=twitter:image", `<meta name="twitter:image" content="${escapeHtml(image)}" />`],
  ];

  for (const [selector, tag] of tags) {
    nextHtml = upsertMetaTag(nextHtml, selector, tag);
  }

  return nextHtml;
}
