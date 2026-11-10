import { NOTICE_SOURCE_TEXT_MAX_LENGTH } from "@shared/contracts/content-limits";
import { postDocumentText } from "@shared/contracts/post-document";
import type { NoticeDraft } from "@shared/contracts/notices";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PostBody } from "@/components/post-body";
import type { NoticeComposerController } from "./use-notice-composer";

type Props = { draft: NoticeDraft; controller: NoticeComposerController };
const CORRECTION_PREFIX = "\n\n추가 답변·정정: ";

export function NoticeDraftPanel({ draft, controller }: Props) {
  const {
    text,
    answer,
    busy,
    error,
    previewCurrent,
    edit,
    setAnswer,
    setConfirmed,
    remove,
    generate,
  } = controller;

  return (
    <div className="min-w-0 space-y-5 member-panel">
      <label className="block space-y-2">
        <span className="font-semibold">전할 내용</span>
        <Textarea
          rows={7}
          className="md:min-h-64 md:text-base"
          maxLength={NOTICE_SOURCE_TEXT_MAX_LENGTH}
          value={text}
          disabled={busy}
          onChange={(event) => edit(event.target.value)}
          placeholder="알고 있는 경조사 내용과 공개 안내 링크를 적어 주세요."
        />
      </label>
      <div className="flex flex-wrap justify-between gap-3 text-sm text-muted-foreground">
        <span role="status">
          {previewCurrent
            ? "초안 저장됨"
            : error
              ? "변경 내용이 저장되지 않았습니다"
              : "변경 내용 저장 중"}
        </span>
        <button type="button" disabled={busy} className="underline" onClick={() => void remove()}>
          초안 삭제
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        자연어 해석이 필요한 경우 입력 내용과 공개 링크의 필요한 정보가 OpenAI로 전달됩니다.
      </p>
      <Button
        className="w-full md:w-auto"
        disabled={busy || !text.trim()}
        onClick={() => void generate()}
      >
        {busy ? "처리 중…" : "미리보기 작성"}
      </Button>
      {previewCurrent &&
        draft.eventData.sources
          .filter((source) => source.status !== "fetched")
          .map((source) => (
            <p className="text-sm [overflow-wrap:anywhere]" key={source.url}>
              {source.message || "링크를 읽지 못했습니다. 필요한 내용을 직접 적어 주세요."}
            </p>
          ))}
      {previewCurrent && draft.eventData.questions.length > 0 && (
        <section className="space-y-3 rounded-lg border p-4" aria-label="추가 정보">
          <h2 className="font-semibold">이 내용만 더 알려주세요</h2>
          <ul className="list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
            {draft.eventData.questions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        </section>
      )}
      {previewCurrent &&
        (postDocumentText(draft.content) || draft.eventData.questions.length > 0) && (
          <div className="space-y-2 border-t pt-5">
            <label className="block space-y-2">
              <span className="font-medium">추가 답변 또는 정정</span>
              <Textarea
                value={answer}
                maxLength={NOTICE_SOURCE_TEXT_MAX_LENGTH - text.length}
                disabled={busy}
                onChange={(event) => {
                  setAnswer(event.target.value);
                  setConfirmed(false);
                }}
                placeholder="필요한 내용만 짧게 적어 주세요."
              />
            </label>
            <Button
              variant="outline"
              disabled={
                busy ||
                !answer.trim() ||
                text.length + answer.length + CORRECTION_PREFIX.length >
                  NOTICE_SOURCE_TEXT_MAX_LENGTH
              }
              onClick={() => {
                edit(`${text}${CORRECTION_PREFIX}${answer.trim()}`);
                setAnswer("");
                void generate();
              }}
            >
              반영하여 다시 작성
            </Button>
          </div>
        )}
    </div>
  );
}

export function NoticePreviewPanel({ draft, controller }: Props) {
  const { previewCurrent, confirmed, busy, answer, setConfirmed, publish } = controller;
  return (
    <section className="min-w-0 space-y-5 member-panel" aria-labelledby="notice-preview-title">
      <h2 id="notice-preview-title" className="border-b pb-4 text-lg font-semibold">
        게시 미리보기
      </h2>
      {previewCurrent && postDocumentText(draft.content) ? (
        <>
          <h3 className="break-words text-lg font-bold md:text-xl">{draft.title}</h3>
          <PostBody content={draft.content} className="md:text-base" />
          <div className="space-y-4 border-t pt-5">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmed}
                disabled={busy}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              내용과 연락처·계좌를 확인했습니다.
            </label>
            <Button
              className="w-full md:w-auto"
              disabled={busy || !confirmed || !!answer.trim()}
              onClick={() => void publish()}
            >
              확인한 내용 게시
            </Button>
          </div>
        </>
      ) : (
        <p className="py-8 text-center text-sm leading-relaxed text-muted-foreground md:py-16">
          전할 내용을 입력하고 ‘미리보기 작성’을 누르면
          <br />
          게시할 글을 이곳에서 확인할 수 있습니다.
        </p>
      )}
    </section>
  );
}
