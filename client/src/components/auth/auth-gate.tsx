import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { LoginModal } from "@/components/auth/login-modal";

interface AuthGateProps {
  children: ReactNode;
  requireAdmin?: boolean;
  reason?: string;
}

export function AuthGate({ children, requireAdmin, reason }: AuthGateProps) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      setModalOpen(true);
    }
  }, [isLoading, user]);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="theme-public min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-bold tp-text-green-dark mb-2">로그인이 필요한 메뉴입니다</h2>
          <p className="text-sm text-gray-600 mb-6">
            카카오 로그인 후 이용해 주세요.
          </p>
          <button
            className="bg-kakao-yellow text-kakao-brown px-5 py-2.5 rounded-md font-bold hover:bg-yellow-400"
            onClick={() => setModalOpen(true)}
          >
            카카오 로그인
          </button>
          <div className="mt-4">
            <button
              className="text-sm text-gray-500 underline"
              onClick={() => setLocation("/")}
            >
              홈으로 돌아가기
            </button>
          </div>
        </div>
        <LoginModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          returnTo={location}
          reason={reason}
        />
      </div>
    );
  }

  if (requireAdmin && !user.isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">접근 권한이 없습니다</h2>
          <p className="text-gray-600">관리자만 이용할 수 있는 메뉴입니다.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
