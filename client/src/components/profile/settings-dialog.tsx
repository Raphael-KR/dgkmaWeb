import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { FileText, Shield, Wallet, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { User } from "@shared/schema";

// 가벼운 설정 항목: 카카오 알림 연동 토글 + 약관/회비 안내 바로가기.
export function SettingsDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}) {
  const { setUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const mutation = useMutation({
    mutationFn: async (kakaoSyncEnabled: boolean) => {
      const res = await apiRequest("PATCH", "/api/users/me", { kakaoSyncEnabled });
      const data = await res.json();
      return data.user as User;
    },
    onSuccess: (updated) => {
      setUser(updated);
      toast({ title: "설정이 저장되었습니다" });
    },
    onError: () => {
      toast({ title: "저장 실패", description: "다시 시도해주세요.", variant: "destructive" });
    },
  });

  const go = (path: string) => {
    onOpenChange(false);
    setLocation(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>설정</DialogTitle>
          <DialogDescription>알림과 안내 항목을 관리합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <div className="flex items-center justify-between py-3">
            <div className="pr-4">
              <p className="font-medium text-gray-800">카카오 알림 연동</p>
              <p className="text-xs text-gray-500">
                동문회 소식·경조사 안내를 카카오로 받아봅니다.
              </p>
            </div>
            <Switch
              checked={!!user.kakaoSyncEnabled}
              onCheckedChange={(v) => mutation.mutate(v)}
              disabled={mutation.isPending}
              data-testid="switch-kakao-sync"
            />
          </div>

          <Separator />

          <Button
            variant="ghost"
            className="w-full justify-between"
            onClick={() => go("/about/dues")}
            data-testid="button-settings-dues"
          >
            <span className="flex items-center">
              <Wallet className="mr-3" size={18} />
              회비 안내
            </span>
            <ChevronRight size={16} className="text-gray-400" />
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-between"
            onClick={() => go("/terms")}
            data-testid="button-settings-terms"
          >
            <span className="flex items-center">
              <FileText className="mr-3" size={18} />
              이용약관
            </span>
            <ChevronRight size={16} className="text-gray-400" />
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-between"
            onClick={() => go("/privacy")}
            data-testid="button-settings-privacy"
          >
            <span className="flex items-center">
              <Shield className="mr-3" size={18} />
              개인정보처리방침
            </span>
            <ChevronRight size={16} className="text-gray-400" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
