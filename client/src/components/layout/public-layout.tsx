import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, GraduationCap, LogIn, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoginModal } from "@/components/auth/login-modal";
import { useAuth } from "@/hooks/use-auth";
import symbolLogo from "@assets/public-home/symbol-logo.svg";

const publicNav: { path: string; label: string; gated?: boolean }[] = [
  { path: "/", label: "홈" },
  { path: "/heritage", label: "소개", gated: true },
  { path: "/about/bylaws", label: "회칙" },
  { path: "/about/join", label: "회원가입" },
  { path: "/about/dues", label: "회비" },
  { path: "/about/condolence", label: "경조사" },
  { path: "/b", label: "공지", gated: true },
];

export function PublicLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  const handleNavClick = (e: React.MouseEvent, item: typeof publicNav[number]) => {
    if (item.gated && !user) {
      e.preventDefault();
      setPendingTarget(item.path);
      setLoginOpen(true);
      setDrawerOpen(false);
    } else {
      setDrawerOpen(false);
    }
  };

  return (
    <div className="theme-public min-h-screen flex flex-col">
      <header className="tp-bg-green-dark text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
            <img src={symbolLogo} alt="동국한의 로고" className="w-9 h-9 sm:w-10 sm:h-10 bg-white rounded-full p-1 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-xs tp-text-gold leading-tight">동국대학교 한의과대학</div>
              <div className="text-sm sm:text-base font-bold leading-tight truncate">동문회</div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 lg:gap-1">
            {publicNav.map((item) => {
              const active = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={(e) => handleNavClick(e, item)}
                  className={`px-2 lg:px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    active ? "tp-bg-gold tp-text-green-dark" : "text-white/90 hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            {user ? (
              <>
                <span className="text-sm text-white/90 max-w-[8rem] truncate flex items-center gap-1">
                  <User size={14} /> {user.name}님
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-transparent border-white/40 text-white hover:bg-white/10"
                  onClick={() => logout()}
                >
                  <LogOut size={14} className="mr-1" /> 로그아웃
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="bg-kakao-yellow text-kakao-brown hover:bg-yellow-400 font-bold"
                onClick={() => setLoginOpen(true)}
              >
                <LogIn size={16} className="mr-1" /> 카카오 로그인
              </Button>
            )}
          </div>

          <button
            className="md:hidden p-2 text-white"
            onClick={() => setDrawerOpen(true)}
            aria-label="메뉴 열기"
          >
            <Menu size={24} />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setDrawerOpen(false)} />
          <div className="fixed top-0 right-0 bottom-0 w-72 max-w-[80vw] bg-white z-50 shadow-xl flex flex-col">
            <div className="tp-bg-green-dark text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <GraduationCap size={20} className="flex-shrink-0" />
                <span className="font-bold truncate">{user ? `${user.name}님` : "동국한의동문회"}</span>
              </div>
              <button onClick={() => setDrawerOpen(false)} aria-label="닫기" className="p-1">
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 p-2 overflow-y-auto">
              {publicNav.map((item) => {
                const active = location === item.path;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={(e) => handleNavClick(e, item)}
                    className={`block px-4 py-3 rounded-md text-sm font-medium ${
                      active ? "tp-bg-gold tp-text-green-dark" : "tp-text-green hover:bg-gray-100"
                    }`}
                  >
                    {item.label}
                    {item.gated && !user && <span className="ml-2 text-xs text-gray-400">로그인 필요</span>}
                  </Link>
                );
              })}
            </nav>
            <div className="p-4 border-t">
              {user ? (
                <Button
                  variant="outline"
                  className="w-full text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => {
                    setDrawerOpen(false);
                    logout();
                  }}
                >
                  <LogOut size={16} className="mr-1" /> 로그아웃
                </Button>
              ) : (
                <Button
                  className="w-full bg-kakao-yellow text-kakao-brown hover:bg-yellow-400 font-bold"
                  onClick={() => {
                    setDrawerOpen(false);
                    setLoginOpen(true);
                  }}
                >
                  <LogIn size={16} className="mr-1" /> 카카오 로그인
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      <main className="flex-1 pb-16 md:pb-0">{children}</main>

      <footer className="tp-bg-green-dark text-white/80 py-8 px-4 mt-12">
        <div className="max-w-6xl mx-auto text-center text-sm space-y-2">
          <div className="font-bold tp-text-gold">동국대학교 한의과대학 동문회</div>
          <div>회원 여러분의 소통과 발전을 위한 공식 플랫폼</div>
          <div className="text-xs text-white/60 pt-2">
            <Link href="/terms" className="hover:underline">서비스 이용약관</Link>
            <span className="mx-2">·</span>
            <Link href="/privacy" className="hover:underline">개인정보 처리방침</Link>
          </div>
        </div>
      </footer>

      <LoginModal
        open={loginOpen}
        onOpenChange={(o) => {
          setLoginOpen(o);
          if (!o) setPendingTarget(null);
        }}
        returnTo={pendingTarget || location}
      />
    </div>
  );
}
