import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth, LoginModal } from "@/features/auth";
import { isMemberNavActive, memberNavItems } from "./nav-items";

export function BottomNavigation() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  // On public/non-logged context, theme the bottom nav with the public dark-green/gold tones.
  const usePublicTheme = !user;

  const handleClick = (item: typeof memberNavItems[number]) => {
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
        aria-label="하단 메뉴"
        className={`fixed bottom-0 left-0 right-0 border-t z-40 md:hidden ${
          usePublicTheme ? "theme-public tp-bg-green-dark border-black/30" : "bg-white border-gray-200"
        }`}
      >
        <div className="max-w-md mx-auto">
          <div className="flex">
            {memberNavItems.map((item) => {
              const isActive = isMemberNavActive(location, item.path);
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
                  aria-current={isActive ? "page" : undefined}
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
