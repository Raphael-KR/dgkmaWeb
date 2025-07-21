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
          
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white">
            <img 
              src="/attached_assets/동국대학교한의과대학동문회%20로고_1753111575904.webp" 
              alt="동국대학교 한의과대학 동문회 로고"
              className="w-8 h-8 object-contain"
            />
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