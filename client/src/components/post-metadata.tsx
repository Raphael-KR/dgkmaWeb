import type { Post } from "@shared/contracts";

const seoul = { timeZone: "Asia/Seoul" };
const originalDateFormats = {
  day: new Intl.DateTimeFormat("ko-KR", { ...seoul, dateStyle: "long" }),
  minute: new Intl.DateTimeFormat("ko-KR", { ...seoul, dateStyle: "long", timeStyle: "short" }),
};
// The HTML time value for a day-only source is its Korean calendar date.
const calendarDay = new Intl.DateTimeFormat("sv-SE", {
  ...seoul,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const localDay = new Intl.DateTimeFormat("ko-KR");
const localMinute = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short" });

export function PostDate({
  post,
  view = "list",
}: {
  post: Pick<Post, "importData" | "publishedAt" | "createdAt">;
  view?: "list" | "search" | "detail";
}) {
  const { importData, publishedAt, createdAt } = post;
  const nativeDate = view === "search" ? createdAt : (publishedAt ?? createdAt);
  const value = importData?.originalCreatedAt ?? nativeDate;
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const formatter = importData
    ? originalDateFormats[importData.timePrecision]
    : view === "detail"
      ? localMinute
      : localDay;
  const dateTime = importData?.timePrecision === "day" ? calendarDay.format(date) : value;
  return (
    <time className="text-xs text-gray-500" dateTime={dateTime}>
      {formatter.format(date)}
    </time>
  );
}

export function PostAuthor({ name }: { name: Post["authorName"] }) {
  return <span>작성자: {name?.trim() || "작성자 정보 없음"}</span>;
}
