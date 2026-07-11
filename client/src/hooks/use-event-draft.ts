import { useCallback, useEffect, useRef, useState } from "react";
import { useFormState, type UseFormReturn } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  type CommunityEventDraftInput,
  type CommunityEventType,
} from "@shared/community-events";
import { canApplyDraftResult, hasMeaningfulDraftInput } from "@/pages/events/event-composer-logic";
import {
  clearedDraftFailureState,
  draftFingerprint,
  fetchLatestEventDraft,
  planImmediateSaveRetry,
  saveEventDraftWithFallback,
  shouldResumeAutosave,
  shouldApplyRecoveredDraft,
  waitForDraftReadiness,
  type DraftFetcher,
} from "./event-draft-coordinator";

type DraftStatus = "idle" | "recovering" | "recovered" | "saving" | "saved" | "discarding" | "error";
type DraftErrorKind = "recovery" | "save" | "discard";

type UseEventDraftInput = {
  eventType: CommunityEventType;
  form: UseFormReturn<CommunityEventDraftInput>;
  isPaused: boolean;
};

function emptyDraft(eventType: CommunityEventType): CommunityEventDraftInput {
  return { eventType, sourceUrls: [], details: {} } as CommunityEventDraftInput;
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
  const { isDirty } = useFormState({ control: form.control });
  const [draftId, setDraftId] = useState<number>();
  const [status, setStatus] = useState<DraftStatus>("recovering");
  const [errorMessage, setErrorMessage] = useState<string>();
  const [errorKind, setErrorKind] = useState<DraftErrorKind>();
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const [publishResolutionId, setPublishResolutionId] = useState<number>();
  const activeRef = useRef({ eventType, generation: 0 });
  const draftIdRef = useRef<number>();
  const draftIdsByTypeRef = useRef(new Map<CommunityEventType, number>());
  const typeEpochRef = useRef(new Map<CommunityEventType, number>());
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const recoveryControllerRef = useRef<AbortController>();
  const recoveryPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const mountedRef = useRef(true);
  const isDirtyRef = useRef(isDirty);
  const recoveringRef = useRef(true);
  const recoveryFailedRef = useRef(false);
  const discardingRef = useRef(false);
  const externallyPausedRef = useRef(isPaused);
  const manuallyPausedRef = useRef(false);
  const publishResolutionIdRef = useRef<number>();
  const suppressedFingerprintRef = useRef<string>();
  const fetcher = useCallback<DraftFetcher>((url, init) => fetch(url, init), []);

  externallyPausedRef.current = isPaused;
  isDirtyRef.current = isDirty;

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

  const clearFailureGates = useCallback(() => {
    const cleared = clearedDraftFailureState();
    recoveryFailedRef.current = cleared.recoveryFailed;
    setErrorKind(cleared.errorKind);
    setErrorMessage(cleared.errorMessage);
    setStatus(cleared.status);
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
        || recoveringRef.current
        || requestEpoch !== (typeEpochRef.current.get(requestEventType) ?? 0)
        || !isCurrent(requestEventType, requestGeneration)
      ) {
        return;
      }

      setStatus("saving");
      setErrorMessage(undefined);
      setErrorKind(undefined);
      const knownDraftId = draftIdsByTypeRef.current.get(requestEventType);

      try {
        const savedDraft = await saveEventDraftWithFallback({
          draftId: knownDraftId,
          eventType: requestEventType,
          fetcher,
          payload: values,
        });
        if (requestEpoch === (typeEpochRef.current.get(requestEventType) ?? 0)) {
          draftIdsByTypeRef.current.set(requestEventType, savedDraft.id);
        }
        if (isCurrent(requestEventType, requestGeneration)) {
          draftIdRef.current = savedDraft.id;
          setDraftId(savedDraft.id);
          if (revision === saveRevisionRef.current) setStatus("saved");
        }
      } catch (error) {
        if (isCurrent(requestEventType, requestGeneration) && revision === saveRevisionRef.current) {
          setStatus("error");
          setErrorKind("save");
          setErrorMessage(error instanceof Error ? error.message : "임시 저장에 실패했습니다.");
        }
      }
    });
    return saveQueueRef.current;
  }, [fetcher, isCurrent]);

  const scheduleSave = useCallback((values: CommunityEventDraftInput) => {
    clearSaveTimeout();
    if (
      values.eventType !== activeRef.current.eventType
      || recoveringRef.current
      || recoveryFailedRef.current
      || externallyPausedRef.current
      || manuallyPausedRef.current
      || !hasMeaningfulDraftInput(values)
    ) {
      return;
    }

    const valueFingerprint = draftFingerprint(values);
    if (suppressedFingerprintRef.current === valueFingerprint) {
      suppressedFingerprintRef.current = undefined;
      return;
    }

    const requestEventType = activeRef.current.eventType;
    const requestGeneration = activeRef.current.generation;
    const revision = ++saveRevisionRef.current;
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = undefined;
      void persistDraft(values, requestEventType, requestGeneration, revision);
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
    const startFingerprint = draftFingerprint(form.getValues());
    activeRef.current = { eventType, generation };
    recoveringRef.current = true;
    recoveryFailedRef.current = false;
    draftIdRef.current = draftIdsByTypeRef.current.get(eventType);
    setDraftId(draftIdRef.current);
    setStatus("recovering");
    setErrorMessage(undefined);
    setErrorKind(undefined);

    const controller = new AbortController();
    recoveryControllerRef.current = controller;
    const recoveryPromise = (async () => {
      try {
        const recoveredDraft = await fetchLatestEventDraft(fetcher, eventType, controller.signal);
        if (!isCurrent(eventType, generation)) return;
        if (!recoveredDraft) {
          draftIdsByTypeRef.current.delete(eventType);
          draftIdRef.current = undefined;
          setDraftId(undefined);
          setStatus("idle");
          return;
        }

        draftIdsByTypeRef.current.set(eventType, recoveredDraft.id);
        draftIdRef.current = recoveredDraft.id;
        setDraftId(recoveredDraft.id);
        const { id: _recoveredId, ...recoveredValues } = recoveredDraft;
        const canReset = shouldApplyRecoveredDraft({
          activeEventType: activeRef.current.eventType,
          activeGeneration: activeRef.current.generation,
          currentFingerprint: draftFingerprint(form.getValues()),
          isDirty: isDirtyRef.current,
          requestEventType: eventType,
          requestGeneration: generation,
          responseEventType: recoveredDraft.eventType,
          startFingerprint,
        });
        if (canReset) {
          suppressedFingerprintRef.current = draftFingerprint(recoveredValues);
          form.reset(recoveredValues as CommunityEventDraftInput);
          setStatus("recovered");
        } else {
          setStatus("idle");
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (isCurrent(eventType, generation)) {
          recoveryFailedRef.current = true;
          setStatus("error");
          setErrorKind("recovery");
          setErrorMessage(error instanceof Error ? error.message : "임시 저장 내용을 불러오지 못했습니다.");
        }
      } finally {
        if (isCurrent(eventType, generation)) {
          recoveringRef.current = false;
          scheduleSave(form.getValues());
        }
      }
    })();
    recoveryPromiseRef.current = recoveryPromise;

    return () => controller.abort();
  }, [clearSaveTimeout, eventType, fetcher, form, isCurrent, recoveryAttempt, scheduleSave]);

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
    const readyDraftId = await waitForDraftReadiness({
      getDraftId: () => draftIdRef.current,
      getSavePromise: () => saveQueueRef.current.catch(() => undefined),
      recoveryPromise: recoveryPromiseRef.current.catch(() => undefined),
    });
    if (mountedRef.current) setStatus((current) => current === "saving" ? "idle" : current);
    return readyDraftId;
  }, [clearSaveTimeout]);

  const resumeAutosave = useCallback(() => {
    if (!shouldResumeAutosave(publishResolutionIdRef.current)) return;
    manuallyPausedRef.current = false;
    if (!externallyPausedRef.current) scheduleSave(form.getValues());
  }, [form, scheduleSave]);

  const prepareForPublish = useCallback(async () => {
    if (publishResolutionIdRef.current) return publishResolutionIdRef.current;
    const readyDraftId = await settleAutosave();
    if (recoveryFailedRef.current) {
      throw new Error("초안 복구를 다시 시도한 뒤 게시해주세요.");
    }
    return readyDraftId;
  }, [settleAutosave]);

  const registerDraftId = useCallback((id: number) => {
    if (!mountedRef.current) return;
    const currentType = activeRef.current.eventType;
    draftIdsByTypeRef.current.set(currentType, id);
    draftIdRef.current = id;
    setDraftId(id);
  }, []);

  const lockPublishResolution = useCallback((id: number) => {
    if (!mountedRef.current) return;
    clearSaveTimeout();
    manuallyPausedRef.current = true;
    publishResolutionIdRef.current = id;
    setPublishResolutionId(id);
    const currentType = activeRef.current.eventType;
    draftIdsByTypeRef.current.set(currentType, id);
    draftIdRef.current = id;
    setDraftId(id);
  }, [clearSaveTimeout]);

  const completePublish = useCallback((resetValues: CommunityEventDraftInput) => {
    clearSaveTimeout();
    if (!mountedRef.current) return;
    saveRevisionRef.current += 1;
    publishResolutionIdRef.current = undefined;
    setPublishResolutionId(undefined);
    const currentType = activeRef.current.eventType;
    typeEpochRef.current.set(currentType, (typeEpochRef.current.get(currentType) ?? 0) + 1);
    draftIdsByTypeRef.current.delete(currentType);
    draftIdRef.current = undefined;
    setDraftId(undefined);
    clearFailureGates();
    suppressedFingerprintRef.current = draftFingerprint(resetValues);
    queryClient.removeQueries({ queryKey: ["/api/events/drafts/latest", currentType] });
  }, [clearFailureGates, clearSaveTimeout]);

  const discardDraft = useCallback(async () => {
    if (discardingRef.current || publishResolutionIdRef.current) return false;
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
    setErrorKind(undefined);
    try {
      const response = await fetcher(`/api/events/drafts/${id}`, {
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
      suppressedFingerprintRef.current = draftFingerprint(resetValues);
      form.reset(resetValues);
      queryClient.removeQueries({ queryKey: ["/api/events/drafts/latest", requestEventType] });
      clearFailureGates();
      return true;
    } catch (error) {
      if (!isCurrent(requestEventType, requestGeneration)) return false;
      const message = error instanceof Error ? error.message : "초안을 삭제하지 못했습니다.";
      setStatus("error");
      setErrorKind("discard");
      setErrorMessage(message);
      toast({ title: "초안 삭제 실패", description: message, variant: "destructive" });
      return false;
    } finally {
      manuallyPausedRef.current = false;
      discardingRef.current = false;
    }
  }, [clearFailureGates, fetcher, form, isCurrent, resumeAutosave, settleAutosave, toast]);

  const retryDraft = useCallback(() => {
    if (errorKind === "recovery") {
      recoveringRef.current = true;
      recoveryFailedRef.current = false;
      setStatus("recovering");
      setErrorMessage(undefined);
      setErrorKind(undefined);
      setRecoveryAttempt((attempt) => attempt + 1);
      return;
    }
    if (errorKind !== "save") return;

    clearSaveTimeout();
    manuallyPausedRef.current = false;
    const values = form.getValues();
    const retry = planImmediateSaveRetry({
      currentRevision: saveRevisionRef.current,
      hasMeaningfulInput: hasMeaningfulDraftInput(values),
    });
    saveRevisionRef.current = retry.revision;
    const cleared = clearedDraftFailureState();
    recoveryFailedRef.current = cleared.recoveryFailed;
    setErrorKind(cleared.errorKind);
    setErrorMessage(cleared.errorMessage);
    setStatus(retry.status);
    if (!retry.shouldSave) return;
    void persistDraft(values, activeRef.current.eventType, activeRef.current.generation, retry.revision);
  }, [clearSaveTimeout, errorKind, form, persistDraft]);

  const isRecovering = status === "recovering" || activeRef.current.eventType !== eventType;

  return {
    draftId,
    errorMessage,
    canRetry: errorKind === "recovery" || errorKind === "save",
    hasRecoveryError: errorKind === "recovery",
    isDiscarding: status === "discarding",
    isRecovered: status === "recovered",
    isRecovering,
    isSaving: status === "saving",
    isSaved: status === "saved",
    isPublishResolutionPending: publishResolutionId !== undefined,
    completePublish,
    discardDraft,
    prepareForPublish,
    registerDraftId,
    lockPublishResolution,
    resumeAutosave,
    retryDraft,
    settleAutosave,
  };
}
