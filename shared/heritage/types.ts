export interface HeritagePerson {
  name: string;
  admissionYear?: number;
  graduationClass?: number;
}

export interface President extends HeritagePerson {
  term: number;
  startYear: number;
  endYear: number;
}

export interface Officer extends HeritagePerson {
  title: string;
  subtitle?: string;
  photo?: string;
}

export interface OfficerTerm {
  term: number;
  groups: { id: string; title: string; members: Officer[] }[];
}

export interface HeritageSource {
  label: string;
  url: string;
}

export interface Donation {
  donor?: string;
  purpose?: string;
  amountWon: number;
  status: string;
}

export interface HistoryEntry {
  id: string;
  /** YYYY, YYYY-MM or YYYY-MM-DD: retain the source's date precision. */
  date: string;
  title: string;
  description?: string;
  highlight?: boolean;
  presidentTerm?: number;
  donations?: Donation[];
  albumIds?: string[];
  documentIds?: string[];
  sources?: HeritageSource[];
}

export interface Award {
  id: string;
  date: string;
  title: string;
  issuer: string;
  recipient: HeritagePerson;
  citation?: string;
  albumIds?: string[];
}

export interface HeritageAlbum {
  id: string;
  date: string;
  title: string;
  description?: string;
  coverPhotoId: string;
  photoIds: string[];
}

export interface HeritagePhoto {
  id: string;
  src: string;
  caption: string;
  credit?: string;
}

export interface HeritageDocument {
  id: string;
  title: string;
  src: string;
}
