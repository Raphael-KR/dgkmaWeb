import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FileText, Shield, Wallet, ChevronRight, UserRoundX } from "lucide-react";

export function SettingsDialog({
  open,
  onOpenChange,
  onDeleteAccount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleteAccount: () => void;
}) {
  const [, setLocation] = useLocation();

  const go = (path: string) => {
    onOpenChange(false);
    setLocation(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>설정</DialogTitle>
          <DialogDescription>서비스 안내와 계정을 관리합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
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

          <Separator />

          <Button
            variant="ghost"
            className="w-full justify-between text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={onDeleteAccount}
            data-testid="button-settings-delete-account"
          >
            <span className="flex items-center">
              <UserRoundX className="mr-3" size={18} />
              회원 탈퇴
            </span>
            <ChevronRight size={16} className="text-red-400" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
