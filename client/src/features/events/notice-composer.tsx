import { postDocumentText } from "@shared/contracts/post-document";
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
  return <div className="member-container space-y-5 md:space-y-6">
    <Button variant="ghost" disabled={busy} onClick={() => void move("/b")}>← 게시판</Button>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-bold md:text-3xl">부고·경사 작성</h1>
      <div className="flex flex-wrap gap-2" aria-label="경조사 유형">
        {NOTICE_TYPES.map((value) => <Button key={value} disabled={busy || !draft} aria-pressed={value === type} variant={value === type ? "default" : "outline"} onClick={() => void move(`/b/write/${value}`)}>{NOTICE_LABELS[value]}</Button>)}
      </div>
    </div>
    <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">알고 있는 내용이나 공개 안내 링크를 짧게 적어 주세요. 부족한 정보만 여쭤보고, 확인한 미리보기로 게시합니다. 관리자는 대리 등록할 동문의 이름과 학번을 함께 적어 주세요.</p>
    {error && <p role="alert" className="whitespace-pre-wrap text-sm text-red-700 [overflow-wrap:anywhere]">{error}</p>}
    {!draft ? <div>{!error ? <LoadingSpinner /> : <Button onClick={() => window.location.reload()}>초안 다시 불러오기</Button>}</div> :
      <div className="grid grid-cols-1 items-start gap-5 md:gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-5 rounded-xl border bg-white p-4 md:p-6">
          <label className="block space-y-2"><span className="font-semibold">전할 내용</span>
            <Textarea rows={7} className="md:min-h-64 md:text-base" maxLength={20000} value={text} disabled={busy} onChange={(event) => edit(event.target.value)} placeholder="알고 있는 경조사 내용과 공개 안내 링크를 적어 주세요." />
          </label>
          <div className="flex flex-wrap justify-between gap-3 text-sm text-muted-foreground">
            <span role="status">{previewCurrent ? "초안 저장됨" : error ? "변경 내용이 저장되지 않았습니다" : "변경 내용 저장 중"}</span>
            <button type="button" disabled={busy} className="underline" onClick={() => void remove()}>초안 삭제</button>
          </div>
          <p className="text-xs text-muted-foreground">자연어 해석이 필요한 경우 입력 내용과 공개 링크의 필요한 정보가 OpenAI로 전달됩니다.</p>
          <Button className="w-full md:w-auto" disabled={busy || !text.trim()} onClick={() => void generate()}>{busy ? "처리 중…" : "미리보기 작성"}</Button>
          {previewCurrent && draft.eventData.sources.filter((source) => source.status !== "fetched").map((source) => <p className="text-sm [overflow-wrap:anywhere]" key={source.url}>{source.message || "링크를 읽지 못했습니다. 필요한 내용을 직접 적어 주세요."}</p>)}
          {previewCurrent && draft.eventData.questions.length > 0 && <section className="space-y-3 rounded-lg border p-4" aria-label="추가 정보">
            <h2 className="font-semibold">이 내용만 더 알려주세요</h2>
            <ul className="list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">{draft.eventData.questions.map((question, index) => <li key={index}>{question}</li>)}</ul>
          </section>}
          {previewCurrent && (postDocumentText(draft.content) || draft.eventData.questions.length > 0) && <div className="space-y-2 border-t pt-5">
            <label className="block space-y-2"><span className="font-medium">추가 답변 또는 정정</span><Textarea value={answer} maxLength={20000 - text.length} disabled={busy} onChange={(event) => { setAnswer(event.target.value); setConfirmed(false); }} placeholder="필요한 내용만 짧게 적어 주세요." /></label>
            <Button variant="outline" disabled={busy || !answer.trim() || text.length + answer.length + 12 > 20000} onClick={() => { edit(`${text}\n\n추가 답변·정정: ${answer.trim()}`); setAnswer(""); void generate(); }}>반영하여 다시 작성</Button>
          </div>}
        </div>
        <section className="min-w-0 space-y-5 rounded-xl border bg-white p-4 md:p-6" aria-labelledby="notice-preview-title">
          <h2 id="notice-preview-title" className="border-b pb-4 text-lg font-semibold">게시 미리보기</h2>
          {previewCurrent && postDocumentText(draft.content) ? <>
            <h3 className="break-words text-lg font-bold md:text-xl">{draft.title}</h3>
            <PostBody content={draft.content} className="md:text-base" />
            <div className="space-y-4 border-t pt-5">
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />내용과 연락처·계좌를 확인했습니다.</label>
              <Button className="w-full md:w-auto" disabled={busy || !confirmed || !!answer.trim()} onClick={() => void publish()}>확인한 내용 게시</Button>
            </div>
          </> : <p className="py-8 text-center text-sm leading-relaxed text-muted-foreground md:py-16">전할 내용을 입력하고 ‘미리보기 작성’을 누르면<br />게시할 글을 이곳에서 확인할 수 있습니다.</p>}
        </section>
      </div>}
  </div>;
}
