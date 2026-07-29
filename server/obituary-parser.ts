import type { CommunityEventDraftInput, ObituaryDetails } from "@shared/community-events";
import { extractEventSourceUrls } from "./event-source-policy";

export interface ParsedObituary {
  deceasedName: string;
  deceasedRelation?: string;
  dateOfDeath: string;
  funeralHome: string;
  jangji: string;
  chiefMourner: string;
  bankAccount: string;
  contactNumber: string;
}

type ObituaryDraft = Extract<CommunityEventDraftInput, { eventType: "obituary" }>;

export type ParsedObituaryEventSource = {
  draft: ObituaryDraft;
  missingFields: string[];
};

const RELATION_ALIASES = [
  { aliases: ["본인"], relation: "본인" },
  { aliases: ["부친", "아버님", "아버지"], relation: "부친" },
  { aliases: ["모친", "어머님", "어머니"], relation: "모친" },
  { aliases: ["빙부", "장인"], relation: "빙부" },
  { aliases: ["빙모", "장모"], relation: "빙모" },
  { aliases: ["시부"], relation: "시부" },
  { aliases: ["시모"], relation: "시모" },
  { aliases: ["자녀", "아들", "딸"], relation: "자녀" },
] as const;

// 한국 날짜/시간 패턴 (다양한 형식 커버)
const DATE_PATTERNS = [
  /\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*(?:오전|오후)?\s*\d{1,2}시(?:\s*\d{1,2}분)?/,
  /\d{4}[-.]\s*\d{1,2}[-.]\s*\d{1,2}\s*(?:오전|오후)?\s*\d{1,2}시(?:\s*\d{1,2}분)?/,
  /\d{4}년\s*\d{1,2}월\s*\d{1,2}일/,
  /\d{4}[-.]\d{1,2}[-.]\d{1,2}/,
];

const FUNERAL_DATE_PATTERNS = [
  /\d{4}년\s*\d{1,2}월\s*\d{1,2}일(?:\s*\([^\n)]+\))?(?:\s*(?:오전|오후)\s*\d{1,2}시(?:\s*\d{1,2}분)?)?/,
  /\d{4}[-.]\s*\d{1,2}[-.]\s*\d{1,2}(?:\s*\([^\n)]+\))?(?:\s*(?:오전|오후)\s*\d{1,2}시(?:\s*\d{1,2}분)?)?/,
];

function extractDeceasedName(text: string): string {
  // 故 홍길동 패턴
  const goMatch = text.match(/故\s*([가-힣]{2,5})/);
  if (goMatch) return goMatch[1];

  // 고인: 홍길동 패턴
  const labelMatch = text.match(/고인\s*[：:]\s*([가-힣]{2,5})/);
  if (labelMatch) return labelMatch[1];

  return "";
}

function extractRelation(text: string): string | undefined {
  const labeled = text.match(/(?:고인과의\s*)?관계\s*[：:]\s*([가-힣]+)/);
  if (labeled) {
    for (const { aliases, relation } of RELATION_ALIASES) {
      if ((aliases as readonly string[]).includes(labeled[1])) return relation;
    }
  }

  for (const { aliases, relation } of RELATION_ALIASES) {
    for (const alias of aliases) {
      const expression = new RegExp(
        `${alias}(?:상(?:입니다|으로|을|이)?(?=$|\\s|[.,])|께서\\s*(?:\\d{4}년\\s*\\d{1,2}월\\s*\\d{1,2}일\\s*)?(?:별세|소천|작고)|\\s+(?:별세|소천|작고))`,
        "m",
      );
      if (expression.test(text)) return relation;
    }
  }
  return undefined;
}

function extractFuneralDate(text: string): string {
  const labeled = text.match(/(?:발인|영결|출상)\s*[：:\s]\s*([^\n]+)/);
  const candidates = labeled ? [labeled[1], text] : [text];
  for (const candidate of candidates) {
    for (const pattern of FUNERAL_DATE_PATTERNS) {
      const match = candidate.match(pattern);
      if (match) return match[0].trim();
    }
  }
  return "";
}

function extractDeceasedAge(text: string): number | undefined {
  const match = text.match(/향년\s*(\d{1,3})\s*세/)
    ?? text.match(/(?:^|\n)\s*(\d{1,3})\s*세(?:\s*\/[^\n]*)?(?=\n|$)/);
  if (!match) return undefined;
  const age = Number(match[1]);
  return age > 0 && age <= 130 ? age : undefined;
}

function extractRelatedMemberName(text: string): string | undefined {
  const match = text.match(
    /([가-힣]{2,5})\s*(?:동문|회원)(?:의)?\s*(?:본인|부친|모친|빙부|빙모|장인|장모|시부|시모|자녀|아들|딸)(?:상|께서)/,
  );
  return match?.[1];
}

