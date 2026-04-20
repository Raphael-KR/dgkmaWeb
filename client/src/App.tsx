import { useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";

import Home from "@/pages/home";
import { PublicHome } from "@/pages/public-home";
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";
import Admin from "@/pages/admin";
import Boards from "@/pages/boards";
import Directory from "@/pages/directory";
import Profile from "@/pages/profile";
import HeritagePage from "@/pages/heritage";
import ObituaryList from "@/pages/obituary/list";
import ObituaryCreate from "@/pages/obituary/create";
import Search from "@/pages/search";
import PostDetail from "@/pages/post-detail";
import Terms from "@/pages/terms";
import Privacy from "@/pages/privacy";
import AuthCallback from "@/pages/auth-callback";
import KakaoCallback from "@/pages/kakao-callback";
import AboutBylaws from "@/pages/about/bylaws";
import AboutJoin from "@/pages/about/join";
import AboutDues from "@/pages/about/dues";
import AboutCondolence from "@/pages/about/condolence";
import AboutIntro from "@/pages/about/intro";
import AboutExecutives from "@/pages/about/executives";
import { AppHeader } from "@/components/layout/app-header";
import Navigation from "@/components/navigation";
import { BottomNavigation } from "@/components/layout/bottom-navigation";
import { AuthGate } from "@/components/auth/auth-gate";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

function RootRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }
  return user ? <Home /> : <PublicHome />;
}

// Paths whose pages render their own PublicLayout (header/footer) and must NOT
// have the member chrome (AppHeader + side Navigation) wrapped around them.
// Note: "/" is intentionally NOT included here. The shell decision for "/" is
// made dynamically based on auth state — logged-in users get the member shell
// + Home, non-logged users get PublicHome which renders its own PublicLayout.
const PUBLIC_PATHS = ["/login", "/terms", "/privacy", "/auth/callback", "/kakao-callback"];
const PUBLIC_PREFIXES = ["/about/"];

function isPublicPath(path: string) {
  if (PUBLIC_PATHS.includes(path)) return true;
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRoute} />
      <Route path="/login" component={Login} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/kakao-callback" component={KakaoCallback} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />

      {/* Public about pages */}
      <Route path="/about/intro" component={AboutIntro} />
      <Route path="/about/executives" component={AboutExecutives} />
      <Route path="/about/bylaws" component={AboutBylaws} />
      <Route path="/about/join" component={AboutJoin} />
      <Route path="/about/dues" component={AboutDues} />
      <Route path="/about/condolence" component={AboutCondolence} />

      {/* Member-only routes */}
      <Route path="/admin">
        <AuthGate requireAdmin reason="관리자 전용 메뉴입니다."><Admin /></AuthGate>
      </Route>
      <Route path="/b">
        <AuthGate><Boards /></AuthGate>
      </Route>
      <Route path="/directory">
        <AuthGate><Directory /></AuthGate>
      </Route>
      <Route path="/profile">
        <AuthGate><Profile /></AuthGate>
      </Route>
      <Route path="/heritage">
        <AuthGate><HeritagePage /></AuthGate>
      </Route>
      <Route path="/search">
        <AuthGate><Search /></AuthGate>
      </Route>
      <Route path="/p/:id">
        <AuthGate><PostDetail /></AuthGate>
      </Route>
      <Route path="/post/:id">
        <AuthGate><PostDetail /></AuthGate>
      </Route>
      <Route path="/o">
        <AuthGate><ObituaryList /></AuthGate>
      </Route>
      <Route path="/o/new">
        <AuthGate><ObituaryCreate /></AuthGate>
      </Route>

      {/* Redirect old routes to /heritage */}
      <Route path="/about" component={() => { window.location.href = '/heritage'; return null; }} />
      <Route path="/info" component={() => { window.location.href = '/heritage'; return null; }} />
      <Route path="/executives" component={() => { window.location.href = '/about/executives'; return null; }} />
      <Route path="/bylaws" component={() => { window.location.href = '/about/bylaws'; return null; }} />
      <Route path="/history" component={() => { window.location.href = '/heritage'; return null; }} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppShell() {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [location] = useLocation();
  const { user } = useAuth();

  // Public pages render their own PublicLayout (with header + footer).
  // Member chrome (AppHeader + side Navigation) only shows for logged-in users on member routes.
  // Special: "/" → member chrome only when logged in (RootRoute renders Member Home);
  // non-logged users see PublicHome which renders its own PublicLayout.
  const onPublicPath = isPublicPath(location);
  const onRoot = location === "/";
  const usesPublicLayout = onPublicPath || (onRoot && !user);
  const showMemberChrome = !!user && !usesPublicLayout;
  // Bottom nav: visible on mobile for BOTH states. For non-logged users on
  // public paths, the gated tabs trigger a LoginModal (handled inside the
  // BottomNavigation component). Hide only on dedicated auth screens.
  const hideBottomNav = ["/login", "/auth/callback", "/kakao-callback"].includes(location);
  const showBottomNav = !hideBottomNav;

  return (
    <div className={`min-h-screen ${showMemberChrome ? "bg-gray-50 pb-16" : ""}`}>
      {showMemberChrome && (
        <>
          <AppHeader />
          <Navigation isOpen={isNavOpen} setIsOpen={setIsNavOpen} />
        </>
      )}
      <main>
        <Router />
      </main>
      {showBottomNav && <BottomNavigation />}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AppShell />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
