import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { refreshPosts } from "@/lib/post-management";
import type { NoticeDraft, NoticeType } from "@shared/contracts/notices";
import { requestNoticeDraft as request } from "./notice-draft-api";

export function useNoticeComposer(type: NoticeType) {
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState<NoticeDraft>();
  const draftRef = useRef<NoticeDraft>();
  const [text, setText] = useState("");
  const textRef = useRef("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const active = useRef(true);
  const adopt = useCallback((value: NoticeDraft) => {
    draftRef.current = value;
    if (active.current) {
      setDraft(value);
      setConfirmed(false);
    }
    return value;
  }, []);
  // 저장·생성·게시가 같은 revision을 경쟁해 사용하지 않도록 순서를 고정한다.
  const serialize = useCallback(<T>(operation: () => Promise<T>): Promise<T> => {
    const task = queue.current.then(operation);
    // 호출자에게 실패를 반환하되 큐는 복구해 다음 요청을 계속 처리한다.
    queue.current = task.catch(() => undefined);
    return task;
  }, []);
  // 큐가 실행되는 시점의 최신 텍스트와 revision을 읽어 오래된 closure를 피한다.
  const save = useCallback(
    () =>
      serialize(async () => {
        const current = draftRef.current;
        if (!current || current.sourceText === textRef.current) return current;
        return adopt(
          await request<NoticeDraft>("PATCH", `/${current.id}`, {
            revision: current.revision,
            sourceText: textRef.current,
          }),
        );
      }),
    [serialize, adopt],
  );
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    request<NoticeDraft>("POST", `/drafts/${type}`, undefined, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        adopt(value);
        textRef.current = value.sourceText || "";
        setText(textRef.current);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    // 화면을 떠나도 큐의 저장은 이어가며, React 상태 갱신만 막는다.
    return () => {
      active.current = false;
      controller.abort();
      void save().catch(() => undefined);
    };
  }, [type, adopt, save]);
  useEffect(() => {
    if (!draft || draft.sourceText === text) return;
    const timer = setTimeout(() => {
      void save().catch((cause) => {
        if (active.current) setError(cause.message);
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [text, draft, save]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (draftRef.current && draftRef.current.sourceText !== textRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const edit = (value: string) => {
    textRef.current = value;
    setText(value);
    setConfirmed(false);
    setError("");
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "요청에 실패했습니다.");
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const generate = () =>
    run(async () => {
      await save();
      await serialize(async () => {
        const current = draftRef.current!;
        adopt(
          await request<NoticeDraft>("POST", `/${current.id}/generate`, {
            revision: current.revision,
          }),
        );
      });
    });
  const move = (path: string) =>
    run(async () => {
      await save();
      navigate(path);
    });
  const publish = () =>
    run(async () => {
      if (!confirmed || textRef.current !== draftRef.current?.sourceText) {
        throw new Error("미리보기를 다시 확인해 주세요.");
      }
      await serialize(async () => {
        const current = draftRef.current!;
        const result = await request<{ id: number }>("POST", `/${current.id}/publish`, {
          revision: current.revision,
        });
        draftRef.current = undefined;
        textRef.current = "";
        setText("");
        setDraft(undefined);
        setAnswer("");
        await refreshPosts();
        navigate(`/p/${result.id}`);
      });
    });
  const remove = () =>
    run(async () => {
      await serialize(async () => {
        const current = draftRef.current!;
        await request("DELETE", `/${current.id}`, { revision: current.revision });
        draftRef.current = undefined;
        textRef.current = "";
        navigate("/b");
      });
    });
  const previewCurrent = draft && text === draft.sourceText;
  return {
    draft,
    text,
    answer,
    error,
    busy,
    confirmed,
    previewCurrent,
    edit,
    setAnswer,
    setConfirmed,
    generate,
    move,
    publish,
    remove,
  };
}

export type NoticeComposerController = ReturnType<typeof useNoticeComposer>;
