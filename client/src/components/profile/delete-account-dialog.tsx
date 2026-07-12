import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

type DeleteAccountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const [confirmation, setConfirmation] = useState("");
  const { setUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isConfirmed = confirmation === "탈퇴";

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/users/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirmation }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data.message === "string"
            ? data.message
            : "회원 탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요",
        );
      }
    },
    onSuccess: () => {
      onOpenChange(false);
      setConfirmation("");
      setUser(null);
      queryClient.clear();
      setLocation("/");
      toast({ title: "회원 탈퇴가 완료되었습니다" });
    },
    onError: (error) => {
      toast({
        title: "회원 탈퇴 실패",
        description: error instanceof Error
          ? error.message
          : "회원 탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요",
        variant: "destructive",
      });
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (mutation.isPending) return;
    if (!nextOpen) setConfirmation("");
    onOpenChange(nextOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>회원 탈퇴</AlertDialogTitle>
          <AlertDialogDescription>
            카카오 연결을 해제하고 회원 개인정보를 삭제합니다. 계속하려면 아래에 탈퇴를 입력해주세요.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="탈퇴"
          aria-label="회원 탈퇴 확인 문구"
          autoComplete="off"
          disabled={mutation.isPending}
          data-testid="input-delete-account-confirmation"
        />

        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>취소</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              disabled={!isConfirmed || mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                mutation.mutate();
              }}
              data-testid="button-confirm-delete-account"
            >
              {mutation.isPending ? "처리 중..." : "회원 탈퇴"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
