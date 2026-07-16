import net from "node:net";

const MAX_SOURCE_URLS = 3;
const TRAILING_URL_PUNCTUATION = /[),.\]}>!?;:'"，。、；：！？…]+$/;

export class EventSourcePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventSourcePolicyError";
  }
}

function ipv4Octets(address: string): number[] | undefined {
  if (net.isIP(address) !== 4) return undefined;
  return address.split(".").map(Number);
}

function isPublicIpv4(address: string): boolean {
  const octets = ipv4Octets(address);
  if (!octets) return false;

  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;

  return true;
}

function expandIpv6(address: string): number[] | undefined {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (net.isIP(normalized) !== 6) return undefined;

  const embeddedIpv4 = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  let working = normalized;
  if (embeddedIpv4) {
    const octets = ipv4Octets(embeddedIpv4);
    if (!octets) return undefined;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    working = working.slice(0, -embeddedIpv4.length) + `${high}:${low}`;
  }

  const halves = working.split("::");
  if (halves.length > 2) return undefined;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const omitted = 8 - left.length - right.length;
  if ((halves.length === 1 && omitted !== 0) || omitted < 0) return undefined;

  const groups = [
    ...left,
    ...Array.from({ length: omitted }, () => "0"),
    ...right,
  ].map((group) => Number.parseInt(group || "0", 16));

  return groups.length === 8 && groups.every(Number.isFinite) ? groups : undefined;
}

function mappedIpv4(groups: number[]): string | undefined {
  const isMapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (!isMapped) return undefined;

  return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
}

function isPublicIpv6(address: string): boolean {
  const groups = expandIpv6(address);
  if (!groups) return false;

  const mapped = mappedIpv4(groups);
  if (mapped) return isPublicIpv4(mapped);

  // Public source pages should currently resolve to global unicast space only.
  if ((groups[0] & 0xe000) !== 0x2000) return false;
  if (groups[0] === 0x2001 && groups[1] < 0x0200) return false;
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return false;
  if (groups[0] === 0x2002) return false;
  if (groups[0] === 0x3fff && groups[1] < 0x1000) return false;

  return true;
}

export function isPublicAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, "");
  const family = net.isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family === 6) return isPublicIpv6(normalized);
  return false;
}

function isObviouslyNonPublicHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (!normalized.includes(".")) return true;

  return [".localhost", ".local", ".internal", ".lan", ".home.arpa"].some(
    (suffix) => normalized.endsWith(suffix),
  );
}

export function extractEventSourceUrls(input: string): string[] {
  const matches = input.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  const urls: string[] = [];

  for (const match of matches) {
    const cleaned = match.replace(TRAILING_URL_PUNCTUATION, "");
    if (!cleaned || urls.includes(cleaned)) continue;
    urls.push(cleaned);
    if (urls.length === MAX_SOURCE_URLS) break;
  }

  return urls;
}

export function assertSafeSourceUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new EventSourcePolicyError("올바른 주소가 아닙니다");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new EventSourcePolicyError("지원하지 않는 주소 형식입니다");
  }
  if (url.username || url.password) {
    throw new EventSourcePolicyError("인증 정보가 포함된 주소는 사용할 수 없습니다");
  }
  if (
    (url.protocol === "http:" && url.port && url.port !== "80") ||
    (url.protocol === "https:" && url.port && url.port !== "443")
  ) {
    throw new EventSourcePolicyError("기본 포트가 아닌 주소는 사용할 수 없습니다");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    (net.isIP(hostname) && !isPublicAddress(hostname))
    || (!net.isIP(hostname) && isObviouslyNonPublicHostname(hostname))
  ) {
    throw new EventSourcePolicyError("공개 주소가 아닌 대상은 읽을 수 없습니다");
  }

  return url;
}
