import { LogOut, User } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { SiteNavLink } from "./site-nav-link";

export function HeaderProfileLink({ name }: { name: string }) {
  const [location] = useLocation();

  return (
    <SiteNavLink
      href="/profile"
      icon={User}
      className="hidden max-w-[8rem] md:flex"
      aria-label={`${name}님 내정보`}
      aria-current={location === "/profile" ? "page" : undefined}
      title="내정보"
    >
      <span className="truncate">{name}님</span>
    </SiteNavLink>
  );
}

export function HeaderLogoutButton({ onLogout }: { onLogout: () => void }) {
  return (
    <Button
      type="button"
      variant="onBrand"
      size="sm"
      className="p-2"
      onClick={onLogout}
      aria-label="로그아웃"
      title="로그아웃"
    >
      <LogOut size={18} aria-hidden="true" />
    </Button>
  );
}
