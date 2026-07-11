import { useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { type FieldErrors, type Path, type SubmitHandler, useForm, useWatch } from "react-hook-form";
import { FileText, LoaderCircle, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEventDraft } from "@/hooks/use-event-draft";
import { saveEventDraftWithFallback } from "@/hooks/event-draft-coordinator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  communityEventDraftSchema,
  communityEventPublishSchema,
  OBITUARY_RELATIONSHIPS,
  type CommunityEventDraftInput,
  type CommunityEventType,
  type ObituaryDetails,
} from "@shared/community-events";
import { canApplyParsedSource, collectFormErrorEntries, ConclusivePublishError, publishDraftWithRecovery, splitEventSource } from "./event-composer-logic";
import { EventFields } from "./event-fields";
import { EVENT_TYPE_LABELS } from "./event-list";
import { ObituaryPreview } from "./obituary-preview";

type EventComposerProps = {
  onPublished: (eventType: CommunityEventType) => void;
};

type ComposerFieldPath =
  | "sourceText"
  | "title"
  | "eventDate"
  | "location"
  | "relatedMemberName"
  | "contactNumber"
  | "accountInfo"
  | "details.deceasedName"
  | "details.deceasedAge"
  | "details.relationship"
  | "details.funeralDate"
  | "details.funeralHome"
  | "details.memo"
  | "details.accountInfo"
  | "details.sourceUrl"
  | "details.memberTitle"
  | "details.familyContact"
  | "details.burialPlace"
  | "details.chiefMourner";

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

const eventTypes: CommunityEventType[] = ["obituary", "wedding", "opening", "other"];
const composerFieldPaths = new Set<ComposerFieldPath>([
  "sourceText",
  "title",
  "eventDate",
  "location",
  "relatedMemberName",
  "contactNumber",
  "accountInfo",
  "details.deceasedName",
  "details.deceasedAge",
  "details.relationship",
  "details.funeralDate",
  "details.funeralHome",
  "details.memo",
  "details.accountInfo",
  "details.sourceUrl",
  "details.memberTitle",
  "details.familyContact",
  "details.burialPlace",
  "details.chiefMourner",
]);

function toFormPath(path: ComposerFieldPath): Path<CommunityEventDraftInput> {
  return path as Path<CommunityEventDraftInput>;
}

function toVisibleFieldPath(path: string): ComposerFieldPath | undefined {
  const normalized = path === "sourceUrls" || path.startsWith("sourceUrls.") ? "sourceText" : path;
  return composerFieldPaths.has(normalized as ComposerFieldPath) ? normalized as ComposerFieldPath : undefined;
}

function initialValues(eventType: CommunityEventType): CommunityEventDraftInput {
  return { eventType, sourceUrls: [], details: {} } as CommunityEventDraftInput;
}

