
import { useEffect } from "react";
import { useLocation } from "wouter";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          throw error;
        }

        if (data.session) {
          toast({
            title: "로그인 성공",
            description: "Supabase 카카오 로그인이 완료되었습니다.",
          });
          setLocation("/");
        } else {
          throw new Error("세션을 찾을 수 없습니다.");
        }
      } catch (error) {
        console.error("Auth callback error:", error);
        toast({
          title: "로그인 실패",
          description: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
          variant: "destructive",
        });
        setLocation("/login");
      }
    };

    handleAuthCallback();
  }, [setLocation, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-kakao-gray">
      <div className="text-center">
        <LoadingSpinner size="large" />
        <p className="mt-4 text-gray-600">로그인 처리 중...</p>
      </div>
    </div>
  );
}
