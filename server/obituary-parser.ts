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
        `${alias}(?:상(?:입니다|으로|을|이)?(?=$|\\s|[.,])|께서\\s*(?:별세|소천|작고)|\\s+(?:별세|소천|작고))`,
        "m",
      );
      if (expression.test(text)) return relation;
    }
  }
  return undefined;
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
  const pattern = new RegExp(`(?:${labelGroup})\\s*[：:\\s]\\s*([^\\n]+)`);
  const m = text.match(pattern);
  return m ? m[1].trim() : "";
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
    funeralHome: extractLabeled(text, ["빈소", "장례식장"]),
    jangji: extractLabeled(text, ["장지"]),
    chiefMourner: extractLabeled(text, ["상주"]),
    bankAccount: extractLabeled(text, ["계좌", "마음전하실곳", "마음 전하실 곳"]),
    contactNumber: extractPhone(text),
  };
}
