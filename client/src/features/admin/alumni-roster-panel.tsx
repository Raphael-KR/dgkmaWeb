import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/query-error";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export function AlumniRosterPanel() {
  const query = useQuery<{ registered: number }>({ queryKey: ["/api/admin/roster-count"] });
  return (
    <Card>
      <CardHeader>
        <CardTitle>동문 명부</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <QueryError
            message="명부 인원을 조회하지 못했습니다."
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : query.data ? (
          `등록 동문 ${query.data.registered.toLocaleString("ko-KR")}명`
        ) : (
          <LoadingSpinner />
        )}
      </CardContent>
    </Card>
  );
}
