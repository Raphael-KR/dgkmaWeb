import { Badge } from "@/components/ui/badge";
import type {
  AdminPendingRegistrationReviewDto,
  PendingRegistrationConflictReason,
  PendingRegistrationReviewStatus,
} from "@shared/contracts";
import { compareRegistrationValues } from "./compare-registration-values";

const reviewMessages: Record<PendingRegistrationReviewStatus, string> = {
  ready: "이름·전화번호가 일치하는 명부 한 건을 확인했으며 타인 계정과의 충돌이 없습니다.",
  missing_data:
    "가입에 필요한 정보가 부족하거나 유효하지 않습니다. 신청자의 카카오 재로그인으로 신청 정보를 갱신해 주세요.",
  no_match:
    "이름과 전화번호가 함께 일치하는 명부가 없습니다. 신청 정보와 관리 원본 명부를 확인해 주세요.",
  multiple_matches:
    "이름·전화번호가 모두 일치하는 명부가 여러 건입니다. 중복 명부를 정리해야 승인할 수 있습니다.",
  already_linked: "일치한 명부가 이미 회원 계정에 연결되어 있습니다. 기존 연결을 확인해 주세요.",
  account_conflict: "같은 정보로 가입된 계정이 있습니다. 기존 계정을 확인해야 합니다.",
};

const reasonLabels: Record<PendingRegistrationConflictReason, string> = {
  approval_cancelled: "관리자가 기존 회원의 승인을 취소함",
  not_found: "이름·전화번호로 유일한 명부를 확인하지 못함",
  email_conflict: "기존 계정과 이메일 중복",
  phone_conflict: "기존 계정과 전화번호 중복",
  alumni_claimed: "명부가 이미 다른 회원에게 연결됨",
  alumni_race: "동시 가입 처리로 명부 연결을 확정하지 못함",
};

const conflictLabels = { kakao: "카카오 계정", email: "이메일", phone: "전화번호" };

const registryFields = [
  ["department", "학과"],
  ["generation", "기수"],
  ["admissionDate", "입학일"],
  ["graduationDate", "졸업일"],
  ["address", "주소"],
  ["phone", "전화"],
  ["group", "그룹"],
  ["status", "상태"],
  ["alumniPosition", "동문회 직책"],
  ["memo", "메모"],
] as const;

function ComparisonField({
  label,
  applicant,
  registry,
  matches,
}: {
  label: string;
  applicant: string | null;
  registry: string | null;
  matches: boolean;
}) {
  if (matches) {
    return (
      <div>
        <dt className="text-xs text-gray-500">{label}</dt>
        <dd className="flex flex-wrap items-center gap-2 break-all">
          <span>{registry}</span>
          <Badge className="bg-green-100 text-green-800">일치</Badge>
        </dd>
      </div>
    );
  }
  const { applicantParts, registryParts } = compareRegistrationValues(
    applicant ?? "",
    registry ?? "",
  );
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="grid gap-2 sm:grid-cols-2">
        {[
          {
            source: "applicant",
            label: "신청",
            parts: applicantParts,
            highlightClass: "registration-difference registration-difference--applicant",
          },
          {
            source: "registry",
            label: "명부",
            parts: registryParts,
            highlightClass: "registration-difference registration-difference--registry",
          },
        ].map(({ source, label: sourceLabel, parts, highlightClass }) => (
          <div key={source} className="min-w-0">
            <span className="mr-2 text-xs text-gray-500">{sourceLabel}</span>
            <span className="whitespace-pre-wrap break-all">
              {parts.length === 0
                ? "정보 없음"
                : parts.map((part, index) =>
                    part.changed ? (
                      <mark key={index} className={highlightClass}>
                        {part.text}
                      </mark>
                    ) : (
                      <span key={index}>{part.text}</span>
                    ),
                  )}
            </span>
          </div>
        ))}
      </dd>
    </div>
  );
}

export function PendingRegistrationReview({
  review,
}: {
  review: AdminPendingRegistrationReviewDto["review"];
}) {
  return (
    <section className="mb-4 space-y-3 text-sm" aria-label="동문 명부 대조">
      <div>
        <h4 className="font-semibold">동문 명부 대조</h4>
        <p className="mt-1 text-xs text-gray-500">
          {new Date(review.checkedAt).toLocaleString("ko-KR")} 기준
        </p>
        <p className="mt-2">{reviewMessages[review.status]}</p>
        {review.accountConflicts.length > 0 && (
          <p className="mt-1">
            계정 중복 항목: {review.accountConflicts.map((kind) => conflictLabels[kind]).join(", ")}
          </p>
        )}
      </div>
      <p className="text-xs text-gray-500">
        신청 당시 대기 사유:{" "}
        {review.reasonAtApplication ? reasonLabels[review.reasonAtApplication] : "기록 없음"}
      </p>
      {review.candidates.length === 0 ? (
        <dl className="rounded-md bg-gray-50 p-3">
          <dt className="text-xs text-gray-500">신청 전화번호</dt>
          <dd className="break-all">{review.phoneNumber || "정보 없음"}</dd>
        </dl>
      ) : (
        <div className="space-y-3">
          {review.candidates.map((candidate, index) => (
            <div key={candidate.id} className="rounded-md border bg-gray-50 p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                <span>명부 후보 {index + 1}</span>
                <span>{candidate.isLinked ? "회원 계정 연결됨" : "회원 계정 미연결"}</span>
              </div>
              <dl className="space-y-3">
                <ComparisonField
                  label="이름"
                  applicant={review.applicantName}
                  registry={candidate.name}
                  matches={candidate.nameMatches}
                />
                <ComparisonField
                  label="핸드폰"
                  applicant={review.phoneNumber}
                  registry={candidate.mobile}
                  matches={candidate.phoneMatches}
                />
              </dl>
              <dl className="mt-4 grid gap-3 border-t pt-3 sm:grid-cols-2">
                {registryFields.map(([field, label]) => (
                  <div
                    key={field}
                    className={
                      field === "memo" || field === "address" ? "sm:col-span-2" : undefined
                    }
                  >
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {candidate[field] || "정보 없음"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          {review.candidateCount > review.candidates.length && (
            <p className="text-xs text-gray-500">
              후보 {review.candidateCount}건 중 {review.candidates.length}건 표시 · 이름·전화번호
              모두 일치 {review.exactMatchCount}건
            </p>
          )}
        </div>
      )}
      <p className="text-xs text-gray-500">
        명부 수정 후에는 동문 데이터 동기화를 마치고 다시 대조해 주세요. 승인 시 최신 정보로 다시
        확인합니다.
      </p>
    </section>
  );
}
