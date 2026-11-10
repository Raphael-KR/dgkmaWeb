import type { AdminStatistics, PublicationCounts } from "@shared/contracts/admin-statistics";

type CountRow = PublicationCounts & { key: string; label: string };

function CountsTable({ caption, rows }: { caption: string; rows: CountRow[] }) {
  return (
    <div className="max-h-96 overflow-auto rounded-md border">
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-muted text-muted-foreground">
          <tr>
            <th scope="col" className="p-3 text-left">
              {caption}
            </th>
            <th scope="col" className="p-3 text-right">
              전체
            </th>
            <th scope="col" className="p-3 text-right">
              표시
            </th>
            <th scope="col" className="p-3 text-right">
              가림
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t">
              <th scope="row" className="p-3 text-left font-normal">
                {row.label}
              </th>
              <td className="p-3 text-right">{row.total.toLocaleString("ko-KR")}</td>
              <td className="p-3 text-right">{(row.total - row.hidden).toLocaleString("ko-KR")}</td>
              <td className="p-3 text-right">{row.hidden.toLocaleString("ko-KR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatisticsPostBreakdown({ posts }: { posts: AdminStatistics["posts"] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="min-w-0 space-y-3" aria-labelledby="statistics-categories">
        <h3 id="statistics-categories" className="font-semibold">
          분류별 게시글
        </h3>
        {posts.byCategory.length === 0 ? (
          <p className="text-sm text-muted-foreground">선택 기간에 발행된 게시글이 없습니다.</p>
        ) : (
          <CountsTable
            caption="분류"
            rows={posts.byCategory.map((row) => ({
              ...row,
              key: row.categoryId === null ? "uncategorized" : String(row.categoryId),
            }))}
          />
        )}
      </section>
      <section className="min-w-0 space-y-3" aria-labelledby="statistics-days">
        <h3 id="statistics-days" className="font-semibold">
          일별 게시글
        </h3>
        <CountsTable
          caption="발행일"
          rows={posts.byDay.map((row) => ({ ...row, key: row.date, label: row.date }))}
        />
      </section>
    </div>
  );
}
