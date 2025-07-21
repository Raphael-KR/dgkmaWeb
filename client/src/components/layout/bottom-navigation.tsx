import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Home, List, CreditCard, Users, User } from "lucide-react";

export function BottomNavigation() {
  const [location, setLocation] = useLocation();

  const navItems = [
    { path: "/", icon: Home, label: "홈" },
    { path: "/boards", icon: List, label: "게시판" },
    { path: "/payments", icon: CreditCard, label: "회비" },
    { path: "/directory", icon: Users, label: "동문록" },
    { path: "/profile", icon: User, label: "내정보" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-bottom">
      <div className="max-w-md mx-auto">
        <div className="flex">
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            
            return (
              <Button
                key={item.path}
                variant="ghost"
                className={`flex-1 py-2 px-2 flex-col space-y-1 h-16 min-h-[44px] transition-colors ${
                  isActive 
                    ? "text-kakao-brown bg-kakao-yellow/10" 
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
                onClick={() => setLocation(item.path)}
                aria-label={item.label}
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-xs font-medium ${isActive ? 'font-semibold' : ''}`}>
                  {item.label}
                </span>
              </Button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
