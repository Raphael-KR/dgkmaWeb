export interface ParsedObituary {
  deceasedName: string;
  deceasedRelation: string;
  dateOfDeath: string;
  funeralHome: string;
  jangji: string;
  chiefMourner: string;
  bankAccount: string;
  contactNumber: string;
}

const RELATION_PATTERNS: { pattern: RegExp; relation: string }[] = [
  { pattern: /부친|부상|아버님|아버지/, relation: "부친" },
  { pattern: /모친|모상|어머님|어머니/, relation: "모친" },
  { pattern: /조부|할아버님|할아버지/, relation: "조부" },
  { pattern: /조모|할머님|할머니/, relation: "조모" },
  { pattern: /장인/, relation: "장인" },
  { pattern: /장모/, relation: "장모" },
  { pattern: /배우자|남편|아내|부군|영부인/, relation: "배우자" },
  { pattern: /본인/, relation: "본인" },
];

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

function extractRelation(text: string): string {
  for (const { pattern, relation } of RELATION_PATTERNS) {
    if (pattern.test(text)) return relation;
  }
  return "본인";
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
  return {
    deceasedName: extractDeceasedName(text),
    deceasedRelation: extractRelation(text),
    dateOfDeath: extractDateOfDeath(text),
    funeralHome: extractLabeled(text, ["빈소", "장례식장"]),
    jangji: extractLabeled(text, ["장지"]),
    chiefMourner: extractLabeled(text, ["상주"]),
    bankAccount: extractLabeled(text, ["계좌", "마음전하실곳", "마음 전하실 곳"]),
    contactNumber: extractPhone(text),
  };
}
