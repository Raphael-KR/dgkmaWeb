import { z } from "zod";

export const ADMIN_STATISTICS_PATH = "/api/admin/statistics";
export const ADMIN_STATISTICS_TIME_ZONE = "Asia/Seoul";
export const ADMIN_STATISTICS_MAX_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식으로 입력해주세요.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      value >= "0001-01-01" &&
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "실제로 존재하는 날짜를 입력해주세요.");

export const adminStatisticsPeriodSchema = z
  .object({ from: calendarDateSchema, to: calendarDateSchema })
  .strict()
  .superRefine(({ from, to }, context) => {
    if (from > to) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "종료일은 시작일 이후여야 합니다.",
      });
    }
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
    if (days > ADMIN_STATISTICS_MAX_DAYS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: `한 번에 최대 ${ADMIN_STATISTICS_MAX_DAYS}일까지 조회할 수 있습니다.`,
      });
    }
  });

export type AdminStatisticsPeriod = z.infer<typeof adminStatisticsPeriodSchema>;

export function recentStatisticsPeriod(days = 30, now = new Date()): AdminStatisticsPeriod {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: ADMIN_STATISTICS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)!.value;
  const to = `${part("year")}-${part("month")}-${part("day")}`;
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * DAY_MS)
    .toISOString()
    .slice(0, 10);
  return { from, to };
}

export type PublicationCounts = { total: number; hidden: number };
export type PublicationDay = PublicationCounts & { date: string };
export type PublicationCategory = PublicationCounts & {
  categoryId: number | null;
  label: string;
};

export type AdminStatistics = {
  asOf: string;
  period: AdminStatisticsPeriod & { timeZone: typeof ADMIN_STATISTICS_TIME_ZONE };
  snapshot: {
    members: { total: number; linked: number; unlinked: number };
    pendingRegistrations: number;
    alumni: { total: number; linked: number; unlinked: number };
    undatedPosts: number;
  };
  posts: PublicationCounts & {
    byCategory: PublicationCategory[];
    byDay: PublicationDay[];
  };
};
