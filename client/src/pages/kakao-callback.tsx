import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";

export default function KakaoCallback() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");

      if (!code) {
        toast({
          title: "로그인 실패",
          description: "인가 코드가 없습니다.",
          variant: "destructive",
        });
        setLocation("/login");
        return;
      }

      try {
        const response = await fetch("/api/auth/kakao/authorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, state }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "카카오 인증에 실패했습니다.");
        }

        if (data.accessToken && window.Kakao?.Auth) {
          window.Kakao.Auth.setAccessToken(data.accessToken);
        }

        await login({
          kakaoId: data.kakaoId,
          email: data.email,
          name: data.name,
        });
      } catch (error) {
        console.error("Kakao callback error:", error);
        toast({
          title: "로그인 실패",
          description:
            error instanceof Error
              ? error.message
              : "알 수 없는 오류가 발생했습니다.",
          variant: "destructive",
        });
        setLocation("/login");
      }
    };

    handleCallback();
  }, [login, setLocation, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-kakao-gray">
      <div className="text-center">
        <LoadingSpinner size="large" />
        <p className="mt-4 text-gray-600">카카오 로그인 처리 중...</p>
      </div>
    </div>
  );
}
