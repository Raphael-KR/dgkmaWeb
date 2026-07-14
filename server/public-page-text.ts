import * as cheerio from "cheerio";
import { Parser } from "htmlparser2";

const MAX_EXTRACTED_TEXT_LENGTH = 20_000;
const MAX_HTML_ELEMENTS = 10_000;
const MAX_HTML_DEPTH = 256;
const JSON_LD_FIELDS = new Set(["name", "description", "startDate", "location"]);
const REMOVED_SELECTORS = [
  "script",
  "style",
  "noscript",
  "nav",
  "form",
  "header",
  "footer",
  "aside",
  "svg",
  "template",
  "[hidden]",
  '[aria-hidden="true"]',
].join(",");

type PublicPageTextInput = {
  contentType: "text/html" | "text/plain";
  body: string;
};

function assertBoundedHtmlComplexity(body: string): void {
  let depth = 0;
  let elements = 0;
  const reject = () => {
    throw new Error("페이지 구조가 너무 복잡합니다");
  };
  const parser = new Parser({
    onopentag() {
      elements += 1;
      depth += 1;
      if (elements > MAX_HTML_ELEMENTS || depth > MAX_HTML_DEPTH) reject();
    },
    onclosetag() {
      depth = Math.max(0, depth - 1);
    },
  }, { decodeEntities: false });

  parser.write(body);
  parser.end();
}

function normalizeLines(value: string): string {
  const lines = value
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[\t\f\v ]+/g, " ").trim())
    .filter(Boolean);

  const deduplicated: string[] = [];
  for (const line of lines) {
    if (deduplicated[deduplicated.length - 1] !== line) deduplicated.push(line);
  }

  return deduplicated.join("\n").slice(0, MAX_EXTRACTED_TEXT_LENGTH);
}

function safeJsonLdValues(value: unknown): string[] {
  const values: string[] = [];
  let visited = 0;

  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || visited++ > 1_000 || node === null) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;

    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (
        JSON_LD_FIELDS.has(key)
        && (typeof child === "string" || typeof child === "number" || typeof child === "boolean")
      ) {
        values.push(String(child));
      }
      if (typeof child === "object" && child !== null) visit(child, depth + 1);
    }
  };

  visit(value, 0);
  return values;
}

function extractJsonLd($: cheerio.CheerioAPI): string[] {
  const values: string[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;
    try {
      values.push(...safeJsonLdValues(JSON.parse(raw)));
    } catch {
      // Invalid publisher metadata should not prevent visible text extraction.
    }
  });
  return values;
}

function visibleHtmlText($: cheerio.CheerioAPI): string {
  $(REMOVED_SELECTORS).remove();

  const root = $("main").first().length
    ? $("main").first()
    : $("article").first().length
      ? $("article").first()
      : $('[role="main"]').first().length
        ? $('[role="main"]').first()
        : $("body").first();

  root.find("br").replaceWith("\n");
  root.find("p, div, li, section, h1, h2, h3, h4, h5, h6, tr").append("\n");
  return root.text();
}

export function extractPublicPageText(page: PublicPageTextInput): string {
  if (page.contentType === "text/plain") return normalizeLines(page.body);

  assertBoundedHtmlComplexity(page.body);
  const $ = cheerio.load(page.body);
  const metadata = extractJsonLd($);
  return normalizeLines([...metadata, visibleHtmlText($)].join("\n"));
}
