import { useEffect } from "react";

const SITE_NAME = "동국대학교한의과대학동문회";
const DEFAULT_DESCRIPTION =
  "동국대학교 한의과대학 동문회 공식 플랫폼. 회칙, 회비, 경조사 지원, 동문 명부와 게시판을 한 곳에서 이용하세요.";
const DEFAULT_KEYWORDS =
  "동국한의동문회, 동국대학교한의과대학동문회, 동국한의대, 동문회, 한의과대학 동문";

export interface SeoOptions {
  title: string;
  description?: string;
  image?: string;
  path?: string;
  keywords?: string;
  type?: "website" | "article";
}

function setMeta(attr: "name" | "property", key: string, content: string) {
  if (!content) return;
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function applySeo(opts: SeoOptions) {
  if (typeof document === "undefined") return;

  const fullTitle = opts.title.includes(SITE_NAME)
    ? opts.title
    : `${opts.title} | ${SITE_NAME}`;
  const description = opts.description || DEFAULT_DESCRIPTION;
  const keywords = opts.keywords || DEFAULT_KEYWORDS;
  const origin =
    typeof window !== "undefined" && window.location
      ? window.location.origin
      : "";
  const path =
    opts.path ??
    (typeof window !== "undefined" ? window.location.pathname : "/");
  const url = origin ? `${origin}${path}` : path;
  const image = opts.image
    ? opts.image.startsWith("http")
      ? opts.image
      : `${origin}${opts.image}`
    : `${origin}/og-image.png`;

  document.title = fullTitle;
  setMeta("name", "description", description);
  setMeta("name", "keywords", keywords);
  setMeta("name", "robots", "index, follow");
  setLink("canonical", url);

  setMeta("property", "og:site_name", SITE_NAME);
  setMeta("property", "og:title", fullTitle);
  setMeta("property", "og:description", description);
  setMeta("property", "og:type", opts.type || "website");
  setMeta("property", "og:url", url);
  setMeta("property", "og:image", image);
  setMeta("property", "og:locale", "ko_KR");

  setMeta("name", "twitter:card", "summary_large_image");
  setMeta("name", "twitter:title", fullTitle);
  setMeta("name", "twitter:description", description);
  setMeta("name", "twitter:image", image);
}

export function useSeo(opts: SeoOptions) {
  useEffect(() => {
    applySeo(opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.title, opts.description, opts.image, opts.path, opts.type, opts.keywords]);
}
