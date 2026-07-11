export type ObituaryRelationship =
  | "본인"
  | "부친"
  | "모친"
  | "빙부"
  | "빙모"
  | "시부"
  | "시모"
  | "자녀";

export interface ObituaryAnnouncementInput {
  graduationClass: string;
  admissionYear: string;
  memberName: string;
  membershipTier: string;
  memberTitle?: string;
  relationship: ObituaryRelationship;
  deceasedName: string;
  deceasedAge: number;
  funeralHome: string;
  funeralDate: string;
  memberPhone: string;
  accountInfo?: string;
  sourceUrl?: string;
}

export function renderObituaryAnnouncement(
  input: ObituaryAnnouncementInput,
): string {
  const memberTitle = input.memberTitle?.trim();
  const accountInfo = input.accountInfo?.trim();
  const sourceUrl = input.sourceUrl?.trim();
  const title = input.relationship === "본인" ? "#부고 #동문본인상" : "#부고";
  const memberLine = [
    `본회 졸업${input.graduationClass}(${input.admissionYear})`,
    `${input.memberName} ${input.membershipTier}${memberTitle ? `(${memberTitle})` : ""}`,
    `${input.relationship}상`,
  ].join(" ");

  const funeralLines = [
    `- 고인: 故${input.deceasedName} (향년 ${input.deceasedAge}세)`,
    `- 빈소: ${input.funeralHome}`,
    `- 발인: ${input.funeralDate}`,
  ];
  const contactLines = [`- 연락처: ${input.memberName} ${input.memberPhone}`];

  if (accountInfo) {
    contactLines.push(`- 마음 전하실 곳: ${accountInfo}`);
  }

  const lines = [title, memberLine, "", ...funeralLines, "", ...contactLines];

  if (sourceUrl) {
    lines.push("", `* 유가족 및 장례식장 위치 확인: ${sourceUrl}`);
  }

  lines.push("", "삼가 고인의 명복을 빕니다.", "-동국대학교 한의과대학 동문회-");
  return lines.join("\n");
}
