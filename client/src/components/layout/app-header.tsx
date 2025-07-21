import { Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GraduationCap } from "lucide-react";

interface AppHeaderProps {
  onMenuClick?: () => void;
}

export function AppHeader({ onMenuClick }: AppHeaderProps = {}) {
  return (
    <header className="bg-white shadow-sm sticky top-0 z-50 safe-area-top">
      <div className="max-w-md mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-kakao-yellow rounded-full flex items-center justify-center">
              <GraduationCap className="text-kakao-brown" size={16} />
            </div>
            <h1 className="text-lg font-bold text-kakao-brown">동국한의동문회</h1>
          </div>
          <div className="flex items-center space-x-1">
            {/* Apple-style 44pt touch targets */}
            <Button 
              variant="ghost" 
              className="h-11 w-11 p-0 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="알림"
            >
              <div className="relative">
                <Bell size={20} className="text-gray-700" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </div>
            </Button>
            <Button 
              variant="ghost" 
              className="h-11 w-11 p-0 hover:bg-gray-100 rounded-full transition-colors" 
              onClick={onMenuClick}
              aria-label="메뉴"
            >
              <Menu size={20} className="text-gray-700" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
