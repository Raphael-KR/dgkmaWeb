import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth, LoginModal } from "@/features/auth";
import { isMemberNavActive, memberNavItems } from "./nav-items";

export function BottomNavigation() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

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
        className="site-bottom-navigation site-brand-surface"
      >
        <div className="site-bottom-navigation__inner">
          {memberNavItems.map((item) => {
            const isActive = isMemberNavActive(location, item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                type="button"
                className="site-bottom-link"
                onClick={() => handleClick(item)}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={20} aria-hidden="true" />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            );
          })}
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
