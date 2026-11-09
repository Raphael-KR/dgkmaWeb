import { Home, Users, User, Info, MessageSquare } from "lucide-react";

export const memberNavItems = [
  { path: "/", icon: Home, label: "홈", gated: false },
  { path: "/heritage", icon: Info, label: "동문회", gated: true },
  { path: "/b", icon: MessageSquare, label: "게시판", gated: true },
  { path: "/directory", icon: Users, label: "명부", gated: true },
  { path: "/profile", icon: User, label: "내정보", gated: true },
];

export function isMemberNavActive(location: string, path: string) {
  if (path === "/b") {
    return location === "/b" || location.startsWith("/b/") || location.startsWith("/p/") || location.startsWith("/post/");
  }
  return location === path;
}
