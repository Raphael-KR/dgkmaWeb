import { Search, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useAuth } from "@/features/auth";
import { isMemberNavActive, memberHeaderNavItems } from "./nav-items";
import { HeaderLogoutButton, HeaderProfileLink } from "./header-actions";
import { SiteHeader } from "./site-header";
import { SiteNavLink } from "./site-nav-link";

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
          {user && <HeaderLogoutButton onLogout={() => logout()} />}
        </>
      }
      navigation={memberHeaderNavItems.map((item) => {
        const active = isMemberNavActive(location, item.path);
        return (
          <SiteNavLink
            key={item.path}
            href={item.path}
            icon={item.icon}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </SiteNavLink>
        );
      })}
    />
  );
}
