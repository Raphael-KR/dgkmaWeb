import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { LoginModal } from "@/components/auth/login-modal";
import { PublicHome } from "@/pages/public-home";

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
      <>
        <PublicHome />
        <LoginModal
          open={modalOpen}
          onOpenChange={(o) => {
            setModalOpen(o);
            if (!o) setLocation("/");
          }}
          returnTo={location}
          reason={reason}
        />
      </>
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
