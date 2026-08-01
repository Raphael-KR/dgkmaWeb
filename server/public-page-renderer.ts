import dns from "node:dns";
import { access } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import type { Browser, LaunchOptions } from "puppeteer-core";
import { EventSourcePolicyError, isPublicAddress } from "./event-source-policy";
import type { PublicPageResult } from "./public-page-fetcher";

const RENDER_TIMEOUT_MS = 8_000;
const MAX_RENDERED_TEXT_LENGTH = 64 * 1024;
const GIPOOM_SOURCE_HOST = "bugo.gipoom.com";
const GIPOOM_ALLOWED_HOSTS = [GIPOOM_SOURCE_HOST, "api.smartnanumi.com"] as const;

type LookupAddress = { address: string; family: number };
export type RendererLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<LookupAddress[]>;

export type RendererAddress = {
  hostname: string;
  address: string;
  family: 4 | 6;
};

export type PublicPageRendererDependencies = {
  lookup?: RendererLookup;
  launchBrowser?: (options: LaunchOptions) => Promise<Browser>;
  executablePath?: string;
};

function normalizedHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, "");
}

function supportedSourceUrl(rawUrl: string): URL | undefined {
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || (url.port && url.port !== "443")
      || normalizedHostname(url) !== GIPOOM_SOURCE_HOST
    ) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

export function isJavaScriptRenderingSupported(rawUrl: string): boolean {
  return Boolean(supportedSourceUrl(rawUrl));
}

export function assertAllowedRendererRequest(rawUrl: string, sourceUrl: URL): URL {
  if (!isJavaScriptRenderingSupported(sourceUrl.href)) {
    throw new EventSourcePolicyError("JavaScript 렌더링을 허용하지 않은 출처입니다");
  }

  let requestUrl: URL;
  try {
    requestUrl = new URL(rawUrl);
  } catch {
    throw new EventSourcePolicyError("올바른 렌더링 요청 주소가 아닙니다");
  }

  if (
    requestUrl.protocol !== "https:"
    || requestUrl.username
    || requestUrl.password
    || (requestUrl.port && requestUrl.port !== "443")
    || !GIPOOM_ALLOWED_HOSTS.includes(normalizedHostname(requestUrl) as typeof GIPOOM_ALLOWED_HOSTS[number])
  ) {
    throw new EventSourcePolicyError("허용하지 않은 렌더링 요청입니다");
  }
  return requestUrl;
}

export function assertAllowedRendererNavigation(rawUrl: string, sourceUrl: URL): URL {
  const navigationUrl = assertAllowedRendererRequest(rawUrl, sourceUrl);
  if (normalizedHostname(navigationUrl) !== normalizedHostname(sourceUrl)) {
    throw new EventSourcePolicyError("출처 밖으로 이동하는 렌더링 요청입니다");
  }
  return navigationUrl;
}

export async function resolveRendererAddresses(
  hostnames: readonly string[],
  lookup: RendererLookup,
): Promise<RendererAddress[]> {
  const resolved: RendererAddress[] = [];
  for (const hostname of hostnames) {
    const answers = await lookup(hostname, { all: true, verbatim: true });
    if (!answers.length || answers.some(({ address, family }) => {
      const detectedFamily = net.isIP(address);
      return (family !== 4 && family !== 6) || detectedFamily !== family;
    })) {
      throw new Error("주소를 확인할 수 없습니다");
    }
    if (answers.some(({ address }) => !isPublicAddress(address))) {
      throw new EventSourcePolicyError("공개 주소가 아닌 대상은 렌더링할 수 없습니다");
    }

    const selected = answers.find(({ family }) => family === 4) ?? answers[0];
    if (!selected || (selected.family !== 4 && selected.family !== 6)) {
      throw new Error("주소를 확인할 수 없습니다");
    }
    resolved.push({ hostname, address: selected.address, family: selected.family });
  }
  return resolved;
}

export function buildHostResolverRules(addresses: readonly RendererAddress[]): string {
  const mappings = addresses.map(({ hostname, address, family }) =>
    `MAP ${hostname} ${family === 6 ? `[${address}]` : address}`,
  );
  return [...mappings, "MAP * ~NOTFOUND", "EXCLUDE localhost"].join(", ");
}

async function findChromiumExecutable(explicitPath?: string): Promise<string> {
  const candidates = [
    explicitPath,
    process.env.CHROMIUM_PATH,
    ...((process.env.PATH ?? "").split(path.delimiter).flatMap((directory) => [
      path.join(directory, "chromium"),
      path.join(directory, "chromium-browser"),
    ])),
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of Array.from(new Set(candidates))) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue to the next known executable location.
    }
  }
  throw new Error("Chromium 실행 파일을 찾을 수 없습니다");
}

function abortError(): Error {
  const error = new Error("공개 페이지 렌더링이 중단되었습니다");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

export async function renderPublicPage(
  rawUrl: string,
  dependencies: PublicPageRendererDependencies = {},
  signal?: AbortSignal,
): Promise<PublicPageResult> {
  throwIfAborted(signal);
  const sourceUrl = supportedSourceUrl(rawUrl);
  if (!sourceUrl) throw new EventSourcePolicyError("JavaScript 렌더링을 허용하지 않은 출처입니다");

  const lookup: RendererLookup = dependencies.lookup
    ?? ((hostname, options) => dns.promises.lookup(hostname, options));
  const addresses = await resolveRendererAddresses(GIPOOM_ALLOWED_HOSTS, lookup);
  throwIfAborted(signal);

  const executablePath = await findChromiumExecutable(dependencies.executablePath);
  const launchBrowser = dependencies.launchBrowser ?? (async (options) => {
    const puppeteer = await import("puppeteer-core");
    return puppeteer.default.launch(options);
  });
  const browser = await launchBrowser({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-sync",
      `--host-resolver-rules=${buildHostResolverRules(addresses)}`,
    ],
  });
  const onAbort = () => { void browser.close(); };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      try {
        if (request.isNavigationRequest()) {
          assertAllowedRendererNavigation(request.url(), sourceUrl);
        } else {
          assertAllowedRendererRequest(request.url(), sourceUrl);
        }
        const blockedTypes = new Set(["image", "media", "font"]);
        if (blockedTypes.has(request.resourceType())) void request.abort();
        else void request.continue();
      } catch {
        void request.abort();
      }
    });

    await page.goto(sourceUrl.href, {
      waitUntil: "domcontentloaded",
      timeout: RENDER_TIMEOUT_MS,
    });
    await page.waitForFunction(
      () => (document.body?.innerText?.trim().length ?? 0) >= 80,
      { timeout: RENDER_TIMEOUT_MS },
    );
    throwIfAborted(signal);
    assertAllowedRendererNavigation(page.url(), sourceUrl);
    const body = (await page.evaluate(() => document.body?.innerText ?? ""))
      .slice(0, MAX_RENDERED_TEXT_LENGTH);
    if (!body.trim()) throw new Error("렌더링된 공개 페이지가 비어 있습니다");

    return {
      requestedUrl: sourceUrl.href,
      finalUrl: page.url(),
      contentType: "text/plain",
      body,
    };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await browser.close().catch(() => undefined);
  }
}
