import type { AdminApprovedMemberDto } from "@shared/contracts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlumniRecordFields } from "./alumni-record-fields";

export function ApprovedMemberDetails({ member }: { member: AdminApprovedMemberDto }) {
  const { profile } = member;
  const birthdayParts = profile.birthday?.match(/^(\d{2})(\d{2})$/);
  const birthday = birthdayParts ? `${birthdayParts[1]}월 ${birthdayParts[2]}일` : profile.birthday;
  const fields = [
    ["전화번호", profile.phoneNumber],
    ["생일", birthday],
    [
      "양력/음력",
      profile.birthdayType === "SOLAR" ? "양력" : profile.birthdayType === "LUNAR" ? "음력" : null,
    ],
    ["윤달 여부", profile.isLeapMonth === null ? null : profile.isLeapMonth ? "예" : "아니요"],
    ["활동지역", profile.activityRegion],
  ] as const;

  return (
    <div className="mb-4 space-y-4 text-sm">
      <section aria-label="회원 정보" className="space-y-3">
        <p className="text-xs text-gray-500">
          카카오에서 제공한 정보와 회원이 입력한 활동지역입니다.
        </p>
        <div className="flex items-center gap-3">
          <Avatar className="h-16 w-16">
            <AvatarImage
              src={profile.profileImage || undefined}
              alt={`${member.name} 프로필 사진`}
            />
            <AvatarFallback className="text-xs">정보 없음</AvatarFallback>
          </Avatar>
          <dl className="min-w-0 space-y-1 break-all">
            <div>
              <dt className="text-xs text-gray-500">이름</dt>
              <dd className="font-bold">{member.name.trim() ? member.name : "정보 없음"}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">이메일</dt>
              <dd>{member.email.trim() ? member.email : "정보 없음"}</dd>
            </div>
          </dl>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-gray-500">{label}</dt>
              <dd className="whitespace-pre-wrap break-words">
                {value?.trim() ? value : "정보 없음"}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label="연결된 동문 명부" className="space-y-3 border-t pt-4">
        <h4 className="font-semibold">연결된 동문 명부</h4>
        {member.linkedAlumni.length === 0 ? (
          <p className="text-gray-500">연결된 명부 없음</p>
        ) : (
          member.linkedAlumni.map((record, index) => (
            <div key={record.id} className="rounded-md border bg-gray-50 p-3">
              {member.linkedAlumni.length > 1 && (
                <p className="mb-3 text-xs text-gray-600">연결 명부 {index + 1}</p>
              )}
              <AlumniRecordFields record={record} includeAddressAndPhone={false} />
            </div>
          ))
        )}
      </section>
    </div>
  );
}
