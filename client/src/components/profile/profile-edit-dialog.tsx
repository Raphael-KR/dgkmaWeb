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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { REGION_OPTIONS, type User } from "@shared/schema";

type FormValues = {
  activityRegion: string;
  birthday: string;
  birthdayType: string;
  isLeapMonth: boolean;
};

function toFormValues(user: User): FormValues {
  return {
    activityRegion: user.activityRegion ?? "",
    birthday: user.birthday ?? "",
    birthdayType: user.birthdayType ?? "",
    isLeapMonth: !!user.isLeapMonth,
  };
}

// 인증과 무관한 본인 항목만 편집(활동지역·생일·양력음력·윤달).
// 이름·졸업년도·연락처는 동문 DB 검증 항목이라 편집 불가.
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

  const birthdayType = form.watch("birthdayType");

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: Record<string, unknown> = {
        birthday: values.birthday.trim() || null,
        birthdayType: values.birthdayType || null,
        isLeapMonth: values.birthdayType === "LUNAR" ? !!values.isLeapMonth : false,
      };
      // 활동지역은 유효 값일 때만 전송(빈 값으로 덮어쓰지 않음).
      if (values.activityRegion) payload.activityRegion = values.activityRegion;
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

            <FormField
              control={form.control}
              name="birthday"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>생일</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="예: 0815 또는 1990-08-15"
                      {...field}
                      data-testid="input-birthday"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="birthdayType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>양력 / 음력</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-birthday-type">
                        <SelectValue placeholder="선택 안 함" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="SOLAR">양력</SelectItem>
                      <SelectItem value="LUNAR">음력</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            {birthdayType === "LUNAR" && (
              <FormField
                control={form.control}
                name="isLeapMonth"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel className="mb-0">윤달</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-leap-month"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

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
