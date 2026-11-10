import type { NoticeFacts, NoticeType } from "@shared/contracts/notices";
import {
  assertSafeSourceUrl,
  EventSourcePolicyError,
  extractEventSourceUrls,
} from "./event-source-policy";
import {
  fetchPublicPage,
  type PublicPageResult,
} from "../../integrations/public-sources/public-page-fetcher";
import { extractPublicPageText } from "../../integrations/public-sources/public-page-text";
import {
  isGipoomPublicObituaryUrl,
  readGipoomNotice,
} from "../../integrations/public-sources/gipoom-public-api";
import { parseObituaryEventSource } from "./obituary-parser";
import {
  collectPublicNotice,
  CollectionUnavailableError,
} from "../../integrations/public-sources/notice-collector";
import type {
  CollectionResult,
  FieldEvidence,
  RuleStore,
} from "../../integrations/public-sources/collection-contract";

const SOURCE_MESSAGES = {
  fetched: "링크 내용을 불러왔습니다.",
  unavailable: "링크가 종료되었거나 공개되지 않아 입력한 문자만 분석했습니다.",
  blocked: "안전하지 않은 주소는 읽지 않았습니다.",
} as const;

export type EventSourceStatus = {
  url: string;
  status: "fetched" | "unavailable" | "blocked";
  method?: "provider-api" | CollectionResult["method"];
  diagnostics?: CollectionResult["diagnostics"];
  message?: string;
};

export type EventSourceReadResult = {
  combinedText: string;
  structuredObituary?: NoticeFacts;
  urls: string[];
  sources: EventSourceStatus[];
  evidence?: FieldEvidence[];
};

export type EventSourceReaderDependencies = {
  fetchPage?: (url: string, signal?: AbortSignal) => Promise<PublicPageResult>;
  readProviderSource?: (url: string, signal?: AbortSignal) => Promise<string | undefined>;
  extractText?: (page: PublicPageResult) => string;
  ruleStore?: RuleStore;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("경조사 원문 분석이 중단되었습니다");
  error.name = "AbortError";
  throw error;
}

function normalizeSourceText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t\f\v ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function withoutSourceUrls(input: string, urls: string[]): string {
  let text = input;
  for (const url of urls) text = text.split(url).join(" ");
  return normalizeSourceText(text);
}

function hasUnavailableSourceEvidence(text: string): boolean {
  return /(?:삭제|종료)된\s*(?:부고|게시물)|존재하지\s*않는\s*(?:부고|게시물)|다음\s*항목에\s*오류가\s*있습니다|Warning:\s*(?:include|require)(?:_once)?\(|failed to open stream|Failed opening\s+['"]?\/[^\s]+/.test(
    text,
  );
}

function hasCompleteObituaryEvidence(text: string): boolean {
  return parseObituaryEventSource(text).missingFields.length === 0;
}

export async function readEventSources(
  input: string,
  dependencies: EventSourceReaderDependencies = {},
  signal?: AbortSignal,
  noticeType: NoticeType = "obituary",
): Promise<EventSourceReadResult> {
  throwIfAborted(signal);
  const urls = extractEventSourceUrls(input);
  const fetchPage =
    dependencies.fetchPage ?? ((url, requestSignal) => fetchPublicPage(url, {}, requestSignal));
  const extractText = dependencies.extractText ?? extractPublicPageText;
  const textParts = [withoutSourceUrls(input, urls)].filter(Boolean);
  const sources: EventSourceStatus[] = [];
  const evidence: FieldEvidence[] = [];
  let structuredObituary: NoticeFacts | undefined;

  for (const url of urls) {
    throwIfAborted(signal);
    try {
      assertSafeSourceUrl(url);
      let extracted = "";
      let method: EventSourceStatus["method"];
      let diagnostics: CollectionResult["diagnostics"] | undefined;
      try {
        if (
          noticeType === "obituary" &&
          !dependencies.readProviderSource &&
          isGipoomPublicObituaryUrl(url)
        ) {
          const provider = await readGipoomNotice(url, signal);
          extracted = normalizeSourceText(provider.text);
          structuredObituary = provider.facts;
          const collectedAt = new Date().toISOString();
          for (const [field, value] of Object.entries(provider.facts)) {
            if (typeof value === "string" && value)
              evidence.push({
                field,
                value,
                url,
                locator: "provider:" + field,
                kind: "api",
                collectedAt,
              });
          }
        } else
          extracted = normalizeSourceText(
            (await dependencies.readProviderSource?.(url, signal)) ?? "",
          );
        if (extracted) method = "provider-api";
      } catch {
        throwIfAborted(signal);
        // A provider adapter is an optimization; the existing page readers remain the fallback.
      }
      if (!extracted) {
        if (dependencies.fetchPage || dependencies.extractText || dependencies.readProviderSource) {
          // Keep injected readers free of database/browser side effects.
          const page = await fetchPage(url, signal);
          extracted = normalizeSourceText(extractText(page));
          if (extracted) method = "static-html";
        } else {
          const store =
            dependencies.ruleStore ?? (await import("./collection-rule-store")).collectionRuleStore;
          const collected = await collectPublicNotice(url, store, signal, noticeType);
          extracted = normalizeSourceText(collected.text);
          method = collected.method;
          diagnostics = collected.diagnostics;
          evidence.push(...collected.evidence);
          evidence.push({
            field: "sourceText",
            value: extracted,
            url,
            locator: "collected-text",
            kind:
              method === "ocr"
                ? "ocr"
                : method === "browser"
                  ? "rendered"
                  : method === "static-html"
                    ? "html"
                    : "api",
            collectedAt: new Date().toISOString(),
          });
        }
      }
      if (hasUnavailableSourceEvidence(extracted)) throw new Error("unavailable public source");
      if (
        noticeType === "obituary" &&
        isGipoomPublicObituaryUrl(url) &&
        !structuredObituary &&
        !hasCompleteObituaryEvidence(extracted)
      ) {
        throw new Error("incomplete public obituary source");
      }
      if (!extracted) throw new Error("empty public page");
      textParts.push(extracted);
      sources.push({
        url,
        status: "fetched",
        method,
        diagnostics,
        message: SOURCE_MESSAGES.fetched,
      });
    } catch (error) {
      throwIfAborted(signal);
      const blocked = error instanceof EventSourcePolicyError;
      sources.push({
        url,
        status: blocked ? "blocked" : "unavailable",
        message: blocked ? SOURCE_MESSAGES.blocked : SOURCE_MESSAGES.unavailable,
        diagnostics: error instanceof CollectionUnavailableError ? error.diagnostics : undefined,
      });
    }
  }

  return {
    combinedText: textParts.join("\n"),
    structuredObituary:
      urls.length === 1 && sources[0]?.status === "fetched" ? structuredObituary : undefined,
    urls,
    sources,
    evidence,
  };
}
