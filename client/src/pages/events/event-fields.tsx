import { Controller, type Path, type UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  OBITUARY_RELATIONSHIPS,
  type CommunityEventDraftInput,
  type CommunityEventType,
} from "@shared/community-events";

type EventFieldName =
  | "title"
  | "eventDate"
  | "location"
  | "relatedMemberName"
  | "contactNumber"
  | "accountInfo"
  | "details.memo"
  | "details.deceasedName"
  | "details.deceasedAge"
  | "details.relationship"
  | "details.funeralDate"
  | "details.funeralHome"
  | "details.accountInfo"
  | "details.sourceUrl"
  | "details.memberTitle"
  | "details.familyContact"
  | "details.burialPlace"
  | "details.chiefMourner";

function toFormPath(name: EventFieldName): Path<CommunityEventDraftInput> {
  return name as Path<CommunityEventDraftInput>;
}

type EventFieldsProps = {
  disabled: boolean;
  eventType: CommunityEventType;
  form: UseFormReturn<CommunityEventDraftInput>;
  publishErrors: Record<string, string>;
};

type FieldProps = {
  children: React.ReactNode;
  error?: string;
  id: string;
  label: string;
};

function Field({ children, error, id, label }: FieldProps) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

function fieldA11y(id: string, error?: string) {
  return {
    "aria-describedby": error ? `${id}-error` : undefined,
    "aria-invalid": Boolean(error),
  };
}

