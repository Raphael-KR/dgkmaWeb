import { Search, Bell, LogOut, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export function AppHeader() {
  const [, setLocation] = useLocation();
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
      <div className="max-w-md mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center space-x-2 min-w-0 flex-shrink"
          >
            <div className="w-8 h-8 kakao rounded-full flex items-center justify-center flex-shrink-0">
              <GraduationCap className="kakao-brown" size={16} />
            </div>
            <h1 className="text-sm sm:text-base font-bold kakao-brown truncate">동국한의동문회</h1>
          </button>

          <div className="flex items-center gap-1 flex-shrink-0">
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
        </div>
      </div>
    </header>
  );
}
