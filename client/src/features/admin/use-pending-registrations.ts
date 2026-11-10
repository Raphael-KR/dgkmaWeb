import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type {
  AdminPendingRegistrationDto,
  AdminPendingRegistrationUpdateResult,
} from "@shared/contracts";

export function usePendingRegistrations(enabled: boolean) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    data: pendingRegistrations = [],
    isLoading,
    isError,
    error,
  } = useQuery<AdminPendingRegistrationDto[]>({
    queryKey: ["/api/admin/pending-registrations"],
    queryFn: async () => {
      const response = await fetch("/api/admin/pending-registrations", { credentials: "include" });
      const responseBody = (await response.json().catch(() => ({}))) as
        AdminPendingRegistrationDto[] | { message?: unknown };
      if (!response.ok) {
        if (!Array.isArray(responseBody) && typeof responseBody.message === "string") {
          throw new Error(responseBody.message);
        }
        throw new Error("가입 대기 목록을 불러오지 못했습니다.");
      }
      if (!Array.isArray(responseBody)) {
        throw new Error("가입 대기 목록 응답 형식이 올바르지 않습니다.");
      }
      return responseBody;
    },
    enabled,
  });

  const updateRegistrationMutation = useMutation<
    AdminPendingRegistrationUpdateResult,
    Error,
    { id: number; status: string }
  >({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const response = await fetch(`/api/admin/pending-registrations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      const responseBody = (await response.json().catch(() => ({}))) as {
        message?: unknown;
      };
      if (!response.ok) {
        if (typeof responseBody.message === "string") {
          throw new Error(responseBody.message);
        }
        throw new Error("처리 중 오류가 발생했습니다.");
      }
      return responseBody as AdminPendingRegistrationUpdateResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-registrations"] });
      toast({
        title: "처리 완료",
        description: "회원 가입 요청이 처리되었습니다.",
      });
    },
    onError: (error) => {
      toast({
        title: "오류",
        description: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (id: number) => {
    updateRegistrationMutation.mutate({ id, status: "approved" });
  };

  const handleReject = (id: number) => {
    updateRegistrationMutation.mutate({ id, status: "rejected" });
  };

  return {
    pendingRegistrations,
    isLoading,
    isError,
    error,
    updateRegistrationMutation,
    handleApprove,
    handleReject,
  };
}