export function EventFields({ disabled, eventType, form, publishErrors }: EventFieldsProps) {
  const isObituary = eventType === "obituary";
  const relationshipError = publishErrors["details.relationship"];

  return (
    <div className="space-y-4 border-t border-gray-200 pt-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="event-title" label="제목" error={publishErrors.title}>
          <Input id="event-title" disabled={disabled} placeholder="예: 12기 홍길동 부친상" {...fieldA11y("event-title", publishErrors.title)} {...form.register(toFormPath("title"))} />
        </Field>
        <Field id="event-date" label={isObituary ? "소식 날짜" : "일시"} error={publishErrors.eventDate}>
          <Input id="event-date" disabled={disabled} placeholder="예: 2026년 7월 12일" {...fieldA11y("event-date", publishErrors.eventDate)} {...form.register(toFormPath("eventDate"))} />
        </Field>
        <Field id="event-location" label={isObituary ? "장례식장 위치" : "장소"} error={publishErrors.location}>
          <Input id="event-location" disabled={disabled} placeholder={isObituary ? "예: 동국병원 장례식장" : "예: 서울시 중구"} {...fieldA11y("event-location", publishErrors.location)} {...form.register(toFormPath("location"))} />
        </Field>
        <Field id="event-related-member" label="관련 동문" error={publishErrors.relatedMemberName}>
          <Input id="event-related-member" disabled={disabled} placeholder="관련 동문 성함" {...fieldA11y("event-related-member", publishErrors.relatedMemberName)} {...form.register(toFormPath("relatedMemberName"))} />
        </Field>
        <Field id="event-contact" label="연락처" error={publishErrors.contactNumber}>
          <Input id="event-contact" disabled={disabled} placeholder="예: 010-0000-0000" {...fieldA11y("event-contact", publishErrors.contactNumber)} {...form.register(toFormPath("contactNumber"))} />
        </Field>
        <Field id="event-account" label="마음 전하실 곳" error={publishErrors.accountInfo}>
          <Input id="event-account" disabled={disabled} placeholder="은행 계좌번호 예금주" {...fieldA11y("event-account", publishErrors.accountInfo)} {...form.register(toFormPath("accountInfo"))} />
        </Field>
      </div>

      {isObituary ? (
        <div className="space-y-4 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-900">부고 상세</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id="deceased-name" label="고인 성함" error={publishErrors["details.deceasedName"]}>
              <Input id="deceased-name" disabled={disabled} placeholder="故OOO" {...fieldA11y("deceased-name", publishErrors["details.deceasedName"])} {...form.register(toFormPath("details.deceasedName"))} />
            </Field>
            <Field id="deceased-age" label="고인 나이" error={publishErrors["details.deceasedAge"]}>
              <Input
                id="deceased-age"
                disabled={disabled}
                type="number"
                min="1"
                max="130"
                placeholder="향년"
                {...fieldA11y("deceased-age", publishErrors["details.deceasedAge"])}
                {...form.register(toFormPath("details.deceasedAge"), {
                  setValueAs: (value) => value === "" ? undefined : Number(value),
                })}
              />
            </Field>
            <Field id="deceased-relationship" label="관계" error={relationshipError}>
              <Controller
                control={form.control}
                name={toFormPath("details.relationship")}
                render={({ field }) => (
                  <select
                    {...field}
                    id="deceased-relationship"
                    disabled={disabled}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    value={typeof field.value === "string" ? field.value : ""}
                    {...fieldA11y("deceased-relationship", relationshipError)}
                    onChange={(event) => field.onChange(event.target.value)}
                  >
                    <option value="">선택하세요</option>
                    {OBITUARY_RELATIONSHIPS.map((relationship) => <option key={relationship} value={relationship}>{relationship}</option>)}
                  </select>
                )}
              />
            </Field>
            <Field id="funeral-date" label="발인 날짜와 요일" error={publishErrors["details.funeralDate"]}>
              <Input id="funeral-date" disabled={disabled} placeholder="예: 2026년 7월 12일(일)" {...fieldA11y("funeral-date", publishErrors["details.funeralDate"])} {...form.register(toFormPath("details.funeralDate"))} />
            </Field>
            <Field id="funeral-home" label="장례식장과 빈소" error={publishErrors["details.funeralHome"]}>
              <Input id="funeral-home" disabled={disabled} placeholder="예: 동국병원 장례식장 201호" {...fieldA11y("funeral-home", publishErrors["details.funeralHome"])} {...form.register(toFormPath("details.funeralHome"))} />
            </Field>
            <Field id="obituary-account" label="마음 전하실 계좌">
              <Input id="obituary-account" disabled={disabled} placeholder="은행 계좌번호 예금주" {...fieldA11y("obituary-account")} {...form.register(toFormPath("details.accountInfo"))} />
            </Field>
            <Field id="obituary-url" label="모바일 부고장 URL">
              <Input id="obituary-url" disabled={disabled} type="url" placeholder="https://" {...fieldA11y("obituary-url")} {...form.register(toFormPath("details.sourceUrl"))} />
            </Field>
            <Field id="member-title" label="회원 직함">
              <Input id="member-title" disabled={disabled} placeholder="예: 한의원 원장" {...fieldA11y("member-title")} {...form.register(toFormPath("details.memberTitle"))} />
            </Field>
            <Field id="family-contact" label="유가족 연락처">
              <Input id="family-contact" disabled={disabled} placeholder="예: 010-0000-0000" {...fieldA11y("family-contact")} {...form.register(toFormPath("details.familyContact"))} />
            </Field>
            <Field id="burial-place" label="장지">
              <Input id="burial-place" disabled={disabled} placeholder="장지 정보" {...fieldA11y("burial-place")} {...form.register(toFormPath("details.burialPlace"))} />
            </Field>
            <Field id="chief-mourner" label="상주">
              <Input id="chief-mourner" disabled={disabled} placeholder="상주 성함" {...fieldA11y("chief-mourner")} {...form.register(toFormPath("details.chiefMourner"))} />
            </Field>
          </div>
        </div>
      ) : (
        <Field id="event-memo" label="상세 메모">
          <Textarea id="event-memo" disabled={disabled} className="min-h-[112px] resize-y" placeholder="안내할 내용을 입력하세요." {...fieldA11y("event-memo")} {...form.register(toFormPath("details.memo"))} />
        </Field>
      )}
    </div>
  );
}
