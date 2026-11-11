import { ASSOCIATION_CONTACT } from "@shared/association";
import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, Menu, X, LogIn, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoginModal, useAuth } from "@/features/auth";
import { SITE_NAME } from "@shared/site";
import { SiteBrand } from "@/components/site-brand";
import { SiteHeader } from "./site-header";
import { HeaderProfileLink } from "./header-profile-link";
import { isPublicNavActive, publicNavItems, type PublicNavItem } from "./nav-items";

export function PublicLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  const handleNavClick = (e: React.MouseEvent, item: PublicNavItem) => {
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
      <SiteHeader
        homeHref="/about"
        navigationLabel="공개 메뉴"
        actions={
          <>
            <div className="hidden items-center gap-2 md:flex">
              {user ? (
                <>
                  <Button asChild size="sm" variant="onBrand">
                    <Link href="/">
                      <Users size={16} /> 커뮤니티
                    </Link>
                  </Button>
                  <HeaderProfileLink name={user.name} />
                  <Button size="sm" variant="onBrandOutline" onClick={() => logout()}>
                    <LogOut size={14} /> 로그아웃
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="kakao" onClick={() => setLoginOpen(true)}>
                  <LogIn size={16} /> 카카오 로그인
                </Button>
              )}
            </div>
            <Button
              variant="onBrand"
              size="icon"
              className="md:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="메뉴 열기"
            >
              <Menu size={24} />
            </Button>
          </>
        }
        navigation={publicNavItems.map((item) => {
          const active = isPublicNavActive(location, item);
          if (item.children) {
            return (
              <div key={item.path} className="group relative">
                <Link
                  href={item.path}
                  className="site-nav-link"
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                  <ChevronDown size={14} aria-hidden="true" />
                </Link>
                <div className="absolute left-0 top-full hidden pt-1 group-hover:block group-focus-within:block">
                  <div className="w-32 rounded-md border border-border bg-background p-1 shadow-lg">
                    {item.children.map((child) => (
                      <Link
                        key={child.path}
                        href={child.path}
                        className="site-menu-link"
                        aria-current={location === child.path ? "page" : undefined}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          }
          return (
            <Link
              key={item.path}
              href={item.path}
              onClick={(e) => handleNavClick(e, item)}
              className="site-nav-link"
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      />

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setDrawerOpen(false)} />
          <div className="fixed top-0 right-0 bottom-0 w-72 max-w-[80vw] bg-white z-50 shadow-xl flex flex-col">
            <div className="site-brand-surface p-4">
              <div className="flex items-center gap-2">
                <SiteBrand homeHref="/about" onClick={() => setDrawerOpen(false)} />
                <Button
                  variant="onBrand"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="닫기"
                >
                  <X size={20} />
                </Button>
              </div>
              {user && <p className="mt-3 truncate text-sm text-white/90">{user.name}님</p>}
            </div>
            <nav className="flex-1 p-2 overflow-y-auto">
              {user && (
                <Link href="/" onClick={() => setDrawerOpen(false)} className="site-menu-link">
                  커뮤니티로 이동
                </Link>
              )}
              {publicNavItems.map((item) => {
                const active = isPublicNavActive(location, item);
                return (
                  <div key={item.path}>
                    <Link
                      href={item.path}
                      onClick={(e) => handleNavClick(e, item)}
                      className="site-menu-link"
                      aria-current={active ? "page" : undefined}
                    >
                      {item.label}
                      {item.gated && !user && (
                        <span className="ml-2 text-xs text-gray-400">로그인 필요</span>
                      )}
                    </Link>
                    {item.children && (
                      <div className="ml-5 border-l border-gray-200 pl-2">
                        {item.children.map((child) => (
                          <Link
                            key={child.path}
                            href={child.path}
                            onClick={() => setDrawerOpen(false)}
                            className="site-menu-link"
                            aria-current={location === child.path ? "page" : undefined}
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
            <div className="p-4 border-t">
              {user ? (
                <Button
                  variant="dangerOutline"
                  className="w-full"
                  onClick={() => {
                    setDrawerOpen(false);
                    logout();
                  }}
                >
                  <LogOut size={16} className="mr-1" /> 로그아웃
                </Button>
              ) : (
                <Button
                  variant="kakao"
                  className="w-full"
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

      <footer className="site-brand-surface py-8 mt-12">
        <div className="site-container text-sm space-y-3">
          <div className="font-bold tp-text-accent text-base">{SITE_NAME}</div>
          <dl className="grid grid-cols-1 sm:grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-white/85">
            <dt className="text-white/60">단체명</dt>
            <dd>{SITE_NAME}</dd>
            <dt className="text-white/60">대표자</dt>
            <dd>{ASSOCIATION_CONTACT.representative}</dd>
            <dt className="text-white/60">고유번호</dt>
            <dd>{ASSOCIATION_CONTACT.registrationNumber}</dd>
            <dt className="text-white/60">소재지</dt>
            <dd>{ASSOCIATION_CONTACT.address}</dd>
            <dt className="text-white/60">이메일</dt>
            <dd>
              <a href={`mailto:${ASSOCIATION_CONTACT.email}`} className="hover:underline">
                {ASSOCIATION_CONTACT.email}
              </a>
            </dd>
          </dl>
          <div className="text-xs text-white/60 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
            <div>© {SITE_NAME} · All Rights Reserved.</div>
            <div>
              <Link href="/terms" className="hover:underline">
                서비스 이용약관
              </Link>
              <span className="mx-2">·</span>
              <Link href="/privacy" className="hover:underline">
                개인정보 처리방침
              </Link>
            </div>
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
