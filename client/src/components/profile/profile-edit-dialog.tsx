import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { REGION_OPTIONS, type User } from "@shared/schema";

type FormValues = {
  activityRegion: string;
};

function toFormValues(user: User): FormValues {
  return {
    activityRegion: user.activityRegion ?? "",
  };
}

// 활동 지역만 수정한다. 이름·졸업년도·연락처는 동문 DB 검증 항목이다.
export function ProfileEditDialog({
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
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({ defaultValues: toFormValues(user) });

  useEffect(() => {
    if (open) form.reset(toFormValues(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = values.activityRegion
        ? { activityRegion: values.activityRegion }
        : {};
      const res = await apiRequest("PATCH", "/api/users/me", payload);
      const data = await res.json();
      return data.user as User;
    },
    onSuccess: (updated) => {
      setUser(updated);
      queryClient.invalidateQueries({ queryKey: ["/api/membership/status"] });
      toast({ title: "프로필이 저장되었습니다" });
      onOpenChange(false);
    },
    onError: (e) => {
      toast({
        title: "저장 실패",
        description: e instanceof Error ? e.message : "다시 시도해주세요.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>프로필 수정</DialogTitle>
          <DialogDescription>
            이름·졸업년도·연락처 등 인증 정보는 변경할 수 없습니다.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="activityRegion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>활동 지역</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-activity-region">
                        <SelectValue placeholder="지역을 선택하세요" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {REGION_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                data-testid="button-save-profile"
              >
                {mutation.isPending ? "저장 중..." : "저장"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
