const KOREA_UTC_OFFSET_MS = 9 * 60 * 60 * 1000;

export function koreaCalendarYear(date: Date = new Date()): number {
  return new Date(date.getTime() + KOREA_UTC_OFFSET_MS).getUTCFullYear();
}
