import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { QueryError } from "@/components/query-error";
import { ADMIN_STATISTICS_TIME_ZONE } from "@shared/contracts/admin-statistics";
import { useAdminStatistics } from "./use-admin-statistics";
import { StatisticsPeriodForm } from "./statistics-period-form";
import { StatisticsPostBreakdown } from "./statistics-post-breakdown";

function Metric({
  label,
  value,
  unit,
  description,
}: {
  label: string;
  value: number;
  unit: string;
  description?: string;
}) {
  return (
    <div className="rounded-md border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold tabular-nums">
        {value.toLocaleString("ko-KR")}
        <span className="ml-1 text-sm font-normal">{unit}</span>
      </dd>
      {description && <dd className="mt-2 text-sm text-muted-foreground">{description}</dd>}
    </div>
  );
}

export function StatisticsPanel() {
  const { period, applyPeriod, query } = useAdminStatistics();
  const data = query.data;

  return (
    <div className="space-y-6" aria-busy={query.isFetching}>
      <Card>
        <CardHeader>
          <CardTitle>게시글 집계 기간</CardTitle>
          <CardDescription>
            기간 선택은 게시글에만 적용됩니다. 회원과 명부는 현재 현황입니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatisticsPeriodForm period={period} onApply={applyPeriod} busy={query.isFetching} />
        </CardContent>
      </Card>

      {query.isError ? (
        <QueryError
          message="관리자 통계를 불러오지 못했습니다. 다시 시도해주세요."
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.isPending ? (
        <div role="status" className="flex items-center justify-center gap-3 py-6">
          <LoadingSpinner size="small" />
          <span>통계를 불러오는 중입니다.</span>
        </div>
      ) : (
        data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                조회 시각:{" "}
                {new Date(data.asOf).toLocaleString("ko-KR", {
                  timeZone: ADMIN_STATISTICS_TIME_ZONE,
                })}{" "}
                (한국시간)
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                {query.isFetching ? "갱신 중…" : "새로고침"}
              </Button>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>회원·명부 현황</CardTitle>
                <CardDescription>
                  현재 회원과 마지막 동기화로 반영된 명부의 연결 상태입니다.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    label="회원"
                    value={data.snapshot.members.total}
                    unit="명"
                    description={`명부 연결 ${data.snapshot.members.linked.toLocaleString("ko-KR")}명 · 미연결 ${data.snapshot.members.unlinked.toLocaleString("ko-KR")}명`}
                  />
                  <Metric label="가입 대기" value={data.snapshot.pendingRegistrations} unit="건" />
                  <Metric label="동문 명부" value={data.snapshot.alumni.total} unit="건" />
                  <Metric
                    label="회원과 연결된 명부"
                    value={data.snapshot.alumni.linked}
                    unit="건"
                    description={`미연결 명부 ${data.snapshot.alumni.unlinked.toLocaleString("ko-KR")}건`}
                  />
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>기간별 게시글 현황</CardTitle>
                <CardDescription>
                  {data.period.from} ~ {data.period.to} (한국시간 발행일 기준)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <dl className="grid gap-3 sm:grid-cols-3">
                  <Metric label="발행 글 전체" value={data.posts.total} unit="건" />
                  <Metric label="표시 중" value={data.posts.total - data.posts.hidden} unit="건" />
                  <Metric label="가림" value={data.posts.hidden} unit="건" />
                </dl>
                <StatisticsPostBreakdown posts={data.posts} />
                <p className="text-sm text-muted-foreground">
                  초안과 삭제된 글은 제외합니다. 발행일이 없으면 작성일을 사용하며, 분류와 가림
                  상태는 조회 시점 기준입니다.
                </p>
                {data.snapshot.undatedPosts > 0 && (
                  <p role="status" className="text-sm text-muted-foreground">
                    발행일과 작성일이 모두 없는 글{" "}
                    {data.snapshot.undatedPosts.toLocaleString("ko-KR")}건은 기간 집계에서
                    제외했습니다.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )
      )}
    </div>
  );
}
