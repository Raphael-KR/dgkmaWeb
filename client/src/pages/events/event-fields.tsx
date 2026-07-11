import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OBITUARY_RELATIONSHIPS, type CommunityEventDraftInput, type CommunityEventType } from "@shared/community-events";

type EventFieldsProps = {
  eventType: CommunityEventType;
  form: UseFormReturn<CommunityEventDraftInput>;
  publishErrors: Record<string, string>;
};

type FieldProps = {
  children: React.ReactNode;
  error?: string;
  htmlFor: string;
  label: string;
};

function Field({ children, error, htmlFor, label }: FieldProps) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function EventFields({ eventType, form, publishErrors }: EventFieldsProps) {
  const isObituary = eventType === "obituary";
  const details = form.watch("details") as Record<string, unknown>;

  return (
    <div className="space-y-4 border-t border-gray-200 pt-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field htmlFor="event-title" label="제목" error={publishErrors.title}>
          <Input id="event-title" placeholder="예: 12기 홍길동 부친상" {...form.register("title")} />
        </Field>
        <Field htmlFor="event-date" label={isObituary ? "소식 날짜" : "일시"} error={publishErrors.eventDate}>
          <Input id="event-date" placeholder="예: 2026년 7월 12일" {...form.register("eventDate")} />
        </Field>
        <Field htmlFor="event-location" label={isObituary ? "장례식장 위치" : "장소"} error={publishErrors.location}>
          <Input id="event-location" placeholder={isObituary ? "예: 동국병원 장례식장" : "예: 서울시 중구"} {...form.register("location")} />
        </Field>
        <Field htmlFor="event-related-member" label="관련 동문" error={publishErrors.relatedMemberName}>
          <Input id="event-related-member" placeholder="관련 동문 성함" {...form.register("relatedMemberName")} />
        </Field>
        <Field htmlFor="event-contact" label="연락처" error={publishErrors.contactNumber}>
          <Input id="event-contact" placeholder="예: 010-0000-0000" {...form.register("contactNumber")} />
        </Field>
        <Field htmlFor="event-account" label="마음 전하실 곳" error={publishErrors.accountInfo}>
          <Input id="event-account" placeholder="은행 계좌번호 예금주" {...form.register("accountInfo")} />
        </Field>
      </div>

      {isObituary ? (
        <div className="space-y-4 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-900">부고 상세</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field htmlFor="deceased-name" label="고인 성함" error={publishErrors["details.deceasedName"]}>
              <Input id="deceased-name" placeholder="故OOO" {...form.register("details.deceasedName" as never)} />
            </Field>
            <Field htmlFor="deceased-age" label="고인 나이" error={publishErrors["details.deceasedAge"]}>
              <Input
                id="deceased-age"
                type="number"
                min="1"
                max="130"
                placeholder="향년"
                {...form.register("details.deceasedAge" as never, {
                  setValueAs: (value) => value === "" ? undefined : Number(value),
                })}
              />
            </Field>
            <Field htmlFor="deceased-relationship" label="관계" error={publishErrors["details.relationship"]}>
              <select
                id="deceased-relationship"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={typeof details.relationship === "string" ? details.relationship : ""}
                onChange={(event) => form.setValue("details.relationship" as never, event.target.value as never, { shouldDirty: true })}
              >
                <option value="">선택하세요</option>
                {OBITUARY_RELATIONSHIPS.map((relationship) => <option key={relationship} value={relationship}>{relationship}</option>)}
              </select>
            </Field>
            <Field htmlFor="funeral-date" label="발인 날짜와 요일" error={publishErrors["details.funeralDate"]}>
              <Input id="funeral-date" placeholder="예: 2026년 7월 12일(일)" {...form.register("details.funeralDate" as never)} />
            </Field>
            <Field htmlFor="funeral-home" label="장례식장과 빈소" error={publishErrors["details.funeralHome"]}>
              <Input id="funeral-home" placeholder="예: 동국병원 장례식장 201호" {...form.register("details.funeralHome" as never)} />
            </Field>
            <Field htmlFor="obituary-account" label="마음 전하실 계좌">
              <Input id="obituary-account" placeholder="은행 계좌번호 예금주" {...form.register("details.accountInfo" as never)} />
            </Field>
            <Field htmlFor="obituary-url" label="모바일 부고장 URL">
              <Input id="obituary-url" type="url" placeholder="https://" {...form.register("details.sourceUrl" as never)} />
            </Field>
            <Field htmlFor="family-contact" label="유가족 연락처">
              <Input id="family-contact" placeholder="예: 010-0000-0000" {...form.register("details.familyContact" as never)} />
            </Field>
            <Field htmlFor="burial-place" label="장지">
              <Input id="burial-place" placeholder="장지 정보" {...form.register("details.burialPlace" as never)} />
            </Field>
            <Field htmlFor="chief-mourner" label="상주">
              <Input id="chief-mourner" placeholder="상주 성함" {...form.register("details.chiefMourner" as never)} />
            </Field>
          </div>
        </div>
      ) : (
        <Field htmlFor="event-memo" label="상세 메모">
          <Textarea id="event-memo" className="min-h-[112px] resize-y" placeholder="안내할 내용을 입력하세요." {...form.register("details.memo" as never)} />
        </Field>
      )}
    </div>
  );
}
