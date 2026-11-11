import { Search, List, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/features/auth";
import { isMemberNavActive, memberHeaderNavItems } from "./nav-items";
import { HeaderProfileLink } from "./header-profile-link";
import { SiteHeader } from "./site-header";

export function AppHeader() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const handleRecentPostsClick = () => {
    setLocation("/");
    setTimeout(() => {
      document
        .getElementById("recent-posts-section")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  return (
    <SiteHeader
      navigationLabel="회원 메뉴"
      actions={
        <>
          {user && <HeaderProfileLink name={user.name} />}
          <Button
            variant="onBrand"
            size="sm"
            className="p-2"
            onClick={() => setLocation("/search")}
            aria-label="검색"
          >
            <Search size={18} />
          </Button>
          <Button
            variant="onBrand"
            size="sm"
            className="p-2"
            onClick={handleRecentPostsClick}
            aria-label="최근 글"
            title="최근 글"
          >
            <List size={18} />
          </Button>
          {user && (
            <Button
              variant="onBrand"
              size="sm"
              className="p-2"
              onClick={() => logout()}
              aria-label="로그아웃"
              title="로그아웃"
            >
              <LogOut size={18} />
            </Button>
          )}
        </>
      }
      navigation={memberHeaderNavItems.map((item) => {
        const active = isMemberNavActive(location, item.path);
        const Icon = item.icon;
        return (
          <Link
            key={item.path}
            href={item.path}
            aria-current={active ? "page" : undefined}
            className="site-nav-link"
          >
            <Icon size={17} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    />
  );
}
