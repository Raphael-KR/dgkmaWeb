import { useEffect } from "react";

import {
  SITE_NAME, SITE_DESCRIPTION as DEFAULT_DESCRIPTION, SITE_KEYWORDS as DEFAULT_KEYWORDS,
  SITE_IMAGE as DEFAULT_IMAGE, siteTitle,
} from "@shared/site";

export interface SeoOptions {
  title: string;
  description?: string;
  image?: string;
  path?: string;
  keywords?: string;
  type?: "website" | "article";
  noIndex?: boolean;
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

  const fullTitle = siteTitle(opts.title);
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
    : `${origin}${DEFAULT_IMAGE}`;

  document.title = fullTitle;
  setMeta("name", "description", description);
  setMeta("name", "keywords", keywords);
  setMeta("name", "robots", opts.noIndex ? "noindex, nofollow" : "index, follow");
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
  }, [opts.title, opts.description, opts.image, opts.path, opts.type, opts.keywords, opts.noIndex]);
}
