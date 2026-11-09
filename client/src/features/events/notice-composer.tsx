import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { NOTICE_LABELS, NOTICE_TYPES, type NoticeDraft, type NoticeType } from "@shared/contracts/notices";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useSeo } from "@/lib/seo";
import { PostBody } from "@/components/post-body";

const base = "/api/posts/notices";
async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(base + path, { method, credentials: "include", signal,
    headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "요청을 처리하지 못했습니다.");
  }
  return response.status === 204 ? undefined as T : response.json();
}
export default function NoticeComposerPage() {
  const [, params] = useRoute("/b/write/:type");
  const type = NOTICE_TYPES.find((value) => value === params?.type);
  return type ? <Composer key={type} type={type} /> : <p className="p-8">지원하지 않는 경조사 유형입니다.</p>;
}
function Composer({ type }: { type: NoticeType }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
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
    if (active.current) { setDraft(value); setConfirmed(false); }
    return value;
  }, []);
  const serialize = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const task = queue.current.then(operation);
    queue.current = task.catch(() => undefined);
    return task;
  }, []);
  const save = useCallback(() => serialize(async () => {
    const current = draftRef.current;
    if (!current || current.sourceText === textRef.current) return current;
    return adopt(await request<NoticeDraft>("PATCH", `/${current.id}`, { revision: current.revision, sourceText: textRef.current }));
  }), [serialize, adopt]);
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    request<NoticeDraft>("POST", `/drafts/${type}`, undefined, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      adopt(value); textRef.current = value.sourceText || ""; setText(textRef.current);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => { active.current = false; controller.abort(); void save().catch(() => undefined); };
  }, [type, adopt, save]);
  useEffect(() => {
    if (!draft || draft.sourceText === text) return;
    const timer = setTimeout(() => { void save().catch((cause) => { if (active.current) setError(cause.message); }); }, 600);
    return () => clearTimeout(timer);
  }, [text, draft, save]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (draftRef.current && draftRef.current.sourceText !== textRef.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useSeo({ title: `${NOTICE_LABELS[type]} 작성`, description: "회원 경조사 작성", path: `/b/write/${type}`, noIndex: true });
  const edit = (value: string) => { textRef.current = value; setText(value); setConfirmed(false); setError(""); };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "요청에 실패했습니다."); }
    finally { if (active.current) setBusy(false); }
  };
  const generate = () => run(async () => {
    await save();
    await serialize(async () => {
      const current = draftRef.current!;
      adopt(await request<NoticeDraft>("POST", `/${current.id}/generate`, { revision: current.revision }));
    });
  });
  const move = (path: string) => run(async () => { await save(); navigate(path); });
  const publish = () => run(async () => {
    if (!confirmed || textRef.current !== draftRef.current?.sourceText) throw new Error("미리보기를 다시 확인해 주세요.");
    await serialize(async () => {
      const current = draftRef.current!;
      const result = await request<{ id: number }>("POST", `/${current.id}/publish`, { revision: current.revision });
      draftRef.current = undefined; textRef.current = ""; setText(""); setDraft(undefined); setAnswer("");
      await queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      navigate(`/p/${result.id}`);
    });
  });
  const remove = () => run(async () => {
    await serialize(async () => {
      const current = draftRef.current!;
      await request("DELETE", `/${current.id}`, { revision: current.revision });
      draftRef.current = undefined; textRef.current = "";
      navigate("/b");
    });
  });
  const previewCurrent = draft && text === draft.sourceText;
  return <main className="max-w-xl mx-auto p-4 pb-24 space-y-5">
    <Button variant="ghost" disabled={busy} onClick={() => void move("/b")}>← 게시판</Button>
    <h1 className="text-2xl font-bold">부고·경사 작성</h1>
    <div className="flex gap-2" aria-label="경조사 유형">
      {NOTICE_TYPES.map((value) => <Button key={value} disabled={busy || !draft} variant={value === type ? "default" : "outline"} onClick={() => void move(`/b/write/${value}`)}>{NOTICE_LABELS[value]}</Button>)}
    </div>
    <p className="text-sm text-muted-foreground">알고 있는 내용이나 공개 안내 링크를 짧게 적어 주세요. 부족한 정보만 여쭤보고, 확인한 미리보기로 게시합니다. 관리자는 대리 등록할 동문의 이름과 학번을 함께 적어 주세요.</p>
    {error && <p role="alert" className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>}
    {!draft ? <div>{!error ? <LoadingSpinner /> : <Button onClick={() => window.location.reload()}>초안 다시 불러오기</Button>}</div> : <>
      <label className="block space-y-2"><span className="font-medium">전할 내용</span>
        <Textarea rows={7} maxLength={20000} value={text} disabled={busy} onChange={(event) => edit(event.target.value)} placeholder="예: 제 부친상입니다. 아래 부고 링크를 참고해 주세요." />
      </label>
      <div className="flex justify-between gap-3 text-sm text-muted-foreground">
        <span role="status">{previewCurrent ? "초안 저장됨" : error ? "변경 내용이 저장되지 않았습니다" : "변경 내용 저장 중"}</span>
        <button type="button" disabled={busy} className="underline" onClick={() => void remove()}>초안 삭제</button>
      </div>
      <p className="text-xs text-muted-foreground">자연어 해석이 필요한 경우 입력 내용과 공개 링크의 필요한 정보가 OpenAI로 전달됩니다.</p>
      <Button disabled={busy || !text.trim()} onClick={() => void generate()}>{busy ? "처리 중…" : "미리보기 작성"}</Button>
      {previewCurrent && draft.eventData.sources.filter((source) => source.status !== "fetched").map((source) => <p className="text-sm" key={source.url}>{source.message || "링크를 읽지 못했습니다. 필요한 내용을 직접 적어 주세요."}</p>)}
      {previewCurrent && draft.eventData.questions.length > 0 && <section className="rounded-lg border p-4 space-y-3" aria-label="추가 정보">
        <h2 className="font-semibold">이 내용만 더 알려주세요</h2>
        <ul className="list-disc pl-5 space-y-1">{draft.eventData.questions.map((question, index) => <li key={index}>{question}</li>)}</ul>
      </section>}
      {previewCurrent && draft.content && <section className="rounded-lg border bg-white p-4 space-y-4" aria-label="게시 미리보기">
        <h2 className="font-semibold">{draft.title}</h2><PostBody content={draft.content} />
        <label className="flex gap-2 text-sm items-start"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />내용과 연락처·계좌를 확인했습니다.</label>
        <Button disabled={busy || !confirmed || !!answer.trim()} onClick={() => void publish()}>확인한 내용 게시</Button>
      </section>}
      {previewCurrent && (draft.content || draft.eventData.questions.length > 0) && <div className="space-y-2">
        <label className="block space-y-2"><span className="font-medium">추가 답변 또는 정정</span><Textarea value={answer} maxLength={20000 - text.length} disabled={busy} onChange={(event) => { setAnswer(event.target.value); setConfirmed(false); }} placeholder="필요한 내용만 짧게 적어 주세요." /></label>
        <Button variant="outline" disabled={busy || !answer.trim() || text.length + answer.length + 12 > 20000} onClick={() => { edit(`${text}\n\n추가 답변·정정: ${answer.trim()}`); setAnswer(""); void generate(); }}>반영하여 다시 작성</Button>
      </div>}
    </>}
  </main>;
}
