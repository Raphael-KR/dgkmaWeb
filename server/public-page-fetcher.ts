import dns from "node:dns";
import * as http from "node:http";
import * as https from "node:https";
import type { IncomingMessage } from "node:http";
import net, { type LookupFunction } from "node:net";
import {
  assertSafeSourceUrl,
  EventSourcePolicyError,
  isPublicAddress,
} from "./event-source-policy";

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 5_000;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

export type PublicPageResult = {
  requestedUrl: string;
  finalUrl: string;
  contentType: "text/html" | "text/plain";
  body: string;
};

export type RawPublicResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
};

export type RequestPublicAddress = (
  url: URL,
  address: string,
  family: 4 | 6,
) => Promise<RawPublicResponse>;

export type PublicPageFetcherDependencies = {
  lookup?: typeof dns.promises.lookup;
  requestPublicAddress?: RequestPublicAddress;
};

function headerValue(
  headers: RawPublicResponse["headers"],
  name: string,
): string | undefined {
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
  return Array.isArray(value) ? value[0] : value;
}

function clearRequestTimer(timer: NodeJS.Timeout): void {
  clearTimeout(timer);
}

function createTimedBody(
  response: IncomingMessage,
  timer: NodeJS.Timeout,
): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
      const iterator = response[Symbol.asyncIterator]();
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearRequestTimer(timer);
      };

      return {
        async next(): Promise<IteratorResult<Uint8Array>> {
          try {
            const result = await iterator.next();
            if (result.done) {
              finish();
              return { done: true, value: undefined };
            }
            return {
              done: false,
              value: result.value instanceof Uint8Array
                ? result.value
                : Buffer.from(result.value),
            };
          } catch (error) {
            finish();
            throw error;
          }
        },
        async return(): Promise<IteratorResult<Uint8Array>> {
          if (!response.destroyed) response.destroy();
          try {
            await iterator.return?.();
          } finally {
            finish();
          }
          return { done: true, value: undefined };
        },
      };
    },
  };
}

export function requestPublicAddress(
  url: URL,
  address: string,
  family: 4 | 6,
): Promise<RawPublicResponse> {
  const isHttps = url.protocol === "https:";
  const transport = isHttps ? https : http;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const pinnedLookup: LookupFunction = (_hostname, _options, callback) => {
    if (_options.all) {
      callback(null, [{ address, family }]);
      return;
    }
    callback(null, address, family);
  };

  return new Promise((resolve, reject) => {
    let receivedResponse = false;
    const request = transport.request({
      protocol: url.protocol,
      hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: {
        Accept: "text/html, text/plain;q=0.9",
        "Accept-Encoding": "identity",
        Connection: "close",
        Host: url.host,
      },
      agent: false,
      lookup: pinnedLookup,
      servername: isHttps && !net.isIP(hostname) ? hostname : undefined,
    }, (response) => {
      receivedResponse = true;
      resolve({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: createTimedBody(response, timer),
      });
    });
    const timer = setTimeout(() => {
      request.destroy(new Error("요청 시간 제한을 초과했습니다"));
    }, REQUEST_TIMEOUT_MS);

    request.once("error", (error) => {
      if (!receivedResponse) {
        clearRequestTimer(timer);
        reject(error);
      }
    });
    request.end();
  });
}

async function resolvePublicAddress(
  url: URL,
  lookup: typeof dns.promises.lookup,
): Promise<{ address: string; family: 4 | 6 }> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const answers = await lookup(hostname, { all: true, verbatim: true });
  if (!Array.isArray(answers) || answers.length === 0) {
    throw new Error("주소를 확인할 수 없습니다");
  }
  if (answers.some((answer) => {
    const detectedFamily = net.isIP(answer.address);
    return (answer.family !== 4 && answer.family !== 6)
      || detectedFamily !== answer.family;
  })) {
    throw new Error("주소를 확인할 수 없습니다");
  }
  if (answers.some((answer) => !isPublicAddress(answer.address))) {
    throw new EventSourcePolicyError("공개 주소가 아닌 대상은 읽을 수 없습니다");
  }

  const selected = answers[0];
  if (!selected || (selected.family !== 4 && selected.family !== 6)) {
    throw new Error("주소를 확인할 수 없습니다");
  }
  return { address: selected.address, family: selected.family };
}

