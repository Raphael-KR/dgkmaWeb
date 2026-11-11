import { Home, Users, User, Info, MessageSquare } from "lucide-react";
import { HERITAGE_PAGES } from "@shared/heritage/navigation";

export type PublicNavItem = {
  path: string;
  label: string;
  gated?: boolean;
  children?: { path: string; label: string }[];
};

export const publicNavItems: PublicNavItem[] = [
  {
    path: "/about",
    label: "동문회",
    children: [
      { path: "/about/executives", label: "임원명단" },
      { path: "/about/bylaws", label: "회칙" },
      { path: "/about/bylaws/regulations", label: "규정" },
      { path: "/about/join", label: "회원가입" },
      { path: "/about/dues", label: "회비" },
      { path: "/about/condolence", label: "경조사" },
    ],
  },
  {
    path: HERITAGE_PAGES.timeline.path,
    label: "역사관",
    children: Object.values(HERITAGE_PAGES).map(({ path, label }) => ({ path, label })),
  },
  { path: "/b", label: "공지", gated: true },
];

export function isPublicNavActive(location: string, item: PublicNavItem) {
  if (item.path === "/about" && location === "/") return true;
  return location === item.path || !!item.children?.some((child) => child.path === location);
}

export const memberNavItems = [
  { path: "/", icon: Home, label: "홈", gated: false },
  { path: "/about", icon: Info, label: "동문회", gated: false },
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
