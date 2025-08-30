import React, { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";

import Home from "@/pages/home";
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";
import Admin from "@/pages/admin";
import Boards from "@/pages/boards";
import Directory from "@/pages/directory";
import Profile from "@/pages/profile";
import Info from "@/pages/info";
import Search from "@/pages/search";
import PostDetail from "@/pages/post-detail";
import Terms from "@/pages/terms";
import Privacy from "@/pages/privacy";
import AuthCallback from "@/pages/auth-callback";
import { AppHeader } from "@/components/layout/app-header";
import Navigation from "@/components/navigation";
import { BottomNavigation } from "@/components/layout/bottom-navigation";


function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/admin" component={Admin} />
      <Route path="/boards" component={Boards} />
      <Route path="/directory" component={Directory} />
      <Route path="/profile" component={Profile} />
      <Route path="/info" component={Info} />
      <Route path="/search" component={Search} />
      <Route path="/post/:id" component={PostDetail} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      {/* Redirect old routes to /info */}
      <Route path="/about" component={() => { window.location.href = '/info'; return null; }} />
      <Route path="/executives" component={() => { window.location.href = '/info'; return null; }} />
      <Route path="/bylaws" component={() => { window.location.href = '/info'; return null; }} />
      <Route path="/history" component={() => { window.location.href = '/info'; return null; }} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [isNavOpen, setIsNavOpen] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <div className="min-h-screen bg-gray-50 pb-16">
            <AppHeader />
            <Navigation isOpen={isNavOpen} setIsOpen={setIsNavOpen} />
            <main>
              <Router />
            </main>
            <BottomNavigation onMenuClick={() => setIsNavOpen(true)} />
          </div>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;