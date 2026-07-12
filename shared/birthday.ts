import KoreanLunarCalendar from "korean-lunar-calendar";

type Birthday = {
  birthday: string | null;
  birthdayType: string | null;
  isLeapMonth: boolean | null;
};

const KOREA_TIME_ZONE = "Asia/Seoul";

function koreaDateParts(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

export function isBirthdayToday(args: Birthday, now = new Date()): boolean {
  if (!/^\d{4}$/.test(args.birthday ?? "")) {
    return false;
  }

  const month = Number(args.birthday!.slice(0, 2));
  const day = Number(args.birthday!.slice(2, 4));
  const today = koreaDateParts(now);

  if (args.birthdayType === "SOLAR") {
    const date = new Date(Date.UTC(today.year, month - 1, day));
    const valid =
      date.getUTCFullYear() === today.year &&
      date.getUTCMonth() + 1 === month &&
      date.getUTCDate() === day;
    return valid && today.month === month && today.day === day;
  }

  if (args.birthdayType !== "LUNAR") {
    return false;
  }

  const calendar = new KoreanLunarCalendar();
  if (!calendar.setSolarDate(today.year, today.month, today.day)) {
    return false;
  }
  const lunar = calendar.getLunarCalendar();
  return (
    lunar.month === month &&
    lunar.day === day &&
    Boolean(lunar.intercalation) === Boolean(args.isLeapMonth)
  );
}