async function cancelBody(body: AsyncIterable<Uint8Array>): Promise<void> {
  const iterator = body[Symbol.asyncIterator]();
  try {
    await iterator.return?.();
  } catch {
    // The response is already being rejected for policy reasons.
  }
}

async function readBoundedBody(body: AsyncIterable<Uint8Array>): Promise<string> {
  const iterator = body[Symbol.asyncIterator]();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let completed = false;

  try {
    while (true) {
      const next = await iterator.next();
      if (next.done) {
        completed = true;
        return Buffer.concat(chunks).toString("utf8");
      }

      totalBytes += next.value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        throw new Error("응답 본문은 512 KiB를 초과할 수 없습니다");
      }
      chunks.push(next.value);
    }
  } finally {
    if (!completed) await cancelBody({ [Symbol.asyncIterator]: () => iterator });
  }
}

function responseContentType(response: RawPublicResponse): "text/html" | "text/plain" | undefined {
  const contentType = headerValue(response.headers, "content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  return contentType === "text/html" || contentType === "text/plain" ? contentType : undefined;
}

function isCompressed(response: RawPublicResponse): boolean {
  const encoding = headerValue(response.headers, "content-encoding");
  return Boolean(encoding && encoding.split(",").some((value) => {
    const normalized = value.trim().toLowerCase();
    return normalized && normalized !== "identity";
  }));
}

function declaredBodyTooLarge(response: RawPublicResponse): boolean {
  const contentLength = headerValue(response.headers, "content-length");
  if (!contentLength) return false;
  const parsed = Number(contentLength);
  return Number.isFinite(parsed) && parsed > MAX_BODY_BYTES;
}

export async function fetchPublicPage(
  rawUrl: string,
  dependencies: PublicPageFetcherDependencies = {},
): Promise<PublicPageResult> {
  const requestedUrl = assertSafeSourceUrl(rawUrl);
  const lookup = dependencies.lookup ?? dns.promises.lookup;
  const request = dependencies.requestPublicAddress ?? requestPublicAddress;
  let currentUrl = requestedUrl;
  let redirects = 0;

  while (true) {
    const safeUrl = assertSafeSourceUrl(currentUrl.href);
    const address = await resolvePublicAddress(safeUrl, lookup);
    const response = await request(safeUrl, address.address, address.family);

    if (REDIRECT_STATUS_CODES.has(response.status)) {
      const location = headerValue(response.headers, "location");
      await cancelBody(response.body);
      if (!location) throw new Error("리디렉션 위치가 없습니다");
      if (redirects >= MAX_REDIRECTS) throw new Error("리디렉션 횟수가 너무 많습니다");

      currentUrl = assertSafeSourceUrl(new URL(location, safeUrl).href);
      redirects += 1;
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      await cancelBody(response.body);
      throw new Error(`페이지를 읽을 수 없습니다 (${response.status})`);
    }
    if (isCompressed(response)) {
      await cancelBody(response.body);
      throw new Error("압축된 응답은 읽을 수 없습니다");
    }

    const contentType = responseContentType(response);
    if (!contentType) {
      await cancelBody(response.body);
      throw new Error("텍스트 형식의 응답만 읽을 수 있습니다");
    }
    if (declaredBodyTooLarge(response)) {
      await cancelBody(response.body);
      throw new Error("응답 본문은 512 KiB를 초과할 수 없습니다");
    }

    return {
      requestedUrl: requestedUrl.href,
      finalUrl: safeUrl.href,
      contentType,
      body: await readBoundedBody(response.body),
    };
  }
}