export function EventComposer({ onPublished }: EventComposerProps) {
  const { toast } = useToast();
  const [isParsing, setIsParsing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({});
  const parseRequestRef = useRef(0);
  const publishingRef = useRef(false);
  const form = useForm<CommunityEventDraftInput>({
    resolver: zodResolver(communityEventDraftSchema),
    defaultValues: initialValues("obituary"),
  });
  const currentType = form.watch("eventType");
  const previewValues = useWatch({ control: form.control });
  const previewFingerprint = JSON.stringify(previewValues);
  const {
    draftId,
    errorMessage: draftError,
    canRetry,
    hasRecoveryError,
    isDiscarding,
    isRecovered,
    isRecovering,
    isSaved,
    isSaving,
    isPublishResolutionPending,
    completePublish: completeDraftPublish,
    discardDraft,
    prepareForPublish,
    registerDraftId,
    lockPublishResolution,
    resumeAutosave,
    retryDraft,
    settleAutosave,
  } = useEventDraft({ eventType: currentType, form, isPaused: isParsing || isPublishing });
  const sourceError = publishErrors.sourceText;
  const isBusy = isParsing || isPublishing || isDiscarding || isRecovering;
  const inputsDisabled = isBusy || isPublishResolutionPending;

  const changeType = (eventType: CommunityEventType) => {
    if (inputsDisabled || eventType === currentType) return;
    if (form.formState.isDirty && !window.confirm("유형을 변경하면 이전 유형의 상세 입력은 초기화됩니다. 원문과 공통 입력을 유지하고 변경할까요?")) {
      return;
    }

    const currentValues = form.getValues();
    form.reset({ ...currentValues, eventType, details: {} } as CommunityEventDraftInput);
    form.clearErrors();
    setPublishErrors({});
  };

  const loadSource = async () => {
    if (inputsDisabled) return;
    const snapshot = form.getValues();
    const snapshotSourceText = snapshot.sourceText ?? "";
    if (!snapshotSourceText.trim()) {
      toast({ title: "원문을 입력해주세요", description: "분석할 문자 내용을 붙여넣어주세요.", variant: "destructive" });
      return;
    }

    const { sourceUrls, textOnly } = splitEventSource(snapshotSourceText);
    form.setValue("sourceUrls", sourceUrls, { shouldDirty: true });
    if (sourceUrls.length > 0) {
      toast({ title: "링크는 저장했습니다", description: "링크 내용 수집은 준비 중이며 입력한 문자만 분석했습니다." });
    }
    if (!textOnly) {
      toast({ title: "분석할 문자 내용이 없습니다", description: "링크만 입력되어 문자 분석은 하지 않았습니다." });
      return;
    }

    if (snapshot.eventType !== "obituary") {
      form.setValue("details", { memo: textOnly }, { shouldDirty: true, shouldValidate: true });
      return;
    }

    const requestToken = ++parseRequestRef.current;
    setIsParsing(true);
    try {
      await settleAutosave();
      const response = await apiRequest("POST", "/api/obituary/parse", { text: textOnly });
      const parsed = await response.json() as ParsedObituary;
      const currentValues = form.getValues();
      if (!canApplyParsedSource({
        activeToken: parseRequestRef.current,
        currentEventType: currentValues.eventType,
        currentSourceText: currentValues.sourceText ?? "",
        requestEventType: snapshot.eventType,
        requestSourceText: snapshotSourceText,
        requestToken,
      })) {
        return;
      }

      const obituaryDetails: Partial<ObituaryDetails> = {};
      if (parsed.deceasedName) obituaryDetails.deceasedName = parsed.deceasedName;
      if (parsed.funeralHome) {
        form.setValue("location", parsed.funeralHome, { shouldDirty: true });
        obituaryDetails.funeralHome = parsed.funeralHome;
      }
      if (parsed.jangji) obituaryDetails.burialPlace = parsed.jangji;
      if (parsed.chiefMourner) obituaryDetails.chiefMourner = parsed.chiefMourner;
      if (parsed.bankAccount) form.setValue("accountInfo", parsed.bankAccount, { shouldDirty: true });
      if (parsed.contactNumber) form.setValue("contactNumber", parsed.contactNumber, { shouldDirty: true });
      if (parsed.dateOfDeath) form.setValue("eventDate", parsed.dateOfDeath, { shouldDirty: true });
      if (parsed.deceasedRelation && OBITUARY_RELATIONSHIPS.includes(parsed.deceasedRelation as ObituaryDetails["relationship"] & string)) {
        obituaryDetails.relationship = parsed.deceasedRelation as ObituaryDetails["relationship"];
      }
      if (sourceUrls[0]) obituaryDetails.sourceUrl = sourceUrls[0];
      form.setValue("details", {
        ...(currentValues.details as ObituaryDetails),
        ...obituaryDetails,
      }, { shouldDirty: true, shouldValidate: true });
      toast({ title: "부고 문자 분석 완료", description: "입력된 내용을 확인하고 필요한 정보를 보완해주세요." });
    } catch {
      toast({ title: "분석 실패", description: "문자 내용을 분석하지 못했습니다. 직접 입력해주세요.", variant: "destructive" });
    } finally {
      resumeAutosave();
      if (parseRequestRef.current === requestToken) setIsParsing(false);
    }
  };

  const completePublish = async (eventType: CommunityEventType) => {
    await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    queryClient.removeQueries({ queryKey: ["/api/events/drafts/latest"] });
    const resetValues = initialValues(eventType);
    completeDraftPublish(resetValues);
    form.reset(resetValues);
    form.clearErrors();
    setPublishErrors({});
    onPublished(eventType);
    toast({ title: "경조사를 게시했습니다", description: "새 소식이 아래 목록에 반영되었습니다." });
  };

  const applyPublishErrors = (data: CommunityEventDraftInput) => {
    const result = communityEventPublishSchema.safeParse(data);
    if (result.success) {
      form.clearErrors();
      setPublishErrors({});
      return true;
    }

    const errors: Record<string, string> = {};
    let firstPath: Path<CommunityEventDraftInput> | undefined;
    result.error.issues.forEach((issue) => {
      const path = toVisibleFieldPath(issue.path.join("."));
      if (!path || errors[path]) return;
      const message = "게시 전에 입력해주세요.";
      errors[path] = message;
      const formPath = toFormPath(path);
      form.setError(formPath, { type: "publish", message });
      firstPath ??= formPath;
    });
    setPublishErrors(errors);
    if (firstPath) form.setFocus(firstPath);
    return false;
  };

  const handleInvalidSubmit = (resolverErrors: FieldErrors<CommunityEventDraftInput>) => {
    const errors: Record<string, string> = {};
    let firstPath: Path<CommunityEventDraftInput> | undefined;
    collectFormErrorEntries(resolverErrors).forEach(({ path }) => {
      const fieldPath = toVisibleFieldPath(path);
      if (!fieldPath || errors[fieldPath]) return;
      errors[fieldPath] = fieldPath === "sourceText" && path.startsWith("sourceUrls")
        ? "공개 링크 형식을 확인해주세요."
        : "입력값을 확인해주세요.";
      const formPath = toFormPath(fieldPath);
      firstPath ??= formPath;
    });
    setPublishErrors(errors);
    if (firstPath) form.setFocus(firstPath);
    toast({ title: "입력 내용을 확인해주세요", description: "표시된 항목을 고친 뒤 다시 게시해주세요.", variant: "destructive" });
  };

  const publish: SubmitHandler<CommunityEventDraftInput> = async (data) => {
    if (publishingRef.current || !applyPublishErrors(data)) return;

    publishingRef.current = true;
    setIsPublishing(true);
    const publishSnapshot = data;
    try {
      const preparedDraftId = await prepareForPublish();
      const result = await publishDraftWithRecovery({
        createDraft: async (payload) => {
          const draft = await saveEventDraftWithFallback({
            eventType: payload.eventType,
            fetcher: (url, init) => url === "/api/events/drafts" && init?.method === "POST"
              ? apiRequest("POST", "/api/events/drafts", payload)
              : fetch(url, init),
            payload,
          });
          return { id: draft.id };
        },
        draftId: preparedDraftId,
        getEvent: async (publishDraftId) => {
          const response = await apiRequest("GET", `/api/events/${publishDraftId}`);
          return response.json() as Promise<{ status?: unknown }>;
        },
        payload: publishSnapshot,
        publishDraft: async (publishDraftId, payload) => {
          try {
            await apiRequest("POST", `/api/events/${publishDraftId}/publish`, payload);
          } catch (error) {
            const status = error instanceof Error
              ? Number(/^(\d{3}):/.exec(error.message)?.[1])
              : undefined;
            if (status && status >= 400 && status < 500 && status !== 408) {
              throw new ConclusivePublishError(error instanceof Error ? error.message : "게시 요청이 거절되었습니다.");
            }
            throw error;
          }
        },
        rememberDraftId: registerDraftId,
      });

      if (result.outcome === "published") {
        await completePublish(publishSnapshot.eventType);
      } else {
        lockPublishResolution(result.draftId);
        toast({
          title: "게시 확인이 필요합니다",
          description: "자동 저장을 멈췄습니다. 같은 소식의 게시 결과를 다시 확인해주세요.",
          variant: "destructive",
        });
      }
    } catch {
      if (!hasRecoveryError) {
        toast({ title: "게시 실패", description: "초안을 만들지 못했습니다. 잠시 후 다시 시도해주세요.", variant: "destructive" });
      }
    } finally {
      resumeAutosave();
      publishingRef.current = false;
      setIsPublishing(false);
    }
  };

  const handleDiscard = async () => {
    if (await discardDraft()) {
      form.clearErrors();
      setPublishErrors({});
    }
  };

  return (
    <section className="w-full border-y border-gray-200 py-4">
      <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div>
          <h2 className="text-base font-semibold text-gray-900">경조사 등록</h2>
          <p className="mt-1 text-sm text-gray-500">내용을 확인한 뒤 게시해주세요.</p>
        </div>
        <div className="flex min-h-8 flex-wrap items-center gap-1 text-sm text-gray-500 sm:justify-end" aria-live="polite">
          {isRecovered && <span>임시저장된 내용을 복구했습니다</span>}
          {isRecovering && <span>복구 중</span>}
          {isSaving && <span>저장 중</span>}
          {isSaved && <span>임시저장됨</span>}
          {draftError && <span className="text-red-700">{draftError}</span>}
          {canRetry && (
            <Button type="button" variant="ghost" size="sm" onClick={retryDraft} disabled={inputsDisabled} className="h-8 px-2">
              다시 시도
            </Button>
          )}
          {draftId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleDiscard()}
              disabled={inputsDisabled}
              className="h-8 px-2"
            >
              <Trash2 aria-hidden="true" />
              초안 삭제
            </Button>
          )}
        </div>
      </div>

      <form className="space-y-4" onSubmit={form.handleSubmit(publish, handleInvalidSubmit)}>
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
                disabled={inputsDisabled}
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
            disabled={inputsDisabled}
            className="mt-2 min-h-[96px] resize-none"
            placeholder="문자와 공개 링크를 함께 붙여넣으세요"
            aria-describedby={sourceError ? "event-source-error" : undefined}
            aria-invalid={Boolean(sourceError)}
            {...form.register("sourceText")}
          />
          {sourceError && <p id="event-source-error" role="alert" className="mt-1 text-sm text-red-700">{sourceError}</p>}
        </div>

        <Button type="button" variant="outline" onClick={() => void loadSource()} disabled={inputsDisabled} className="w-full sm:w-auto">
          {isParsing ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <FileText aria-hidden="true" />}
          경조사 내용 불러오기
        </Button>

        <EventFields disabled={inputsDisabled} eventType={currentType} form={form} publishErrors={publishErrors} />

        {currentType === "obituary" && (
          <ObituaryPreview
            contentFingerprint={previewFingerprint}
            draftId={draftId}
            draftStatus={isRecovered ? "recovered" : isSaved ? "saved" : isSaving ? "saving" : "idle"}
            eventType={currentType}
            isPaused={inputsDisabled}
          />
        )}

        {isPublishResolutionPending && (
          <div className="border-y border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900" role="status">
            게시 응답을 확인하지 못해 자동 저장을 멈췄습니다. 아래 버튼으로 같은 소식의 결과를 다시 확인해주세요.
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">게시 후 경조사 목록에서 바로 확인할 수 있습니다.</p>
          <Button type="submit" disabled={isBusy} className="sm:min-w-28">
            {isPublishing ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
            {isPublishResolutionPending ? "게시 결과 다시 확인" : "게시"}
          </Button>
        </div>
      </form>
    </section>
  );
}
