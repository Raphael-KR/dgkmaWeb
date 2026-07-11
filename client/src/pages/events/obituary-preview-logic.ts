import type { CommunityEventType } from "@shared/community-events";

const MISSING_FIELD_LABELS: Record<string, string> = {
  draft: "부고 초안",
  eventType: "경조사 유형",
  title: "제목",
  eventDate: "소식 날짜",
  location: "장례식장 위치",
  relatedMemberName: "관련 동문",
  contactNumber: "연락처",
  accountInfo: "마음 전하실 곳",
  sourceText: "경조사 원문",
  sourceUrls: "공개 링크",
  details: "부고 상세 정보",
  deceasedName: "고인 성함",
  deceasedAge: "고인 나이",
  relationship: "고인과의 관계",
  funeralDate: "발인 일시",
  funeralHome: "빈소",
  memberTitle: "회원 직함",
  familyContact: "유가족 연락처",
  burialPlace: "장지",
  chiefMourner: "상주",
  graduationClass: "졸업 기수",
  admissionYear: "입학 연도",
  memberName: "회원 이름",
  membershipTier: "회원 등급",
  memberPhone: "회원 연락처",
  sourceUrl: "모바일 부고장 URL",
};

export function missingFieldLabel(field: string): string {
  return MISSING_FIELD_LABELS[field] ?? "입력값";
}

export type PreviewRequestIdentity = {
  eventType: CommunityEventType;
  draftId: number;
  contentFingerprint: string;
  requestVersion: number;
};

export type ActivePreviewIdentity = {
  eventType: CommunityEventType;
  draftId?: number;
  contentFingerprint: string;
  requestVersion: number;
  draftStatus: "idle" | "recovered" | "saved" | "saving";
  isPaused: boolean;
};

export function isObituaryPreviewEligible(active: ActivePreviewIdentity): boolean {
  return !active.isPaused
    && (active.draftStatus === "saved" || active.draftStatus === "recovered")
    && active.eventType === "obituary"
    && active.draftId !== undefined;
}

export function canApplyPreviewResponse(
  active: ActivePreviewIdentity,
  request: PreviewRequestIdentity,
): boolean {
  return isObituaryPreviewEligible(active)
    && active.eventType === request.eventType
    && active.draftId === request.draftId
    && active.contentFingerprint === request.contentFingerprint
    && active.requestVersion === request.requestVersion;
}
