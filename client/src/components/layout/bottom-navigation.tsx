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
  // On public/non-logged context, theme the bottom nav with the public dark-green/gold tones.
  const usePublicTheme = !user;

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
      <nav
        className={`fixed bottom-0 left-0 right-0 border-t z-40 md:hidden ${
          usePublicTheme ? "theme-public tp-bg-green-dark border-black/30" : "bg-white border-gray-200"
        }`}
      >
        <div className="max-w-md mx-auto">
          <div className="flex">
            {navItems.map((item) => {
              const isActive = location === item.path;
              const Icon = item.icon;
              const activeCls = usePublicTheme ? "tp-text-gold" : "text-kakao-brown";
              const idleCls = usePublicTheme ? "text-white/70 hover:text-white" : "text-gray-400 hover:text-gray-600";
              return (
                <Button
                  key={item.path}
                  variant="ghost"
                  className={`flex-1 py-3 px-2 flex-col space-y-1 h-auto hover:bg-transparent ${
                    isActive ? activeCls : idleCls
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
