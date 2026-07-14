import {
  assertSafeSourceUrl,
  EventSourcePolicyError,
  extractEventSourceUrls,
} from "./event-source-policy";
import { fetchPublicPage, type PublicPageResult } from "./public-page-fetcher";
import { extractPublicPageText } from "./public-page-text";

const SOURCE_MESSAGES = {
  fetched: "링크 내용을 불러왔습니다.",
  unavailable: "링크가 종료되었거나 공개되지 않아 입력한 문자만 분석했습니다.",
  blocked: "안전하지 않은 주소는 읽지 않았습니다.",
} as const;

export type EventSourceStatus = {
  url: string;
  status: "fetched" | "unavailable" | "blocked";
  message?: string;
};

export type EventSourceReadResult = {
  combinedText: string;
  urls: string[];
  sources: EventSourceStatus[];
};

export type EventSourceReaderDependencies = {
  fetchPage?: (url: string, signal?: AbortSignal) => Promise<PublicPageResult>;
  extractText?: (page: PublicPageResult) => string;
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

export async function readEventSources(
  input: string,
  dependencies: EventSourceReaderDependencies = {},
  signal?: AbortSignal,
): Promise<EventSourceReadResult> {
  throwIfAborted(signal);
  const urls = extractEventSourceUrls(input);
  const fetchPage = dependencies.fetchPage ?? fetchPublicPage;
  const extractText = dependencies.extractText ?? extractPublicPageText;
  const textParts = [withoutSourceUrls(input, urls)].filter(Boolean);
  const sources: EventSourceStatus[] = [];

  for (const url of urls) {
    throwIfAborted(signal);
    try {
      assertSafeSourceUrl(url);
      const page = await fetchPage(url, signal);
      const extracted = normalizeSourceText(extractText(page));
      if (!extracted) throw new Error("empty public page");
      textParts.push(extracted);
      sources.push({ url, status: "fetched", message: SOURCE_MESSAGES.fetched });
    } catch (error) {
      throwIfAborted(signal);
      const blocked = error instanceof EventSourcePolicyError;
      sources.push({
        url,
        status: blocked ? "blocked" : "unavailable",
        message: blocked ? SOURCE_MESSAGES.blocked : SOURCE_MESSAGES.unavailable,
      });
    }
  }

  return {
    combinedText: textParts.join("\n"),
    urls,
    sources,
  };
}
