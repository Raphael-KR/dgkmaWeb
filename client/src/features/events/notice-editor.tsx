import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import type { Post, NoticeEditPreview } from "@shared/contracts";
import { PostBody } from "@/components/post-body";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { postRequest } from "@/lib/post-management";

export default function NoticeEditor({ post, onSaved }: { post: Post; onSaved: () => Promise<void> }) {
  const [, navigate] = useLocation();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<NoticeEditPreview>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (text) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [text]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "요청에 실패했습니다."); }
    finally { setBusy(false); }
  };
  return <div className="grid gap-5 lg:grid-cols-2">
    <section className="space-y-4 rounded-xl border bg-white p-4 md:p-6">
      <details><summary className="cursor-pointer font-medium">현재 게시글 보기</summary><h2 className="my-3 font-bold">{post.title}</h2><PostBody content={post.content} /></details>
      <label className="block space-y-2"><span className="font-medium">수정할 내용</span><Textarea value={text} rows={8} maxLength={20000} disabled={busy} onChange={event => { setText(event.target.value); setPreview(undefined); setConfirmed(false); }} placeholder="바꿀 내용과 필요한 공개 링크만 적어 주세요. 추가 질문이 나오면 답변을 여기에 덧붙여 주세요." /></label>
      <p className="text-xs text-muted-foreground">기존 사실과 정정 내용을 함께 해석합니다. 필요한 정보는 OpenAI로 전달되며, 저장 전에는 기존 게시글을 바꾸지 않습니다. 정정 내용은 자동저장되지 않습니다.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !text.trim()} onClick={() => void run(async () => { setConfirmed(false); setPreview(await postRequest("POST", `/api/posts/notices/${post.id}/edit-preview`, { revision: post.revision, sourceText: text })); })}>{busy ? "처리 중…" : "수정 미리보기"}</Button>
        <Button variant="outline" disabled={busy} onClick={() => { if (!text || window.confirm("정정 내용을 저장하지 않고 돌아갈까요?")) navigate(`/p/${post.id}`); }}>취소</Button>
      </div>
      {preview?.sources.filter(source => source.status !== "fetched").map(source => <p key={source.url} className="text-sm">{source.message || "링크를 읽지 못했습니다. 필요한 내용을 직접 적어 주세요."}</p>)}
      {!!preview?.questions.length && <div className="space-y-2"><h2 className="font-semibold">이 내용만 더 알려주세요</h2><ul className="list-disc space-y-1 pl-5">{preview.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></div>}
    </section>
    <section className="space-y-4 rounded-xl border bg-white p-4 md:p-6">
      <h2 className="font-semibold">수정 미리보기</h2>
      {preview?.previewToken ? <><h3 className="font-bold">{preview.title}</h3><PostBody content={preview.content} />
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />수정 내용과 연락처·계좌를 확인했습니다.</label>
        <Button disabled={busy || !confirmed} onClick={() => void run(async () => { await postRequest("PATCH", `/api/posts/notices/${post.id}/edit`, { previewToken: preview.previewToken }); setText(""); await onSaved(); })}>확인한 내용으로 수정</Button>
      </> : <p className="text-sm text-muted-foreground">정정 내용을 입력하고 미리보기를 작성해 주세요.</p>}
    </section>
  </div>;
}
