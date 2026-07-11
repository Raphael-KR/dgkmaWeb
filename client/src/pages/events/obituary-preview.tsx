import { useEffect, useRef, useState } from "react";
import { Copy, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { CommunityEventType } from "@shared/community-events";
import {
  canApplyPreviewResponse,
  type PreviewRequestIdentity,
} from "./obituary-preview-logic";

type ObituaryPreviewProps = {
  contentFingerprint: string;
  draftId?: number;
  eventType: CommunityEventType;
  isPaused: boolean;
  isSaved: boolean;
};

type PreviewState =
  | { status: "idle" | "loading" | "error" }
  | { status: "incomplete"; missingFields: string[]; request: PreviewRequestIdentity }
  | { status: "success"; text: string; request: PreviewRequestIdentity };

const missingFieldLabels: Record<string, string> = {
  graduationClass: "졸업 기수",
  admissionYear: "입학 연도",
  memberName: "회원 이름",
  membershipTier: "회원 등급",
  relationship: "고인과의 관계",
  deceasedName: "고인 성함",
  deceasedAge: "고인 나이",
  funeralHome: "빈소",
  funeralDate: "발인 일시",
  memberPhone: "회원 연락처",
};

function isMissingFields(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((field) => typeof field === "string");
}

export function ObituaryPreview({
  contentFingerprint,
  draftId,
  eventType,
  isPaused,
  isSaved,
}: ObituaryPreviewProps) {
  const { toast } = useToast();
  const [state, setState] = useState<PreviewState>({ status: "idle" });
  const requestVersionRef = useRef(0);
  const controllerRef = useRef<AbortController>();
  const activeRef = useRef({
    eventType,
    draftId,
    contentFingerprint,
    requestVersion: 0,
    isPaused,
  });
  activeRef.current = {
    eventType,
    draftId,
    contentFingerprint,
    requestVersion: requestVersionRef.current,
    isPaused,
  };

  useEffect(() => {
    requestVersionRef.current += 1;
    activeRef.current.requestVersion = requestVersionRef.current;
    controllerRef.current?.abort();
    setState({ status: "idle" });
  }, [contentFingerprint, draftId, eventType, isPaused]);

  useEffect(() => {
    if (eventType !== "obituary" || !draftId || !isSaved || isPaused) return;

    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    const request: PreviewRequestIdentity = {
      eventType,
      draftId,
      contentFingerprint,
      requestVersion: ++requestVersionRef.current,
    };
    activeRef.current.requestVersion = request.requestVersion;
    setState({ status: "loading" });

    void (async () => {
      try {
        const response = await fetch(`/api/events/${draftId}/preview`, {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
        });
        const payload = await response.json() as { text?: unknown; missingFields?: unknown };
        if (!canApplyPreviewResponse(activeRef.current, request)) return;
        if (response.status === 400 && isMissingFields(payload.missingFields)) {
          setState({ status: "incomplete", missingFields: payload.missingFields, request });
          return;
        }
        if (!response.ok || typeof payload.text !== "string") {
          setState({ status: "error" });
          return;
        }
        setState({ status: "success", text: payload.text, request });
      } catch (error) {
        if (controller.signal.aborted || !canApplyPreviewResponse(activeRef.current, request)) return;
        setState({ status: "error" });
      }
    })();

    return () => controller.abort();
  }, [draftId, eventType, isPaused, isSaved]);

  const isCurrentRequest = "request" in state
    && canApplyPreviewResponse(activeRef.current, state.request);
  const currentText = state.status === "success" && isCurrentRequest ? state.text : undefined;
  const missingFields = state.status === "incomplete" && isCurrentRequest
    ? state.missingFields
    : undefined;

  const copyPreview = async () => {
    if (!currentText) return;
    try {
      await navigator.clipboard.writeText(currentText);
      toast({ title: "복사 완료", description: "표준 부고문을 복사했습니다." });
    } catch {
      toast({ title: "복사 실패", description: "부고문을 직접 선택해 복사해주세요.", variant: "destructive" });
    }
  };

  return (
    <section className="border-t border-gray-200 pt-4" aria-labelledby="obituary-preview-heading">
      <div className="flex min-h-10 items-center justify-between gap-2">
        <h3 id="obituary-preview-heading" className="text-sm font-semibold text-gray-900">표준 부고문 미리보기</h3>
        {currentText && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => void copyPreview()}
                aria-label="표준 부고문 복사"
              >
                <Copy aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>표준 부고문 복사</TooltipContent>
          </Tooltip>
        )}
      </div>

      {state.status === "loading" && (
        <div className="flex min-h-16 items-center gap-2 text-sm text-gray-500" aria-live="polite">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          미리보기 준비 중
        </div>
      )}
      {missingFields && (
        <div className="mt-2 text-sm text-red-700" role="status">
          <p>미리보기에 필요한 정보가 부족합니다.</p>
          <p className="mt-1">{missingFields.map((field) => missingFieldLabels[field] ?? field).join(", ")}</p>
        </div>
      )}
      {state.status === "error" && (
        <p className="mt-2 text-sm text-red-700" role="status">미리보기를 불러오지 못했습니다.</p>
      )}
      {currentText && (
        <pre className="mt-2 whitespace-pre-wrap break-words border-l-2 border-gray-300 pl-3 font-sans text-sm leading-6 text-gray-800">
          {currentText}
        </pre>
      )}
    </section>
  );
}
