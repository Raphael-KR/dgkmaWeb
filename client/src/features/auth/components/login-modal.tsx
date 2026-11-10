import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { kakaoLogin } from "../lib/auth";
import { trackEvent } from "@/lib/analytics";
import { SiteLogo } from "@/components/site-brand";
import { AUTH_RETURN_PATH_KEY } from "../lib/return-path";

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnTo?: string;
  reason?: string;
}

export function LoginModal({ open, onOpenChange, returnTo, reason }: LoginModalProps) {
  // 서버의 카카오 OAuth 시작 경로로 이동하므로 브라우저 SDK 초기화는 필요 없다.
  const handleLogin = () => {
    trackEvent("login_started", {
      provider: "kakao",
      has_return_path: Boolean(returnTo),
    });
    if (returnTo) {
      try {
        sessionStorage.setItem(AUTH_RETURN_PATH_KEY, returnTo);
      } catch {
        /* Storage can be unavailable; continue with the default return path. */
      }
    }
    kakaoLogin();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-md">
        <DialogHeader>
          <SiteLogo size="auth" className="mx-auto mb-3" />
          <DialogTitle className="text-center text-lg">로그인이 필요합니다</DialogTitle>
          <DialogDescription className="text-center">
            {reason || "동문 전용 메뉴입니다. 카카오 계정으로 로그인해 주세요."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <Button variant="kakao" className="w-full py-5" onClick={handleLogin}>
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3c5.799 0 10.5 3.664 10.5 8.185 0 4.52-4.701 8.184-10.5 8.184a13.5 13.5 0 0 1-1.658-.1L5.5 21l1.072-3.85a7.55 7.55 0 0 1-1.997-5.065C4.575 6.664 9.201 3 15 3z" />
            </svg>
            카카오로 로그인
          </Button>
          <p className="text-xs text-gray-500 text-center leading-relaxed">
            로그인 시{" "}
            <a href="/terms" target="_blank" className="underline">
              서비스 이용약관
            </a>{" "}
            및{" "}
            <a href="/privacy" target="_blank" className="underline">
              개인정보 처리방침
            </a>
            에 동의한 것으로 간주됩니다.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
