import type { AdminAlumniRecordDto, AdminLinkedAlumniRecordDto } from "@shared/contracts";
import { cn } from "@/lib/utils";

const registryFields = [
  ["department", "학과"],
  ["generation", "기수"],
  ["name", "성명"],
  ["admissionDate", "입학일"],
  ["graduationDate", "졸업일"],
  ["address", "주소"],
  ["mobile", "핸드폰"],
  ["phone", "전화"],
  ["group", "그룹"],
  ["status", "상태"],
  ["alumniPosition", "동문회 직책"],
  ["memo", "메모"],
] as const;

export function AlumniRecordFields({
  record,
  includeIdentity = true,
  includeAddressAndPhone = true,
  className,
}: {
  record: AdminLinkedAlumniRecordDto & Partial<Pick<AdminAlumniRecordDto, "address" | "phone">>;
  includeIdentity?: boolean;
  includeAddressAndPhone?: boolean;
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {registryFields
        .filter(([field]) => includeIdentity || (field !== "name" && field !== "mobile"))
        .filter(([field]) => includeAddressAndPhone || (field !== "address" && field !== "phone"))
        .map(([field, label]) => (
          <div
            key={field}
            className={field === "memo" || field === "address" ? "sm:col-span-2" : undefined}
          >
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="whitespace-pre-wrap break-words">
              {record[field]?.trim() ? record[field] : "정보 없음"}
            </dd>
          </div>
        ))}
    </dl>
  );
}
