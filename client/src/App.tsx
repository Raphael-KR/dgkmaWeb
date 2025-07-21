import React, { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Home from "@/pages/home";
import Boards from "@/pages/boards";
import Payments from "@/pages/payments";
import Directory from "@/pages/directory";
import Profile from "@/pages/profile";
import Admin from "@/pages/admin";
import About from "@/pages/about";
import Executives from "@/pages/executives";
import Bylaws from "@/pages/bylaws";
import History from "@/pages/history";
import { AppHeader } from "@/components/layout/app-header";
import Navigation from "@/components/navigation";


function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/boards" component={Boards} />
      <Route path="/payments" component={Payments} />
      <Route path="/directory" component={Directory} />
      <Route path="/profile" component={Profile} />
      <Route path="/admin" component={Admin} />
      <Route path="/about" component={About} />
      <Route path="/executives" component={Executives} />
      <Route path="/bylaws" component={Bylaws} />
      <Route path="/history" component={History} />
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
          <div className="min-h-screen bg-gray-50">
            <AppHeader onMenuClick={() => setIsNavOpen(true)} />
            <Navigation isOpen={isNavOpen} setIsOpen={setIsNavOpen} />
            <Router>
              <Switch>
              </Switch>
            </Router>

          </div>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;