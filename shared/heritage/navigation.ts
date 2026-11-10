import { SITE_NAME } from "../site";

export const HERITAGE_PAGES = {
  timeline: {
    path: "/about/heritage",
    label: "연혁",
    title: "동문회 연혁",
    description: `${SITE_NAME}의 창립과 주요 활동을 연도별로 기록합니다.`,
  },
  presidents: {
    path: "/about/presidents",
    label: "역대회장",
    title: "역대 동문회장",
    description: `${SITE_NAME} 역대 회장의 대수와 재임 기간을 안내합니다.`,
  },
  officers: {
    path: "/about/heritage/officers",
    label: "역대임원",
    title: "역대 동문회 임원",
    description: `${SITE_NAME}를 위해 봉사한 역대 임원진의 기록입니다.`,
  },
  awards: {
    path: "/about/heritage/awards",
    label: "수상자",
    title: "역대 동문회 수상자",
    description: "졸업생으로서 동문회·총동문회·모교에서 상을 받은 동문을 소개합니다.",
  },
  donations: {
    path: "/about/heritage/donations",
    label: "기부 내역",
    title: "역대 동문 기부 내역",
    description: "동문과 동문 단체의 기부·기탁·찬조 기록을 전합니다.",
  },
  albums: {
    path: "/about/heritage/albums",
    label: "사진첩",
    title: "사진첩",
    description: "사진으로 돌아보는 동문회의 활동과 역사입니다.",
  },
} as const;

export type HeritageSection = keyof typeof HERITAGE_PAGES;
export type HeritagePagePath = (typeof HERITAGE_PAGES)[HeritageSection]["path"];

export function heritageAlbumHref(id: string) {
  return `${HERITAGE_PAGES.albums.path}?${new URLSearchParams({ album: id })}`;
}

export function heritageEntryHref(id: string) {
  return `${HERITAGE_PAGES.timeline.path}#${encodeURIComponent(id)}`;
}
