import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Home, Users, User, Info, MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { LoginModal } from "@/components/auth/login-modal";

interface NavItem {
  path: string;
  icon: typeof Home;
  label: string;
  gated?: boolean;
}

const navItems: NavItem[] = [
  { path: "/", icon: Home, label: "홈" },
  { path: "/heritage", icon: Info, label: "동문회", gated: true },
  { path: "/b", icon: MessageSquare, label: "게시판", gated: true },
  { path: "/directory", icon: Users, label: "명부", gated: true },
  { path: "/profile", icon: User, label: "내정보", gated: true },
];

export function BottomNavigation() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  const handleClick = (item: NavItem) => {
    if (item.gated && !user) {
      setPendingTarget(item.path);
      setLoginOpen(true);
    } else {
      setLocation(item.path);
    }
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 md:hidden">
        <div className="max-w-md mx-auto">
          <div className="flex">
            {navItems.map((item) => {
              const isActive = location === item.path;
              const Icon = item.icon;
              return (
                <Button
                  key={item.path}
                  variant="ghost"
                  className={`flex-1 py-3 px-2 flex-col space-y-1 h-auto ${
                    isActive ? "text-kakao-brown" : "text-gray-400 hover:text-gray-600"
                  }`}
                  onClick={() => handleClick(item)}
                >
                  <Icon size={20} />
                  <span className="text-xs font-medium">{item.label}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </nav>
      <LoginModal
        open={loginOpen}
        onOpenChange={(o) => {
          setLoginOpen(o);
          if (!o) setPendingTarget(null);
        }}
        returnTo={pendingTarget || "/"}
      />
    </>
  );
}
