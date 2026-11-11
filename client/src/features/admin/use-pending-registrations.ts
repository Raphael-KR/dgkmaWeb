import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ADMIN_STATISTICS_PATH } from "@shared/contracts/admin-statistics";
import type {
  AdminPendingRegistrationReviewDto,
  AdminPendingRegistrationUpdateResult,
  RegistrationApprovalStatus,
} from "@shared/contracts";

export function usePendingRegistrations(enabled: boolean) {
  const { toast } = useToast();
  const [status, setStatus] = useState<RegistrationApprovalStatus>("pending");
  const queryClient = useQueryClient();
  const {
    data: pendingRegistrations = [],
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery<AdminPendingRegistrationReviewDto[]>({
    queryKey: ["/api/admin/pending-registrations", "review", status],
    queryFn: async () => {
      const response = await fetch(`/api/admin/pending-registrations?status=${status}`, {
        credentials: "include",
      });
      const responseBody = (await response.json().catch(() => ({}))) as
        AdminPendingRegistrationReviewDto[] | { message?: unknown };
      if (!response.ok) {
        if (!Array.isArray(responseBody) && typeof responseBody.message === "string") {
          throw new Error(responseBody.message);
        }
        throw new Error("가입 목록을 불러오지 못했습니다.");
      }
      if (!Array.isArray(responseBody)) {
        throw new Error("가입 목록 응답 형식이 올바르지 않습니다.");
      }
      const invalidReviewIndex = responseBody.findIndex(
        (registration) =>
          !registration?.review ||
          !Array.isArray(registration.review.candidates) ||
          !["registration", "member"].includes(registration.recordType),
      );
      if (invalidReviewIndex !== -1) {
        const review = responseBody[invalidReviewIndex]?.review;
        console.error("Invalid pending registration review response", {
          expected: "review.candidates array",
          index: invalidReviewIndex,
          reviewType: typeof review,
          candidatesType: typeof review?.candidates,
        });
        throw new Error("명부 대조 정보를 불러오지 못했습니다. 다시 대조해 주세요.");
      }
      return responseBody;
    },
    enabled,
  });

  const updateRegistrationMutation = useMutation<
    AdminPendingRegistrationUpdateResult,
    Error,
    { id: number; action: "approve" | "reject" | "reopen" | "cancel" | "delete" }
  >({
    mutationFn: async ({ id, action }) => {
      const nextStatus = {
        approve: "approved",
        reject: "rejected",
        reopen: "pending",
        cancel: "pending",
        delete: undefined,
      }[action];
      const path =
        action === "cancel"
          ? `/api/admin/members/${id}/cancel-approval`
          : `/api/admin/pending-registrations/${id}`;
      const response = await fetch(path, {
        method: action === "cancel" ? "POST" : action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: action === "delete" ? undefined : JSON.stringify({ status: nextStatus }),
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-registrations"] });
      queryClient.invalidateQueries({ queryKey: [ADMIN_STATISTICS_PATH] });
      toast({
        title: "처리 완료",
        description:
          variables.action === "delete"
            ? "신청정보와 카카오 연결을 삭제했습니다. 기존 회원 자료는 보존했습니다."
            : variables.action === "cancel" || variables.action === "reopen"
              ? "승인 대기로 변경되었습니다."
              : variables.action === "reject"
                ? "승인 거부로 변경되었습니다."
                : "승인되었습니다.",
      });
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-registrations"] });
      toast({
        title: "오류",
        description: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (id: number) => {
    updateRegistrationMutation.mutate({ id, action: "approve" });
  };

  const handleReject = (id: number) => {
    updateRegistrationMutation.mutate({ id, action: "reject" });
  };

  const handleReopen = (id: number) => updateRegistrationMutation.mutate({ id, action: "reopen" });
  const handleCancel = (id: number) => updateRegistrationMutation.mutate({ id, action: "cancel" });

  const handleDelete = (id: number) => updateRegistrationMutation.mutate({ id, action: "delete" });

  return {
    handleDelete,
    status,
    setStatus,
    handleReopen,
    handleCancel,
    pendingRegistrations,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
    updateRegistrationMutation,
    handleApprove,
    handleReject,
  };
}
