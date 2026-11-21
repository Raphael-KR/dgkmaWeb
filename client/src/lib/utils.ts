import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const koreanDate = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul" });

export function formatJoinedDate(joinedAt: string | null): string {
  return joinedAt ? koreanDate.format(new Date(joinedAt)) : "기록 없음";
}
