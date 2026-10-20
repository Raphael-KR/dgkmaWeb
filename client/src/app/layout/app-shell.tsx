import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/features/auth";
import { AppHeader } from "./app-header";
import Navigation from "./navigation";
import { BottomNavigation } from "./bottom-navigation";
import { Router } from "../routing/router";
import { isPublicPath } from "../routing/public-paths";

export function AppShell() {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [location] = useLocation();
  const { user } = useAuth();

  // Public pages render their own PublicLayout (with header + footer).
  // Member chrome only shows for logged-in users on member routes.
  const onPublicPath = isPublicPath(location);
  const onRoot = location === "/";
  const usesPublicLayout = onPublicPath || (onRoot && !user);
  const showMemberChrome = !!user && !usesPublicLayout;
  // Public gated tabs open LoginModal; dedicated auth screens hide bottom nav.
  const hideBottomNav = ["/login", "/kakao-callback", "/onboarding/region"].includes(location);
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
