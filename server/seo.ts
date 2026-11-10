import type { Express, Request } from "express";
import { PUBLIC_PAGES, getPublicPageMetadata } from "@shared/public-pages";

import {
  SITE_NAME,
  SITE_HOME_CANONICAL_URL,
  SITE_DESCRIPTION as DEFAULT_DESCRIPTION,
  SITE_KEYWORDS as DEFAULT_KEYWORDS,
  SITE_IMAGE as DEFAULT_IMAGE,
  siteTitle,
  siteCanonicalUrl,
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
  "/admin": {
    title: "관리자",
    description: `${SITE_NAME} 관리자 전용 메뉴입니다.`,
  },
  "/directory": {
    title: "동문 명부",
    description: "동국대학교 한의과대학 동문 연락처와 활동 정보를 확인합니다.",
  },
  "/profile": {
    title: "내 정보",
    description: `${SITE_NAME} 회원 정보를 확인하고 관리합니다.`,
  },
};

function stripQueryAndHash(url: string) {
  return url.split("?")[0]?.split("#")[0] || "/";
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
  if (/^\/(?:post|p|o|events|b)(?:\/|$)/.test(pathname) || pathname === "/search") {
    return {
      title: "회원 게시판",
      description: "로그인한 회원만 게시글을 확인할 수 있습니다.",
      noIndex: true,
    };
  }

  return (
    getPublicPageMetadata(pathname) ||
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
  const url = siteCanonicalUrl(pathname, origin);
  const imagePath = meta.image || DEFAULT_IMAGE;
  const image = imagePath.startsWith("http") ? imagePath : `${origin}${imagePath}`;
  const type = meta.type || "website";
  const robots = meta.noIndex ? "noindex, nofollow" : "index, follow";

  let nextHtml = html.replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  nextHtml = upsertLinkTag(
    nextHtml,
    "canonical",
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
  );

  const tags: Array<[string, string]> = [
    ["name=description", `<meta name="description" content="${escapeHtml(description)}" />`],
    ["name=keywords", `<meta name="keywords" content="${escapeHtml(keywords)}" />`],
    ["name=robots", `<meta name="robots" content="${robots}" />`],
    [
      "property=og:site_name",
      `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    ],
    ["property=og:title", `<meta property="og:title" content="${escapeHtml(title)}" />`],
    [
      "property=og:description",
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
    ],
    ["property=og:type", `<meta property="og:type" content="${type}" />`],
    ["property=og:url", `<meta property="og:url" content="${escapeHtml(url)}" />`],
    ["property=og:image", `<meta property="og:image" content="${escapeHtml(image)}" />`],
    ["property=og:locale", `<meta property="og:locale" content="ko_KR" />`],
    ["name=twitter:card", `<meta name="twitter:card" content="summary_large_image" />`],
    ["name=twitter:title", `<meta name="twitter:title" content="${escapeHtml(title)}" />`],
    [
      "name=twitter:description",
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    ],
    ["name=twitter:image", `<meta name="twitter:image" content="${escapeHtml(image)}" />`],
  ];

  for (const [selector, tag] of tags) {
    nextHtml = upsertMetaTag(nextHtml, selector, tag);
  }

  return nextHtml;
}

// Public metadata comes only from fixed page definitions; it never reads posts or sessions.
export function registerPublicMetadataRoutes(app: Express): void {
  app.get("/sitemap.xml", (_req, res) => {
    const origin = new URL(SITE_HOME_CANONICAL_URL).origin;
    const urls = new Set(Object.keys(PUBLIC_PAGES).map((path) => siteCanonicalUrl(path, origin)));
    const entries = Array.from(urls)
      .map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`)
      .join("\n");
    res
      .type("application/xml")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`,
      );
  });
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /profile
Disallow: /directory
Disallow: /b
Disallow: /p/
Disallow: /post/
Disallow: /o
Disallow: /events
Disallow: /events/
Disallow: /search
Disallow: /auth/
Disallow: /kakao-callback

Sitemap: ${new URL("sitemap.xml", SITE_HOME_CANONICAL_URL).href}
`);
  });
}
