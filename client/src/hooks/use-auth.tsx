import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { supabase, getCurrentUser, signOut as supabaseSignOut } from "@/lib/supabase";
import type { User } from "@shared/schema";

interface AuthContextType {
  user: User | null;
  login: (kakaoData: { kakaoId: string; email: string; name: string }) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
    
    // Listen to Supabase auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          console.log('Supabase user signed in:', session.user);
          // You can create/update user in your database here
          // For now, we'll still use the existing auth flow
        } else if (event === 'SIGNED_OUT') {
          console.log('Supabase user signed out');
          setUser(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (kakaoData: { kakaoId: string; email: string; name: string }) => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/kakao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(kakaoData),
      });

      const data = await response.json();

      if (response.status === 202 && data.requiresApproval) {
        toast({
          title: data.message || "가입 신청 완료",
          description: data.description || "관리자 승인 후 이용 가능합니다. 카카오톡으로 결과를 알려드리겠습니다.",
        });
        return;
      }

      if (response.ok && data.user) {
        setUser(data.user);
        setLocation("/");
        toast({
          title: "카카오싱크 로그인 성공",
          description: `${data.user.name}님, 환영합니다! 카카오싱크가 연결되었습니다.`,
        });
      } else {
        throw new Error(data.message || "로그인에 실패했습니다.");
      }
    } catch (error) {
      toast({
        title: "로그인 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Try Supabase sign out first
      await supabaseSignOut();
    } catch (error) {
      console.warn("Supabase sign out failed:", error);
    }
    
    setUser(null);
    setLocation("/login");
    toast({
      title: "로그아웃",
      description: "성공적으로 로그아웃되었습니다.",
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
