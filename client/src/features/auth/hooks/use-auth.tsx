import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
// 회원 인증 상태는 서버의 카카오 REST OAuth·Express 세션에서 조회한다.
import type { ClientUser } from "@shared/contracts";

export type LoginResult =
  { status: "success"; user: ClientUser } | { status: "requiresApproval" } | { status: "failure" };

interface AuthContextType {
  user: ClientUser | null;
  setUser: (user: ClientUser | null) => void;
  login: (code: string, state: string | null) => Promise<LoginResult>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
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

  const login = async (code: string, state: string | null): Promise<LoginResult> => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/kakao/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code, state }),
      });

      const data = await response.json();

      if (response.status === 202 && data.requiresApproval) {
        toast({
          title: data.message || "가입 신청 완료",
          description: data.description || "관리자 확인 후 이용 가능합니다.",
        });
        return { status: "requiresApproval" };
      }

      if (response.ok && data.user) {
        setUser(data.user);
        toast({
          title: "카카오 로그인 성공",
          description: `${data.user.name}님, 환영합니다!`,
        });
        // ⚠️ setLocation은 호출자(kakao-callback)에서 activityRegion 검사 후 분기 — 여기서 직접 이동하지 않음
        return { status: "success", user: data.user };
      }

      throw new Error(data.message || "로그인에 실패했습니다.");
    } catch (error) {
      toast({
        title: "로그인 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
        variant: "destructive",
      });
      return { status: "failure" };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    let status: number | null = null;
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      status = response.status;
      if (!response.ok) throw new Error("logout_rejected");
    } catch (error) {
      console.warn("Logout failed", {
        errorType: error instanceof Error ? error.name : "UnknownError",
        httpStatus: status,
        privateDataOmitted: true,
      });
      toast({
        title: "로그아웃 실패",
        description: "로그아웃을 완료하지 못했습니다. 다시 시도해 주세요.",
        variant: "destructive",
      });
      return;
    }

    queryClient.clear();
    setUser(null);
    setLocation("/login");
    toast({
      title: "로그아웃",
      description: "성공적으로 로그아웃되었습니다.",
    });
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, isLoading }}>
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
