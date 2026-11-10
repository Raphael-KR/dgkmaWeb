import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "./hooks/use-auth";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { consumeAuthReturnPath } from "./lib/return-path";

export default function KakaoCallback() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  // 인가 코드는 재사용할 수 없어 같은 콜백의 중복 교환을 막는다.
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

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
        const result = await login(code, state);

        if (result.status === "success") {
          if (!result.user.activityRegion) {
            setLocation("/onboarding/region");
          } else {
            setLocation(consumeAuthReturnPath());
          }
        } else if (result.status === "requiresApproval") {
          setLocation("/login");
        } else if (result.status === "failure") {
          setLocation("/login");
        }
      } catch (error) {
        console.error("Kakao callback error:", error);
        toast({
          title: "로그인 실패",
          description: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
          variant: "destructive",
        });
        setLocation("/login");
      }
    };

    handleCallback();
    // 첫 진입의 인가 코드만 처리하며 렌더링으로 교환을 다시 시작하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="member-screen screen-center">
      <div className="text-center">
        <LoadingSpinner size="large" />
        <p className="mt-4 text-gray-600">카카오 로그인 처리 중...</p>
      </div>
    </div>
  );
}
