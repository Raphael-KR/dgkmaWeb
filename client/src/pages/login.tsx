import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { GraduationCap } from "lucide-react";
import { signInWithKakao, initKakao, kakaoLogin } from "@/lib/auth";

export default function Login() {
  const [, setLocation] = useLocation();
  const { user, login, isLoading } = useAuth();

  useEffect(() => {
    if (user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  useEffect(() => {
    // Initialize Kakao SDK when component mounts
    initKakao();
  }, []);

  const handleKakaoLogin = async () => {
    try {
      console.log("Starting Kakao login process...");
      
      // Check if Kakao SDK is available and initialized
      if (!window.Kakao) {
        console.error("Kakao SDK not loaded");
        alert("카카오 SDK가 로드되지 않았습니다. 페이지를 새로고침해주세요.");
        return;
      }

      if (!window.Kakao.isInitialized()) {
        console.error("Kakao SDK not initialized");
        alert("카카오 SDK 초기화에 실패했습니다. 페이지를 새로고침해주세요.");
        return;
      }

      console.log("Kakao SDK is ready, attempting login...");
      
      // Try custom Kakao login first
      try {
        const kakaoData = await kakaoLogin();
        console.log("Kakao login successful:", kakaoData);
        await login(kakaoData);
        return;
      } catch (kakaoError) {
        console.warn("Custom Kakao login failed:", kakaoError);
        
        // Show user-friendly error message
        if (kakaoError.message?.includes("user_denied")) {
          alert("카카오 로그인이 취소되었습니다.");
          return;
        }
        
        // Ask user if they want to continue with development mode
        const useDevMode = confirm(
          "카카오 로그인에 실패했습니다.\n" +
          "개발용 계정으로 로그인하시겠습니까?\n\n" +
          "개발용 로그인은 테스트 목적으로만 사용됩니다."
        );
        
        if (!useDevMode) {
          return;
        }
      }
      
      // Development mode login with user consent
      console.log("Using development mode login");
      const mockKakaoData = {
        kakaoId: "dev-kakao-id-" + Date.now(),
        email: "dev@donggukhani.com", 
        name: "개발자"
      };
      await login(mockKakaoData);
      
    } catch (error) {
      console.error("Login completely failed:", error);
      alert("로그인에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-kakao-gray">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-kakao-gray p-4">
      <div className="max-w-md mx-auto pt-20">
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="text-center">
              <div className="w-20 h-20 kakao rounded-2xl mx-auto mb-4 flex items-center justify-center">
                <GraduationCap className="text-kakao-brown text-2xl" size={32} />
              </div>
              <h2 className="text-xl font-bold kakao-brown mb-2">
                동국대학교 한의과대학 동문회에 오신 것을 환영합니다
              </h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                동문 여러분과의 소통과 네트워킹을 위한 통합 플랫폼입니다.
              </p>

              <Button 
                className="w-full kakao font-bold py-4 px-6 rounded-xl mb-3 flex items-center justify-center space-x-3 transition-all hover:bg-yellow-400"
                onClick={handleKakaoLogin}
                disabled={isLoading}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3c5.799 0 10.5 3.664 10.5 8.185 0 4.52-4.701 8.184-10.5 8.184a13.5 13.5 0 0 1-1.658-.1L5.5 21l1.072-3.85a7.55 7.55 0 0 1-1.997-5.065C4.575 6.664 9.201 3 15 3z"/>
                </svg>
                <span>카카오로 시작하기</span>
              </Button>

              <p className="text-sm text-gray-500 leading-relaxed">
                카카오싱크 간편가입으로<br />
                졸업생 정보와 자동 매칭하여<br />
                빠르고 안전하게 시작하세요.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}