import { useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { FileText, LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  communityEventDraftSchema,
  communityEventPublishSchema,
  OBITUARY_RELATIONSHIPS,
  type CommunityEventDraftInput,
  type CommunityEventType,
} from "@shared/community-events";
import { EVENT_TYPE_LABELS } from "./event-list";
import { EventFields } from "./event-fields";

const eventTypes: CommunityEventType[] = ["obituary", "wedding", "opening", "other"];
const URL_PATTERN = /https?:\/\/[^\s]+/g;

type ParsedObituary = {
  deceasedName?: string;
  deceasedRelation?: string;
  dateOfDeath?: string;
  funeralHome?: string;
  jangji?: string;
  chiefMourner?: string;
  bankAccount?: string;
  contactNumber?: string;
};

function getSourceParts(sourceText: string) {
  const sourceUrls = sourceText.match(URL_PATTERN)?.slice(0, 3) ?? [];
  return {
    sourceUrls,
    textOnly: sourceText.replace(URL_PATTERN, " ").trim(),
  };
}

function getPublishErrors(data: CommunityEventDraftInput) {
  const result = communityEventPublishSchema.safeParse(data);
  if (result.success) return {};

  return result.error.issues.reduce<Record<string, string>>((errors, issue) => {
    const path = issue.path.join(".");
    if (path && !errors[path]) errors[path] = "게시 전에 입력해주세요.";
    return errors;
  }, {});
}

export function EventComposer() {
  const { toast } = useToast();
  const [draftId, setDraftId] = useState<number>();
  const [isParsing, setIsParsing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({});
  const publishingRef = useRef(false);
  const form = useForm<CommunityEventDraftInput>({
    resolver: zodResolver(communityEventDraftSchema),
    defaultValues: { eventType: "obituary", sourceUrls: [], details: {} },
  });
  const currentType = form.watch("eventType");
  const sourceText = form.watch("sourceText") ?? "";

  const changeType = (eventType: CommunityEventType) => {
    if (eventType === currentType) return;
    if (form.formState.isDirty && !window.confirm("유형을 변경하면 이전 유형의 상세 입력은 초기화됩니다. 원문과 공통 입력을 유지하고 변경할까요?")) {
      return;
    }

    const currentValues = form.getValues();
    form.reset({ ...currentValues, eventType, details: {} } as CommunityEventDraftInput);
    setPublishErrors({});
  };

  const loadSource = async () => {
    if (!sourceText.trim()) {
      toast({ title: "원문을 입력해주세요", description: "분석할 문자 내용을 붙여넣어주세요.", variant: "destructive" });
      return;
    }

    const { sourceUrls, textOnly } = getSourceParts(sourceText);
    form.setValue("sourceUrls", sourceUrls, { shouldDirty: true });
    if (sourceUrls.length > 0) {
      toast({ title: "링크는 저장했습니다", description: "링크 내용 수집은 준비 중이며 입력한 문자만 분석했습니다." });
    }

    if (currentType !== "obituary") {
      form.setValue("details", { memo: textOnly }, { shouldDirty: true });
      return;
    }

    if (!textOnly) return;
    setIsParsing(true);
    try {
      const response = await apiRequest("POST", "/api/obituary/parse", { text: textOnly });
      const parsed = await response.json() as ParsedObituary;
      const obituaryDetails: Record<string, string> = {};
      if (parsed.deceasedName) obituaryDetails.deceasedName = parsed.deceasedName;
      if (parsed.dateOfDeath) form.setValue("eventDate", parsed.dateOfDeath, { shouldDirty: true });
      if (parsed.funeralHome) {
        form.setValue("location", parsed.funeralHome, { shouldDirty: true });
        obituaryDetails.funeralHome = parsed.funeralHome;
      }
      if (parsed.jangji) obituaryDetails.burialPlace = parsed.jangji;
      if (parsed.chiefMourner) obituaryDetails.chiefMourner = parsed.chiefMourner;
      if (parsed.bankAccount) form.setValue("accountInfo", parsed.bankAccount, { shouldDirty: true });
      if (parsed.contactNumber) form.setValue("contactNumber", parsed.contactNumber, { shouldDirty: true });
      if (parsed.deceasedRelation && OBITUARY_RELATIONSHIPS.includes(parsed.deceasedRelation as typeof OBITUARY_RELATIONSHIPS[number])) {
        obituaryDetails.relationship = parsed.deceasedRelation;
      }
      if (sourceUrls[0]) obituaryDetails.sourceUrl = sourceUrls[0];
      form.setValue("details", {
        ...form.getValues().details,
        ...obituaryDetails,
      } as CommunityEventDraftInput["details"], { shouldDirty: true });
      toast({ title: "부고 문자 분석 완료", description: "입력된 내용을 확인하고 필요한 정보를 보완해주세요." });
    } catch {
      toast({ title: "분석 실패", description: "문자 내용을 분석하지 못했습니다. 직접 입력해주세요.", variant: "destructive" });
    } finally {
      setIsParsing(false);
    }
  };

  const publish = async () => {
    const draftResult = communityEventDraftSchema.safeParse(form.getValues());
    if (!draftResult.success) {
      toast({ title: "입력 내용을 확인해주세요", description: "초안 형식에 맞지 않는 항목이 있습니다.", variant: "destructive" });
      return;
    }

    const errors = getPublishErrors(draftResult.data);
    setPublishErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({ title: "게시 정보를 보완해주세요", description: "표시된 필수 항목을 입력한 뒤 다시 게시해주세요.", variant: "destructive" });
      return;
    }

    if (publishingRef.current) return;
    publishingRef.current = true;
    setIsPublishing(true);
    try {
      let publishDraftId = draftId;
      if (!publishDraftId) {
        const response = await apiRequest("POST", "/api/events/drafts", draftResult.data);
        const draft = await response.json() as { id?: number };
        if (!draft.id) throw new Error("초안 ID를 받지 못했습니다.");
        publishDraftId = draft.id;
        setDraftId(publishDraftId);
      }

      await apiRequest("POST", `/api/events/${publishDraftId}/publish`, draftResult.data);
      await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.removeQueries({ queryKey: ["/api/events/drafts/latest"] });
      form.reset({ eventType: currentType, sourceUrls: [], details: {} } as CommunityEventDraftInput);
      setDraftId(undefined);
      setPublishErrors({});
      toast({ title: "경조사를 게시했습니다", description: "새 소식이 아래 목록에 반영되었습니다." });
    } catch {
      toast({ title: "게시 실패", description: "잠시 후 다시 시도해주세요.", variant: "destructive" });
    } finally {
      publishingRef.current = false;
      setIsPublishing(false);
    }
  };

  return (
    <section className="w-full border-y border-gray-200 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">경조사 등록</h2>
          <p className="mt-1 text-sm text-gray-500">내용을 확인한 뒤 게시해주세요.</p>
        </div>
      </div>

      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void publish(); }}>
        <div>
          <Label>유형</Label>
          <ToggleGroup
            type="single"
            value={currentType}
            onValueChange={(value) => { if (value) changeType(value as CommunityEventType); }}
            aria-label="경조사 유형"
            className="mt-2 grid w-full grid-cols-4 gap-1"
          >
            {eventTypes.map((eventType) => (
              <ToggleGroupItem
                key={eventType}
                value={eventType}
                aria-label={EVENT_TYPE_LABELS[eventType]}
                className="h-9 w-full px-2 text-sm"
              >
                {EVENT_TYPE_LABELS[eventType]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div>
          <Label htmlFor="event-source">경조사 원문</Label>
          <Textarea
            id="event-source"
            className="mt-2 min-h-[96px] resize-none"
            placeholder="문자와 공개 링크를 함께 붙여넣으세요"
            {...form.register("sourceText")}
          />
        </div>

        <Button type="button" variant="outline" onClick={() => void loadSource()} disabled={isParsing} className="w-full sm:w-auto">
          {isParsing ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <FileText aria-hidden="true" />}
          경조사 내용 불러오기
        </Button>

        <EventFields eventType={currentType} form={form} publishErrors={publishErrors} />

        <div className="flex flex-col gap-2 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">게시 후 경조사 목록에서 바로 확인할 수 있습니다.</p>
          <Button type="submit" disabled={isPublishing} className="sm:min-w-28">
            {isPublishing ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
            게시
          </Button>
        </div>
      </form>
    </section>
  );
}
