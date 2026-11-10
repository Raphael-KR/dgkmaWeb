import { useState, type FormEvent } from "react";
import {
  ADMIN_STATISTICS_MAX_DAYS,
  adminStatisticsPeriodSchema,
  recentStatisticsPeriod,
  type AdminStatisticsPeriod,
} from "@shared/contracts/admin-statistics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  period: AdminStatisticsPeriod;
  onApply: (period: AdminStatisticsPeriod) => void;
  busy: boolean;
};

export function StatisticsPeriodForm({ period, onApply, busy }: Props) {
  const [draft, setDraft] = useState(period);
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = adminStatisticsPeriodSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError("");
    onApply(parsed.data);
  }

  function selectRecent(days: number) {
    const next = recentStatisticsPeriod(days);
    setDraft(next);
    setError("");
    onApply(next);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3" aria-label="게시글 집계 기간">
      <div className="flex flex-wrap gap-2" aria-label="최근 기간 선택">
        {[7, 30, 90].map((days) => (
          <Button
            key={days}
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => selectRecent(days)}
          >
            최근 {days}일
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="statistics-from">시작일</Label>
          <Input
            id="statistics-from"
            type="date"
            value={draft.from}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            aria-describedby="statistics-period-help statistics-period-error"
            aria-invalid={!!error}
            required
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="statistics-to">종료일</Label>
          <Input
            id="statistics-to"
            type="date"
            value={draft.to}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            aria-describedby="statistics-period-help statistics-period-error"
            aria-invalid={!!error}
            required
          />
        </div>
        <Button type="submit" disabled={busy}>
          조회
        </Button>
      </div>
      <p id="statistics-period-help" className="text-sm text-muted-foreground">
        한국시간 기준, 시작일과 종료일을 포함합니다. 최대 {ADMIN_STATISTICS_MAX_DAYS}일을 선택할 수
        있습니다.
      </p>
      <p
        id="statistics-period-error"
        role={error ? "alert" : undefined}
        className="text-sm text-destructive"
      >
        {error}
      </p>
    </form>
  );
}
