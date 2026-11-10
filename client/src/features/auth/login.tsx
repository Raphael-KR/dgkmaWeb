import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "./hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { SiteLogo } from "@/components/site-brand";
import { SITE_NAME } from "@shared/site";
import { kakaoLogin } from "./lib/auth";

export default function Login() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  // 서버의 카카오 OAuth 시작 경로로 이동하므로 브라우저 SDK 초기화는 필요 없다.
  const handleKakaoLogin = () => {
    kakaoLogin();
  };

  if (isLoading) {
    return (
      <div className="member-screen screen-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="member-screen p-4">
      <div className="max-w-md mx-auto pt-20">
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="text-center">
              <SiteLogo size="auth" className="mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">
                {SITE_NAME}에 오신 것을 환영합니다
              </h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                동문 여러분과의 소통과 네트워킹을 위한 통합 플랫폼입니다.
              </p>

              <Button
                variant="kakao"
                className="w-full py-4 px-6 rounded-xl mb-3"
                onClick={handleKakaoLogin}
                disabled={isLoading}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3c5.799 0 10.5 3.664 10.5 8.185 0 4.52-4.701 8.184-10.5 8.184a13.5 13.5 0 0 1-1.658-.1L5.5 21l1.072-3.85a7.55 7.55 0 0 1-1.997-5.065C4.575 6.664 9.201 3 15 3z" />
                </svg>
                <span>카카오로 시작하기</span>
              </Button>

              <div
                aria-label="카카오 로그인 개인정보 안내"
                className="text-sm text-gray-600 leading-relaxed mb-4 text-left"
              >
                <p>
                  <strong>필수</strong> 이름, 이메일, 전화번호
                </p>
                <p>
                  <strong>선택</strong> 프로필 사진, 생일, 카카오톡 채널 추가 상태 및 내역
                </p>
                <p>
                  이름과 전화번호는 동문 자격 확인, 이메일은 계정 관리와 공식 안내, 프로필 사진은 내
                  정보 표시, 생일은 본인 전용 축하 화면에 사용합니다.
                </p>
                <p>
                  채널 추가 상태 및 내역은 동문회 공지 및 경조사 알림 수신을 위한 공식 채널 추가와
                  관계 확인에 사용합니다.
                </p>
                <p>
                  선택 항목에 동의하지 않아도 가입할 수 있으며, 해당 프로필 표시와 축하 화면이
                  제공되지 않거나 공식 채널이 추가되지 않습니다.
                </p>
                <p>활동 지역은 카카오 제공항목이 아니며, 로그인 후 별도로 입력합니다.</p>
              </div>

              <div className="text-xs text-gray-400 space-y-1">
                <p>
                  로그인 시{" "}
                  <button
                    onClick={() => window.open("/terms", "_blank")}
                    className="text-kakao-brown underline hover:text-yellow-600"
                    data-testid="link-terms"
                  >
                    서비스 이용약관
                  </button>{" "}
                  및{" "}
                  <button
                    onClick={() => window.open("/privacy", "_blank")}
                    className="text-kakao-brown underline hover:text-yellow-600"
                    data-testid="link-privacy"
                  >
                    개인정보 처리방침
                  </button>
                  에 동의한 것으로 간주됩니다.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
