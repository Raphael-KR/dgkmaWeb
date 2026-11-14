import type { PostImportData } from "@shared/contracts/post-import";

export function PostSource({ data }: { data: PostImportData | null }) {
  if (!data) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-600">
      <span>
        출처: {data.platform === "daum-cafe" ? "다음카페" : "네이버 밴드"} ·{" "}
        {data.boardPath.join(" › ")}
      </span>
      <a
        href={data.url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4"
      >
        원문 보기
      </a>
    </div>
  );
}

export function PostImportNotice({ data }: { data: PostImportData | null }) {
  if (data?.platform !== "daum-cafe") return null;
  return (
    <aside className="mb-6 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
      <a
        href="https://cafe.daum.net/dkkmob"
        target="_blank"
        rel="noopener noreferrer"
        className="text-foreground underline underline-offset-4"
      >
        다음카페:동국대학교한의과대학총동창회
      </a>
      에서 이관되었습니다.
    </aside>
  );
}