function extractDateOfDeath(text: string): string {
  // "별세일시:", "별세:", "일시:" 레이블 뒤 날짜 우선
  const labelMatch = text.match(/(?:별세일시|별세|일시)\s*[：:\s]\s*([^\n]+)/);
  if (labelMatch) {
    const candidate = labelMatch[1].trim();
    for (const pat of DATE_PATTERNS) {
      const m = candidate.match(pat);
      if (m) return m[0].trim();
    }
  }

  // 레이블 없어도 날짜 패턴이 있으면 추출
  for (const pat of DATE_PATTERNS) {
    const m = text.match(pat);
    if (m) return m[0].trim();
  }
  return "";
}

function extractLabeled(text: string, labels: string[]): string {
  const labelGroup = labels.join("|");
  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:${labelGroup})\\s*(?:[：:]\\s*|\\n\\s*)([^\\n]+)`,
  );
  const m = text.match(pattern);
  return m ? m[1].trim() : "";
}

function extractFuneralHome(text: string): string {
  const splitRoom = text.match(
    /(?:^|\n)\s*(?:빈소|장례식장)\s*(?:[：:]\s*|\n\s*)([^\n]+)\n\s*(제?\s*\d{1,4}\s*호실)(?=\n|$)/,
  );
  return splitRoom
    ? `${splitRoom[1].trim()} ${splitRoom[2].replace(/\s+/g, "")}`
    : extractLabeled(text, ["빈소", "장례식장"]);
}

function extractAccountInfo(text: string): string {
  const candidate = extractLabeled(text, ["계좌", "마음전하실곳", "마음 전하실 곳"]);
  return /\d[\d -]{4,}\d/.test(candidate) ? candidate : "";
}

function extractPhone(text: string): string {
  // 연락처 레이블 뒤 전화번호
  const labelMatch = text.match(/(?:연락처|전화|tel)\s*[：:\s]\s*([\d\-\s]+)/i);
  if (labelMatch) return labelMatch[1].trim().replace(/\s+/g, "");

  // 레이블 없는 전화번호 (010-XXXX-XXXX 형식)
  const phoneMatch = text.match(/01[0-9][-\s]?\d{3,4}[-\s]?\d{4}/);
  return phoneMatch ? phoneMatch[0].replace(/\s/g, "") : "";
}

export function parseObituarySms(text: string): Partial<ParsedObituary> {
  const deceasedRelation = extractRelation(text);
  return {
    deceasedName: extractDeceasedName(text),
    ...(deceasedRelation ? { deceasedRelation } : {}),
    dateOfDeath: extractDateOfDeath(text),
    funeralHome: extractFuneralHome(text),
    jangji: extractLabeled(text, ["장지"]),
    chiefMourner: extractLabeled(text, ["상주"]),
    bankAccount: extractAccountInfo(text),
    contactNumber: extractPhone(text),
  };
}

export function parseObituaryEventSource(text: string): ParsedObituaryEventSource {
  const legacy = parseObituarySms(text);
  const relationship = legacy.deceasedRelation as ObituaryDetails["relationship"];
  const deceasedAge = extractDeceasedAge(text);
  const funeralDate = extractFuneralDate(text);
  const sourceUrls = extractEventSourceUrls(text);
  const sourceUrl = sourceUrls[0];
  const relatedMemberName = extractRelatedMemberName(text);

  const details: ObituaryDetails = {
    ...(legacy.deceasedName ? { deceasedName: legacy.deceasedName } : {}),
    ...(deceasedAge ? { deceasedAge } : {}),
    ...(relationship ? { relationship } : {}),
    ...(funeralDate ? { funeralDate } : {}),
    ...(legacy.funeralHome ? { funeralHome: legacy.funeralHome } : {}),
    ...(legacy.bankAccount ? { accountInfo: legacy.bankAccount } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(legacy.contactNumber ? { familyContact: legacy.contactNumber } : {}),
    ...(legacy.jangji ? { burialPlace: legacy.jangji } : {}),
    ...(legacy.chiefMourner ? { chiefMourner: legacy.chiefMourner } : {}),
  };

  const requiredDetails: Array<[keyof ObituaryDetails, unknown]> = [
    ["deceasedName", details.deceasedName],
    ["deceasedAge", details.deceasedAge],
    ["relationship", details.relationship],
    ["funeralDate", details.funeralDate],
    ["funeralHome", details.funeralHome],
  ];

  return {
    draft: {
      eventType: "obituary",
      title: relatedMemberName && relationship
        ? `${relatedMemberName} 동문 ${relationship}상`
        : "부고",
      ...(funeralDate ? { eventDate: funeralDate } : {}),
      ...(legacy.funeralHome ? { location: legacy.funeralHome } : {}),
      ...(relatedMemberName ? { relatedMemberName } : {}),
      ...(legacy.contactNumber ? { contactNumber: legacy.contactNumber } : {}),
      ...(legacy.bankAccount ? { accountInfo: legacy.bankAccount } : {}),
      sourceText: text,
      sourceUrls,
      details,
    },
    missingFields: requiredDetails
      .filter(([, value]) => value === undefined || value === "")
      .map(([field]) => `details.${field}`),
  };
}
