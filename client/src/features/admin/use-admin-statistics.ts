import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ADMIN_STATISTICS_PATH,
  recentStatisticsPeriod,
  type AdminStatistics,
  type AdminStatisticsPeriod,
} from "@shared/contracts/admin-statistics";
import { apiRequest } from "@/lib/queryClient";

export function useAdminStatistics() {
  const [period, setPeriod] = useState(() => recentStatisticsPeriod());
  const query = useQuery<AdminStatistics>({
    queryKey: [ADMIN_STATISTICS_PATH, period.from, period.to],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams(period);
      const response = await apiRequest("GET", `${ADMIN_STATISTICS_PATH}?${params}`, undefined, {
        signal,
      });
      return response.json();
    },
    // Statistics are a current snapshot; revisit the tab to fetch fresh counts.
    staleTime: 0,
  });

  function applyPeriod(next: AdminStatisticsPeriod) {
    if (next.from === period.from && next.to === period.to) {
      void query.refetch();
    } else {
      setPeriod(next);
    }
  }

  return { period, applyPeriod, query };
}
