import { Search, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GraduationCap } from "lucide-react";
import { useLocation } from "wouter";

export function AppHeader() {
  const [location, setLocation] = useLocation();

  const handleNotificationClick = () => {
    // 홈으로 이동하고 최근게시글 섹션으로 스크롤
    setLocation("/");
    setTimeout(() => {
      const recentPostsSection = document.getElementById("recent-posts-section");
      if (recentPostsSection) {
        recentPostsSection.scrollIntoView({ 
          behavior: "smooth",
          block: "start"
        });
      }
    }, 100);
  };

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-md mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 kakao rounded-full flex items-center justify-center">
              <GraduationCap className="kakao-brown" size={16} />
            </div>
            <h1 className="text-lg font-bold kakao-brown">동국한의동문회</h1>
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="p-2 text-gray-600 hover:text-kakao-brown"
              onClick={() => setLocation("/search")}
            >
              <Search size={20} />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="p-2 text-gray-600 hover:text-kakao-brown relative"
              onClick={handleNotificationClick}
            >
              <Bell size={20} />
              {/* Notification dot */}
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></div>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
