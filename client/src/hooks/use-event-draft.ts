import { useCallback, useEffect, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  communityEventDraftSchema,
  type CommunityEventDraftInput,
  type CommunityEventType,
} from "@shared/community-events";
import { canApplyDraftResult, hasMeaningfulDraftInput } from "@/pages/events/event-composer-logic";

type DraftStatus = "idle" | "recovering" | "recovered" | "saving" | "saved" | "discarding" | "error";

type UseEventDraftInput = {
  eventType: CommunityEventType;
  form: UseFormReturn<CommunityEventDraftInput>;
  isPaused: boolean;
};

function emptyDraft(eventType: CommunityEventType): CommunityEventDraftInput {
  return { eventType, sourceUrls: [], details: {} } as CommunityEventDraftInput;
}

function fingerprint(value: CommunityEventDraftInput) {
  return JSON.stringify(value);
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { message?: unknown };
    return typeof body.message === "string" ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export function useEventDraft({ eventType, form, isPaused }: UseEventDraftInput) {
  const { toast } = useToast();
  const [draftId, setDraftId] = useState<number>();
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string>();
  const activeRef = useRef({ eventType, generation: 0 });
  const draftIdRef = useRef<number>();
  const draftIdsByTypeRef = useRef(new Map<CommunityEventType, number>());
  const typeEpochRef = useRef(new Map<CommunityEventType, number>());
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const recoveryControllerRef = useRef<AbortController>();
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const mountedRef = useRef(true);
  const recoveringRef = useRef(false);
  const discardingRef = useRef(false);
  const externallyPausedRef = useRef(isPaused);
  const manuallyPausedRef = useRef(false);
  const suppressedFingerprintRef = useRef<string>();

  externallyPausedRef.current = isPaused;

  const clearSaveTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const isCurrent = useCallback((requestEventType: CommunityEventType, requestGeneration: number) => {
    return mountedRef.current && canApplyDraftResult({
      activeEventType: activeRef.current.eventType,
      activeGeneration: activeRef.current.generation,
      requestEventType,
      requestGeneration,
    });
  }, []);

  const persistDraft = useCallback((
    values: CommunityEventDraftInput,
    requestEventType: CommunityEventType,
    requestGeneration: number,
    revision: number,
  ) => {
    const requestEpoch = typeEpochRef.current.get(requestEventType) ?? 0;
    saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(async () => {
      if (
        manuallyPausedRef.current
        || externallyPausedRef.current
        || requestEpoch !== (typeEpochRef.current.get(requestEventType) ?? 0)
        || !isCurrent(requestEventType, requestGeneration)
      ) {
        return;
      }

      setStatus("saving");
      setErrorMessage(undefined);
      const knownDraftId = draftIdsByTypeRef.current.get(requestEventType);
      const method = knownDraftId ? "PATCH" : "POST";
      const url = knownDraftId ? `/api/events/drafts/${knownDraftId}` : "/api/events/drafts";

      try {
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
          credentials: "include",
        });
        if (!response.ok) throw new Error(await responseError(response, "임시 저장에 실패했습니다."));
        const savedDraft = await response.json() as { id?: unknown };
        const savedId = typeof savedDraft.id === "number" ? savedDraft.id : knownDraftId;
        if (!savedId) throw new Error("초안 ID를 받지 못했습니다.");

        if (requestEpoch === (typeEpochRef.current.get(requestEventType) ?? 0)) {
          draftIdsByTypeRef.current.set(requestEventType, savedId);
        }
        if (isCurrent(requestEventType, requestGeneration)) {
          draftIdRef.current = savedId;
          setDraftId(savedId);
          if (revision === saveRevisionRef.current) setStatus("saved");
        }
      } catch (error) {
        if (isCurrent(requestEventType, requestGeneration) && revision === saveRevisionRef.current) {
          setStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "임시 저장에 실패했습니다.");
        }
      }
    });
  }, [isCurrent]);

  const scheduleSave = useCallback((values: CommunityEventDraftInput) => {
    clearSaveTimeout();
    if (
      values.eventType !== activeRef.current.eventType
      || recoveringRef.current
      || externallyPausedRef.current
      || manuallyPausedRef.current
      || !hasMeaningfulDraftInput(values)
    ) {
      return;
    }

    const valueFingerprint = fingerprint(values);
    if (suppressedFingerprintRef.current === valueFingerprint) {
      suppressedFingerprintRef.current = undefined;
      return;
    }

    const requestEventType = activeRef.current.eventType;
    const requestGeneration = activeRef.current.generation;
    const revision = ++saveRevisionRef.current;
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = undefined;
      persistDraft(values, requestEventType, requestGeneration, revision);
    }, 600);
  }, [clearSaveTimeout, persistDraft]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearSaveTimeout();
      recoveryControllerRef.current?.abort();
      activeRef.current.generation += 1;
    };
  }, [clearSaveTimeout]);

  useEffect(() => {
    clearSaveTimeout();
    recoveryControllerRef.current?.abort();
    const generation = activeRef.current.generation + 1;
    activeRef.current = { eventType, generation };
    recoveringRef.current = true;
    draftIdRef.current = draftIdsByTypeRef.current.get(eventType);
    setDraftId(draftIdRef.current);
    setStatus("recovering");
    setErrorMessage(undefined);

    const controller = new AbortController();
    recoveryControllerRef.current = controller;
    void (async () => {
      try {
        const response = await fetch(`/api/events/drafts/latest?type=${encodeURIComponent(eventType)}`, {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        });
        if (response.status === 404) {
          if (isCurrent(eventType, generation)) {
            draftIdsByTypeRef.current.delete(eventType);
            draftIdRef.current = undefined;
            setDraftId(undefined);
            setStatus("idle");
          }
          return;
        }
        if (!response.ok) throw new Error(await responseError(response, "임시 저장 내용을 불러오지 못했습니다."));

        const rawDraft = await response.json() as { id?: unknown };
        const parsedDraft = communityEventDraftSchema.safeParse(rawDraft);
        if (!parsedDraft.success || typeof rawDraft.id !== "number") {
          throw new Error("임시 저장 내용의 형식이 올바르지 않습니다.");
        }
        if (!isCurrent(eventType, generation)) return;

        draftIdsByTypeRef.current.set(eventType, rawDraft.id);
        draftIdRef.current = rawDraft.id;
        setDraftId(rawDraft.id);
        if (!form.formState.isDirty) {
          suppressedFingerprintRef.current = fingerprint(parsedDraft.data);
          form.reset(parsedDraft.data);
          setStatus("recovered");
        } else {
          setStatus("idle");
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (isCurrent(eventType, generation)) {
          setStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "임시 저장 내용을 불러오지 못했습니다.");
        }
      } finally {
        if (isCurrent(eventType, generation)) {
          recoveringRef.current = false;
          scheduleSave(form.getValues());
        }
      }
    })();

    return () => controller.abort();
  }, [clearSaveTimeout, eventType, form, isCurrent, scheduleSave]);

  useEffect(() => {
    const subscription = form.watch((values) => scheduleSave(values as CommunityEventDraftInput));
    if (!isPaused) scheduleSave(form.getValues());
    return () => {
      subscription.unsubscribe();
      clearSaveTimeout();
    };
  }, [clearSaveTimeout, eventType, form, isPaused, scheduleSave]);

  const settleAutosave = useCallback(async () => {
    manuallyPausedRef.current = true;
    clearSaveTimeout();
    saveRevisionRef.current += 1;
    await saveQueueRef.current.catch(() => undefined);
    if (mountedRef.current) setStatus((current) => current === "saving" ? "idle" : current);
  }, [clearSaveTimeout]);

  const resumeAutosave = useCallback(() => {
    manuallyPausedRef.current = false;
    if (!externallyPausedRef.current) scheduleSave(form.getValues());
  }, [form, scheduleSave]);

  const prepareForPublish = useCallback(async () => {
    await settleAutosave();
    return draftIdRef.current;
  }, [settleAutosave]);

  const registerDraftId = useCallback((id: number) => {
    if (!mountedRef.current) return;
    const currentType = activeRef.current.eventType;
    draftIdsByTypeRef.current.set(currentType, id);
    draftIdRef.current = id;
    setDraftId(id);
  }, []);

  const completePublish = useCallback((resetValues: CommunityEventDraftInput) => {
    clearSaveTimeout();
    if (!mountedRef.current) return;
    saveRevisionRef.current += 1;
    const currentType = activeRef.current.eventType;
    typeEpochRef.current.set(currentType, (typeEpochRef.current.get(currentType) ?? 0) + 1);
    draftIdsByTypeRef.current.delete(currentType);
    draftIdRef.current = undefined;
    setDraftId(undefined);
    setStatus("idle");
    setErrorMessage(undefined);
    suppressedFingerprintRef.current = fingerprint(resetValues);
    queryClient.removeQueries({ queryKey: ["/api/events/drafts/latest", currentType] });
  }, [clearSaveTimeout]);

  const discardDraft = useCallback(async () => {
    if (discardingRef.current) return false;
    const requestEventType = activeRef.current.eventType;
    const requestGeneration = activeRef.current.generation;
    discardingRef.current = true;
    setStatus("discarding");
    await settleAutosave();
    const id = draftIdRef.current;
    if (!id) {
      resumeAutosave();
      discardingRef.current = false;
      setStatus("idle");
      return false;
    }

    setErrorMessage(undefined);
    try {
      const response = await fetch(`/api/events/drafts/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await responseError(response, "초안을 삭제하지 못했습니다."));
      if (!isCurrent(requestEventType, requestGeneration)) return true;

      typeEpochRef.current.set(requestEventType, (typeEpochRef.current.get(requestEventType) ?? 0) + 1);
      draftIdsByTypeRef.current.delete(requestEventType);
      draftIdRef.current = undefined;
      setDraftId(undefined);
      const resetValues = emptyDraft(requestEventType);
      suppressedFingerprintRef.current = fingerprint(resetValues);
      form.reset(resetValues);
      queryClient.removeQueries({ queryKey: ["/api/events/drafts/latest", requestEventType] });
      setStatus("idle");
      return true;
    } catch (error) {
      if (!isCurrent(requestEventType, requestGeneration)) return false;
      const message = error instanceof Error ? error.message : "초안을 삭제하지 못했습니다.";
      setStatus("error");
      setErrorMessage(message);
      toast({ title: "초안 삭제 실패", description: message, variant: "destructive" });
      return false;
    } finally {
      manuallyPausedRef.current = false;
      discardingRef.current = false;
    }
  }, [form, isCurrent, resumeAutosave, settleAutosave, toast]);

  return {
    draftId,
    errorMessage,
    isDiscarding: status === "discarding",
    isRecovered: status === "recovered",
    isSaving: status === "saving",
    isSaved: status === "saved",
    completePublish,
    discardDraft,
    prepareForPublish,
    registerDraftId,
    resumeAutosave,
    settleAutosave,
  };
}
