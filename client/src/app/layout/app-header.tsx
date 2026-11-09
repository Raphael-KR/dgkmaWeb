import { Search, Bell, LogOut, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/features/auth";
import { isMemberNavActive, memberNavItems } from "./nav-items";

export function AppHeader() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const handleNotificationClick = () => {
    setLocation("/");
    setTimeout(() => {
      const recentPostsSection = document.getElementById("recent-posts-section");
      if (recentPostsSection) {
        recentPostsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  };

  return (
    <header className="bg-white shadow-sm sticky top-0 z-30">
      <div className="mx-auto max-w-md px-4 py-3 md:max-w-7xl md:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 lg:flex-nowrap">
          <button
            onClick={() => setLocation("/")}
            className="flex min-w-0 flex-shrink items-center space-x-2 lg:shrink-0"
            aria-label="동국한의동문회 홈"
          >
            <div className="w-8 h-8 kakao rounded-full flex items-center justify-center flex-shrink-0">
              <GraduationCap className="kakao-brown" size={16} />
            </div>
            <span className="text-sm sm:text-base font-bold kakao-brown truncate">동국한의동문회</span>
          </button>

          <div className="flex shrink-0 items-center gap-1 lg:order-3">
            {user && (
              <span className="hidden sm:inline text-xs text-gray-600 mr-1 max-w-[7rem] truncate">
                {user.name}님
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="p-2 text-gray-600 hover:text-kakao-brown"
              onClick={() => setLocation("/search")}
              aria-label="검색"
            >
              <Search size={18} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="p-2 text-gray-600 hover:text-kakao-brown relative"
              onClick={handleNotificationClick}
              aria-label="알림"
            >
              <Bell size={18} />
              <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></div>
            </Button>
            {user && (
              <Button
                variant="ghost"
                size="sm"
                className="p-2 text-gray-600 hover:text-red-600"
                onClick={() => logout()}
                aria-label="로그아웃"
                title="로그아웃"
              >
                <LogOut size={18} />
              </Button>
            )}
          </div>

          <nav aria-label="회원 메뉴" className="hidden w-full items-center gap-1 border-t border-gray-100 pt-2 md:flex lg:order-2 lg:w-auto lg:flex-1 lg:justify-center lg:border-0 lg:pt-0">
            {memberNavItems.map((item) => {
              const active = isMemberNavActive(location, item.path);
              const Icon = item.icon;
              return (
                <Link key={item.path} href={item.path} aria-current={active ? "page" : undefined}
                  className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex-none ${active ? "bg-orange-50 text-kakao-orange" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}>
                  <Icon size={17} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
