import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/features/auth";
import { LogOut, X } from "lucide-react";
import { SiteBrand } from "@/components/site-brand";
import { adminNavItem, isMemberNavActive, memberNavItems } from "./nav-items";

interface NavigationProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export default function Navigation({ isOpen, setIsOpen }: NavigationProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const filteredItems = [
    ...memberNavItems,
    ...(user?.isAdmin ? [adminNavItem] : []),
  ].filter((item) => !item.gated || user);

  const handleLogout = async () => {
    await logout();
    setIsOpen(false);
  };

  return (
    <>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Side Menu */}
      <div className={`fixed top-0 left-0 h-full w-80 max-w-[90vw] bg-white shadow-lg z-50 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
        <div className="flex flex-col h-full">
          <div className="site-brand-surface p-4">
            <div className="flex items-center gap-2">
              <SiteBrand onClick={() => setIsOpen(false)} />
              <Button variant="onBrand" size="icon" className="shrink-0" onClick={() => setIsOpen(false)} aria-label="메뉴 닫기">
                <X size={20} />
              </Button>
            </div>
            {user && (
              <div className="mt-2 space-y-1">
                <p className="text-sm text-white/90 font-medium">
                  {user.name}님
                </p>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-xs border-white/40 text-white">
                    {user.graduationYear}년 졸업
                  </Badge>
                  {user.isAdmin && (
                    <Badge className="text-xs bg-red-100 text-red-800">
                      관리자
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Navigation Items */}
          <div className="flex-1 py-4">
            <nav className="space-y-2">
              {filteredItems.map((item) => {
                const isActive = isMemberNavActive(location, item.path);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className="site-menu-link flex items-center gap-3"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setIsOpen(false)}
                  >
                    <Icon size={20} aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Footer */}
          {user && (
            <>
              <Separator />
              <div className="p-4">
                <Button
                  variant="outline"
                  className="w-full justify-start text-red-600 border-red-200 hover:bg-red-50"
                  onClick={handleLogout}
                >
                  <LogOut size={16} className="mr-2" />
                  로그아웃
                </Button>
              </div>
            </>
          )}

          {/* Login prompt for non-authenticated users */}
          {!user && (
            <>
              <Separator />
              <div className="p-4">
                <Button variant="kakao" className="w-full" asChild>
                  <Link href="/login" onClick={() => setIsOpen(false)}>카카오 로그인</Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
