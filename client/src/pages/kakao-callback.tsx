import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";

export default function KakaoCallback() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  // ⚠️ 중복 호출 방지 — 같은 인가 코드로 /api/auth/kakao/authorize 가 두 번 호출되면
  //   카카오가 두 번째 요청을 거부 (KOE320 또는 KOE303). React StrictMode·effect deps 변동·
  //   브라우저 백포워드·동시 실행 등으로 useEffect 가 재실행되어도 단 한 번만 보내도록 한다.
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

        // v5 — 카카오 응답 5개 추가 필드 함께 전달.
        const result = await login({
          kakaoId: data.kakaoId,
          email: data.email,
          name: data.name,
          profileImage: data.profileImage,
          phoneNumber: data.phoneNumber,
          birthday: data.birthday,
          birthdayType: data.birthdayType,
          isLeapMonth: data.isLeapMonth,
        });

        // 로그인 성공 후 분기:
        //  - activityRegion 미설정 → /onboarding/region 강제 리다이렉트
        //  - 설정됨 → returnTo 또는 홈
        //  - requiresApproval 또는 null → useAuth가 toast 처리, 아무 이동 없음
        if (result && "user" in result) {
          if (!result.user.activityRegion) {
            setLocation("/onboarding/region");
          } else {
            let dest = "/";
            try {
              const stored = sessionStorage.getItem("auth:returnTo");
              if (stored && stored.startsWith("/") && !stored.startsWith("//")) {
                dest = stored;
              }
              sessionStorage.removeItem("auth:returnTo");
            } catch {}
            setLocation(dest);
          }
        }
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
    // ⚠️ deps 비움 — login/setLocation/toast 가 매 렌더마다 새 ref 가 되더라도 effect 재실행 방지.
    //   (handledRef 가드로 중복 호출은 별도로 막지만, 단순화 위해 빈 배열 유지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-kakao-gray">
      <div className="text-center">
        <LoadingSpinner size="large" />
        <p className="mt-4 text-gray-600">카카오 로그인 처리 중...</p>
      </div>
    </div>
  );
}
