import { useRoute } from "wouter";
import { NOTICE_LABELS, NOTICE_TYPES, type NoticeType } from "@shared/contracts/notices";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useSeo } from "@/lib/seo";
import { useNoticeComposer } from "./use-notice-composer";
import { NoticeDraftPanel, NoticePreviewPanel } from "./notice-composer-panels";

export default function NoticeComposerPage() {
  const [, params] = useRoute("/b/write/:type");
  const type = NOTICE_TYPES.find((value) => value === params?.type);
  // 유형마다 별도 초안 수명을 유지해 이전 유형의 요청 큐와 화면 상태를 섞지 않는다.
  return type ? (
    <Composer key={type} type={type} />
  ) : (
    <p className="p-8">지원하지 않는 경조사 유형입니다.</p>
  );
}

function Composer({ type }: { type: NoticeType }) {
  const controller = useNoticeComposer(type);
  const { draft, busy, error, move } = controller;
  useSeo({
    title: `${NOTICE_LABELS[type]} 작성`,
    description: "회원 경조사 작성",
    path: `/b/write/${type}`,
    noIndex: true,
  });

  return (
    <div className="member-container space-y-5 md:space-y-6">
      <Button variant="ghost" disabled={busy} onClick={() => void move("/b")}>
        ← 게시판
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold md:text-3xl">부고·경사 작성</h1>
        <div className="flex flex-wrap gap-2" aria-label="경조사 유형">
          {NOTICE_TYPES.map((value) => (
            <Button
              key={value}
              disabled={busy || !draft}
              aria-pressed={value === type}
              variant={value === type ? "default" : "outline"}
              onClick={() => void move(`/b/write/${value}`)}
            >
              {NOTICE_LABELS[value]}
            </Button>
          ))}
        </div>
      </div>
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        알고 있는 내용이나 공개 안내 링크를 짧게 적어 주세요. 부족한 정보만 여쭤보고, 확인한
        미리보기로 게시합니다. 관리자는 대리 등록할 동문의 이름과 학번을 함께 적어 주세요.
      </p>
      {error && (
        <p
          role="alert"
          className="whitespace-pre-wrap text-sm text-red-700 [overflow-wrap:anywhere]"
        >
          {error}
        </p>
      )}
      {!draft ? (
        <div>
          {!error ? (
            <LoadingSpinner />
          ) : (
            <Button onClick={() => window.location.reload()}>초안 다시 불러오기</Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 md:gap-6 lg:grid-cols-2">
          <NoticeDraftPanel draft={draft} controller={controller} />
          <NoticePreviewPanel draft={draft} controller={controller} />
        </div>
      )}
    </div>
  );
}
