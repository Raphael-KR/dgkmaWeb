import {
  Home,
  Users,
  User,
  Info,
  MessageSquare,
  Image,
  Megaphone,
  Award,
  FileText,
  UserPlus,
  Wallet,
  Heart,
  type LucideIcon,
} from "lucide-react";
import { HERITAGE_PAGES } from "@shared/heritage/navigation";

export type PublicNavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  gated?: boolean;
  children?: { path: string; label: string }[];
};

const publicDestinations = {
  association: { path: "/about", label: "동문회", icon: Info },
  intro: { path: "/about/intro", label: "소개", icon: Info },
  heritage: { path: HERITAGE_PAGES.albums.path, label: "역사관", icon: Image },
  notices: { path: "/b", label: "공지", icon: Megaphone, gated: true },
};

export const publicNavItems: PublicNavItem[] = [
  {
    ...publicDestinations.association,
    children: [
      publicDestinations.intro,
      { path: "/about/executives", label: "임원명단" },
      { path: "/about/bylaws", label: "회칙" },
      { path: "/about/bylaws/regulations", label: "규정" },
      { path: "/about/join", label: "회원가입" },
      { path: "/about/dues", label: "회비" },
      { path: "/about/condolence", label: "경조사" },
    ],
  },
  {
    ...publicDestinations.heritage,
    children: Object.values(HERITAGE_PAGES).map(({ path, label }) => ({ path, label })),
  },
  publicDestinations.notices,
];

export const publicQuickLinks = [
  { ...publicDestinations.intro, title: "동문회 소개", desc: "설립 목적 · 사업 · 조직" },
  { path: "/about/presidents", icon: Award, title: "역대회장", desc: "동문회를 이끌어 온 발자취" },
  { ...publicDestinations.heritage, title: "역사관", desc: "활동 사진 · 역사 자료 · 주요 행사" },
  { path: "/about/bylaws", icon: FileText, title: "회칙", desc: "동문회 정관 및 규정" },
  { path: "/about/join", icon: UserPlus, title: "회원 가입", desc: "가입 안내 및 절차" },
  { path: "/about/dues", icon: Wallet, title: "2026 회비 안내", desc: "회비 납부 및 납부자 혜택" },
  { path: "/about/condolence", icon: Heart, title: "경조사 지원", desc: "문자 · 화환 · 근조기" },
  { ...publicDestinations.notices, title: "공지 & 소식", desc: "동문회 최근 소식" },
];

export function isPublicNavActive(location: string, item: PublicNavItem) {
  if (item.path === "/about" && location === "/") return true;
  return location === item.path || !!item.children?.some((child) => child.path === location);
}

export const memberNavItems = [
  { path: "/", icon: Home, label: "홈", gated: false },
  { ...publicDestinations.association, gated: false },
  { path: "/b", icon: MessageSquare, label: "게시판", gated: true },
  { path: "/directory", icon: Users, label: "명부", gated: true },
  { path: "/profile", icon: User, label: "내정보", gated: true },
];

export const memberHeaderNavItems = memberNavItems.filter(
  ({ path }) => path !== "/" && path !== "/profile",
);

export function isMemberNavActive(location: string, path: string) {
  if (path === "/about") {
    return location === "/about" || location.startsWith("/about/");
  }
  if (path === "/b") {
    return (
      location === "/b" ||
      location.startsWith("/b/") ||
      location.startsWith("/p/") ||
      location.startsWith("/post/")
    );
  }
  return location === path;
}
