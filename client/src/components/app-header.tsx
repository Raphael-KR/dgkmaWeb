import { Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppHeaderProps {
  onMenuClick: () => void;
}

export default function AppHeader({ onMenuClick }: AppHeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex items-center justify-between px-4 h-14">
        {/* Left side - Menu and Logo/title */}
        <div className="flex items-center space-x-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
          >
            <Menu size={20} className="text-gray-600" />
          </Button>
          
          <div className="w-8 h-8 bg-kakao-yellow rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-kakao-brown" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900">동국한의동문회</h1>
        </div>

        {/* Right side - Notification */}
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="relative"
          >
            <Bell size={20} className="text-gray-600" />
            {/* Notification dot */}
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></div>
          </Button>
        </div>
      </div>
    </header>
  );
}