import { Switch, Route, Redirect } from "wouter";
import { AuthGate, useAuth, Login, KakaoCallback, OnboardingRegion } from "@/features/auth";
import { Home, PublicHome } from "@/features/home";
import { Admin } from "@/features/admin";
import { Boards, PostDetail } from "@/features/boards";
import { Directory } from "@/features/directory";
import { Profile } from "@/features/profile";
import { HeritagePage } from "@/features/heritage";
import CommunityEventsPage, { CommunityEventDetail, ObituaryDetail } from "@/features/events";
import { Search } from "@/features/search";
import { Terms, Privacy } from "@/features/legal";
import {
  AboutBylaws, AboutRegulations, AboutJoin, AboutDues,
  AboutCondolence, AboutIntro, AboutExecutives,
} from "@/features/about";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import NotFound from "./not-found";

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

export function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRoute} />
      <Route path="/login" component={Login} />
      <Route path="/kakao-callback" component={KakaoCallback} />
      <Route path="/onboarding/region" component={OnboardingRegion} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />

      {/* Public about pages */}
      <Route path="/about/intro" component={AboutIntro} />
      <Route path="/about/executives" component={AboutExecutives} />
      <Route path="/about/bylaws" component={AboutBylaws} />
      <Route path="/about/bylaws/regulations" component={AboutRegulations} />
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
      <Route path="/o/new" component={() => <Redirect to="/events?type=obituary&compose=1" replace />} />
      <Route path="/o" component={() => <Redirect to="/events?type=obituary" replace />} />
      <Route path="/o/:id">
        <AuthGate><ObituaryDetail /></AuthGate>
      </Route>
      <Route path="/events">
        <AuthGate><CommunityEventsPage /></AuthGate>
      </Route>
      <Route path="/events/:id">
        <AuthGate><CommunityEventDetail /></AuthGate>
      </Route>

      {/* Redirect old routes to /heritage */}
      <Route path="/about" component={() => { window.location.href = '/heritage'; return null; }} />
      <Route path="/info" component={() => { window.location.href = '/heritage'; return null; }} />
      <Route path="/executives" component={() => { window.location.href = '/about/executives'; return null; }} />
      <Route path="/officers" component={() => { window.location.href = '/about/executives'; return null; }} />
      <Route path="/bylaws" component={() => { window.location.href = '/about/bylaws'; return null; }} />
      <Route path="/history" component={() => { window.location.href = '/heritage'; return null; }} />
      <Route component={NotFound} />
    </Switch>
  );
}
