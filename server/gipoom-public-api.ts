import { z } from "zod";
import { fetchPublicJson } from "./public-page-fetcher";

const GIPOOM_SOURCE_HOST = "bugo.gipoom.com";
const GIPOOM_API_ROOT = "https://api.smartnanumi.com/public/member/";
const PUBLIC_ID_PATTERN = /^[0-9a-f]{24}$/i;

const optionalText = z.string().trim().min(1).nullish();
const gipoomResponseSchema = z.object({
  name: optionalText,
  phoneNumber: optionalText,
  reverseType: optionalText,
  bank: optionalText,
  cashAccount: optionalText,
  accountHolder: optionalText,
  fevent: z.object({
    deceasedInfo: z.object({
      name: z.string().trim().min(1),
      age: z.number().int().positive().max(130),
      sex: z.enum(["남", "여"]).nullish(),
      cemetery: optionalText,
      deathDate: optionalText,
      coffinOut: z.object({
        date: optionalText,
        time: optionalText,
      }).nullish(),
    }).passthrough(),
    funeralHome: z.object({
      info: z.object({ name: optionalText }).passthrough().nullish(),
    }).passthrough().nullish(),
    roomCurrent: z.object({
      name: optionalText,
      nameDetail: optionalText,
    }).passthrough().nullish(),
    room: z.object({
      name: optionalText,
      nameDetail: optionalText,
    }).passthrough().nullish(),
  }).passthrough(),
}).passthrough();

export type GipoomPublicApiDependencies = {
  fetchJson?: (url: string, signal?: AbortSignal) => Promise<unknown>;
};

function sourceUrl(rawUrl: string): URL | undefined {
  try {
    const url = new URL(rawUrl);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || (url.port && url.port !== "443")
      || url.hostname.toLowerCase().replace(/\.$/, "") !== GIPOOM_SOURCE_HOST
      || pathParts.length !== 1
      || !PUBLIC_ID_PATTERN.test(pathParts[0])
      || url.search
      || url.hash
    ) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

export function isGipoomPublicObituaryUrl(rawUrl: string): boolean {
  return Boolean(sourceUrl(rawUrl));
}

export function decodeGipoomPublicId(encoded: string): string {
  if (!PUBLIC_ID_PATTERN.test(encoded)) throw new Error("올바르지 않은 기품 공개 링크 ID입니다");
  return Array.from(encoded.toLowerCase(), (character, index) =>
    ((Number.parseInt(character, 16) - index % 16 + 16) % 16).toString(16))
    .join("")
    .split("")
    .reverse()
    .join("");
}

function hasExplicitTimezone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
}

function dateParts(value: string): { year: number; month: number; day: number } | undefined {
  if (hasExplicitTimezone(value)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(parsed);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((candidate) => candidate.type === type)?.value);
    return { year: part("year"), month: part("month"), day: part("day") };
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match
    ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
    : undefined;
}

function timeParts(value: string): { hour: number; minute: number } | undefined {
  if (hasExplicitTimezone(value)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(parsed);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((candidate) => candidate.type === type)?.value);
    return { hour: part("hour"), minute: part("minute") };
  }
  const match = value.match(/T(\d{2}):(\d{2})/);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : undefined;
}

function formatFuneralDate(dateValue?: string | null, timeValue?: string | null): string | undefined {
  if (!dateValue) return undefined;
  const date = dateParts(dateValue);
  if (!date) return undefined;
  const time = timeValue ? timeParts(timeValue) : undefined;
  return `${date.year}년 ${date.month}월 ${date.day}일${time
    ? ` ${time.hour}시 ${String(time.minute).padStart(2, "0")}분`
    : ""}`;
}

function normalizedPhone(value?: string | null): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  return /^010\d{8}$/.test(digits)
    ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    : undefined;
}

function relationLines(reverseType?: string | null, memberName?: string | null): string[] {
  if (!reverseType) return memberName ? [memberName] : [];
  const canonical = new Map([
    ["본인", "본인"],
    ["부친", "부친"],
    ["모친", "모친"],
    ["빙부", "빙부"],
    ["장인", "빙부"],
    ["빙모", "빙모"],
    ["장모", "빙모"],
    ["시부", "시부"],
    ["시모", "시모"],
    ["자녀", "자녀"],
  ]);
  const relationship = canonical.get(reverseType);
  if (relationship) return [`관계: ${relationship}`, ...(memberName ? [memberName] : [])];
  return [reverseType, ...(memberName ? [memberName] : [])];
}

function renderSelectedFields(value: z.infer<typeof gipoomResponseSchema>): string {
  const deceased = value.fevent.deceasedInfo;
  const room = value.fevent.roomCurrent ?? value.fevent.room;
  const funeralHome = [value.fevent.funeralHome?.info?.name, room?.name, room?.nameDetail]
    .filter(Boolean)
    .join(" ");
  const funeralDate = formatFuneralDate(deceased.coffinOut?.date, deceased.coffinOut?.time);
  const phone = normalizedPhone(value.phoneNumber);
  const account = value.bank && value.cashAccount && value.accountHolder
    ? `${value.bank} ${value.cashAccount} ${value.accountHolder}`
    : undefined;
  const lines = [
    `故 ${deceased.name}`,
    deceased.sex ? `${deceased.sex}/${deceased.age}세` : `향년 ${deceased.age}세`,
    ...relationLines(value.reverseType, value.name),
    deceased.deathDate ? `별세: ${deceased.deathDate}` : undefined,
    funeralDate ? `발인: ${funeralDate}` : undefined,
    funeralHome ? `빈소: ${funeralHome}` : undefined,
    deceased.cemetery ? `장지: ${deceased.cemetery}` : undefined,
    phone ? `연락처: ${phone}` : undefined,
    account ? `마음 전하실 곳: ${account}` : undefined,
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

export async function readGipoomPublicObituary(
  rawUrl: string,
  dependencies: GipoomPublicApiDependencies = {},
  signal?: AbortSignal,
): Promise<string> {
  const source = sourceUrl(rawUrl);
  if (!source) throw new Error("지원하지 않는 기품 공개 링크입니다");
  const encodedId = source.pathname.slice(1);
  const fetchJson = dependencies.fetchJson ?? ((url, requestSignal) =>
    fetchPublicJson(url, undefined, requestSignal));
  const response = await fetchJson(`${GIPOOM_API_ROOT}${decodeGipoomPublicId(encodedId)}`, signal);
  const parsed = gipoomResponseSchema.safeParse(response);
  if (!parsed.success) throw new Error("기품 공개 정보 형식을 확인할 수 없습니다");
  return renderSelectedFields(parsed.data);
}
