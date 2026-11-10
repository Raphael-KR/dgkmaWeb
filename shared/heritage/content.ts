import presidentsData from "./presidents.json";
import timelineData from "./timeline.json";
import officersData from "./officers.json";
import awardsData from "./awards.json";
import albumsData from "./albums.json";
import mediaData from "./media.json";
import type {
  Award,
  HeritageAlbum,
  HeritageDocument,
  HeritagePhoto,
  HistoryEntry,
  OfficerTerm,
  President,
} from "./types";

export const presidents: President[] = presidentsData;
export const timeline: HistoryEntry[] = timelineData;
export const officerTerms: OfficerTerm[] = officersData.terms;
export const currentOfficerTerm = officersData.currentTerm;
export const awards: Award[] = awardsData;
export const albums: HeritageAlbum[] = albumsData;
export const photos: HeritagePhoto[] = mediaData.photos;
export const documents: HeritageDocument[] = mediaData.documents;

export function formatHeritageDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return [`${year}년`, month ? `${month}월` : undefined, day ? `${day}일` : undefined]
    .filter(Boolean)
    .join(" ");
}

export function heritageYear(date: string) {
  return Number(date.slice(0, 4));
}

export function groupHeritageByYear<T extends { date: string }>(entries: T[]) {
  const groups = new Map<number, T[]>();
  for (const entry of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    const year = heritageYear(entry.date);
    groups.set(year, [...(groups.get(year) ?? []), entry]);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a - b);
}
