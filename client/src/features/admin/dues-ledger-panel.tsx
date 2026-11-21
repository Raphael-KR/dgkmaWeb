import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_DUES_LEDGER_PATH, type DuesLedgerReport } from "@shared/contracts/admin-dues-ledger";
import { QueryError } from "@/components/query-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const won = new Intl.NumberFormat("ko-KR");

function LedgerTable({
  caption,
  columns,
  children,
  totals,
}: {
  caption: string;
  columns: string[];
  children: ReactNode;
  totals?: number[];
}) {
  return (
    <div className="max-h-96 overflow-auto rounded-md border">
      <table className="w-full whitespace-nowrap text-right text-sm tabular-nums [&_td]:p-2 [&_th]:p-2 [&_th:first-child]:text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-muted text-muted-foreground">
          <tr>
            {columns.map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
        {totals && (
          <tfoot className="border-t font-medium">
            <tr>
              <th scope="row">전체 합계</th>
              {totals.map((amount, index) => (
                <td key={columns[index + 1]}>{won.format(amount)}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function DuesLedgerPanel() {
  const query = useQuery<DuesLedgerReport>({
    queryKey: [ADMIN_DUES_LEDGER_PATH],
    staleTime: 0,
    gcTime: 0,
  });
  if (query.isError) {
    return (
      <QueryError
        message="회비수입 집계를 불러오지 못했습니다."
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  if (query.isPending) {
    return (
      <div role="status" className="flex items-center justify-center gap-3 py-6">
        <LoadingSpinner size="small" />
        <span>회비수입을 불러오는 중입니다.</span>
      </div>
    );
  }
  const report = query.data;
  if (report.status === "awaiting_schema" || report.years.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>회비수입</CardTitle>
        </CardHeader>
        <CardContent>
          {report.status === "awaiting_schema"
            ? "회비수입원장 DB 적용 대기 중입니다."
            : "이관된 회비수입이 0건입니다."}
        </CardContent>
      </Card>
    );
  }

  const yearAmounts = report.years.map(({ amount }) => amount);
  const totalAmount = yearAmounts.reduce((sum, amount) => sum + amount, 0);
  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>연도별 회비 납부 내역</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.years.map(({ year, amount, count, payers }, index) => (
            <details key={year} open={index === 0}>
              <summary className="cursor-pointer py-2 font-medium">
                {year}년 · {count.toLocaleString("ko-KR")}건 · {won.format(amount)}원
              </summary>
              <LedgerTable
                caption={`${year}년도 납부자별 집계`}
                columns={["납부자", "건수", "납부액(원)"]}
              >
                {payers.map((payer) => (
                  <tr key={payer.label}>
                    <th scope="row" className="font-normal">
                      {payer.label}
                    </th>
                    <td>{payer.count.toLocaleString("ko-KR")}</td>
                    <td>{won.format(payer.amount)}</td>
                  </tr>
                ))}
              </LedgerTable>
            </details>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>회원별 연간 회비 납부 내역</CardTitle>
        </CardHeader>
        <CardContent>
          <LedgerTable
            caption="회원별·연도별 납부액(원)"
            columns={["회원", ...report.years.map(({ year }) => `${year}년`), "합계(원)"]}
            totals={[...yearAmounts, totalAmount]}
          >
            {report.members.map((member, index) => (
              <tr key={index}>
                <th scope="row" className="font-normal">
                  {member.label}
                </th>
                {report.years.map(({ year }) => (
                  <td key={year}>{won.format(member.amounts[year] ?? 0)}</td>
                ))}
                <td>{won.format(member.total)}</td>
              </tr>
            ))}
          </LedgerTable>
        </CardContent>
      </Card>
    </div>
  );
}
