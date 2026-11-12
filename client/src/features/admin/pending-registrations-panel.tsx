import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Check, X, Users, AlertCircle, RotateCcw } from "lucide-react";
import type { usePendingRegistrations } from "./use-pending-registrations";
import { useAuth } from "@/features/auth";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { REGISTRATION_APPROVAL_STATUSES } from "@shared/contracts";
import { DeleteRegistrationButton } from "./delete-registration-button";
import { PendingRegistrationReview } from "./pending-registration-review";
import { ApprovedMemberDetails } from "./approved-member-details";

const statusLabels = {
  pending: "승인 대기",
  approved: "인증 완료",
  rejected: "승인 거부",
} as const;

export function PendingRegistrationsPanel({
  status,
  setStatus,
  handleReopen,
  handleCancel,
  handleDelete,
  pendingRegistrations,
  isLoading,
  isError,
  error,
  isFetching,
  refetch,
  updateRegistrationMutation,
  handleApprove,
  handleReject,
}: ReturnType<typeof usePendingRegistrations>) {
  const { user } = useAuth();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Users size={20} />
          <span>가입 승인 관리</span>
          {pendingRegistrations?.length > 0 && (
            <Badge variant="destructive">{pendingRegistrations.length}</Badge>
          )}
        </CardTitle>
        <Tabs
          value={status}
          onValueChange={(value) => {
            const selected = REGISTRATION_APPROVAL_STATUSES.find((item) => item === value);
            if (selected) setStatus(selected);
          }}
        >
          <TabsList className="grid w-full grid-cols-3">
            {REGISTRATION_APPROVAL_STATUSES.map((value) => (
              <TabsTrigger
                key={value}
                value={value}
                disabled={isFetching || updateRegistrationMutation.isPending}
              >
                {statusLabels[value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => void refetch()}
          disabled={isFetching || updateRegistrationMutation.isPending}
        >
          {isFetching
            ? "조회 중..."
            : status === "approved"
              ? "회원 정보 새로고침"
              : "명부 다시 대조"}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>가입 목록 조회 실패</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : "가입 목록을 불러오지 못했습니다."}
            </AlertDescription>
          </Alert>
        ) : pendingRegistrations?.length === 0 ? (
          <p className="text-center text-gray-500 py-4">
            {statusLabels[status]}인 항목이 없습니다.
          </p>
        ) : (
          <div className="space-y-4">
            {pendingRegistrations?.map((registration) => (
              <div
                key={`${registration.recordType}-${registration.id}`}
                className="border rounded-lg p-4"
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="min-w-0 break-words">
                    {registration.recordType === "member" ? (
                      <p className="font-bold">회원 정보</p>
                    ) : (
                      <>
                        <p className="font-bold">{registration.name}</p>
                        <p className="text-sm text-gray-600">{registration.email}</p>
                      </>
                    )}
                    <p className="text-xs text-gray-500">
                      {registration.recordType === "member" ? "가입일: " : "신청일: "}
                      {registration.createdAt
                        ? new Date(registration.createdAt).toLocaleDateString()
                        : "날짜 정보 없음"}
                    </p>
                  </div>
                  <Badge variant="outline">{statusLabels[status]}</Badge>
                </div>
                {registration.recordType === "member" ? (
                  <ApprovedMemberDetails member={registration} />
                ) : (
                  <PendingRegistrationReview review={registration.review} />
                )}
                <div className="flex flex-wrap gap-2">
                  {status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleApprove(registration.id)}
                        disabled={
                          updateRegistrationMutation.isPending ||
                          isFetching ||
                          registration.recordType !== "registration" ||
                          registration.review.status !== "ready"
                        }
                      >
                        <Check className="mr-1" size={16} />
                        승인
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => handleReject(registration.id)}
                        disabled={isFetching || updateRegistrationMutation.isPending}
                      >
                        <X className="mr-1" size={16} />
                        거부
                      </Button>
                    </>
                  )}
                  {status === "rejected" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleReopen(registration.id)}
                      disabled={isFetching || updateRegistrationMutation.isPending}
                    >
                      <RotateCcw className="mr-1" size={16} />
                      재심사
                    </Button>
                  )}
                  {status === "rejected" && (
                    <DeleteRegistrationButton
                      disabled={isFetching || updateRegistrationMutation.isPending}
                      onDelete={() => handleDelete(registration.id)}
                    />
                  )}
                  {status === "approved" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        if (registration.memberId !== null) handleCancel(registration.memberId);
                      }}
                      disabled={
                        isFetching ||
                        updateRegistrationMutation.isPending ||
                        registration.memberId === null ||
                        registration.memberId === user?.id
                      }
                    >
                      <RotateCcw className="mr-1" size={16} />
                      승인 취소
                    </Button>
                  )}
                </div>
                {status === "approved" && registration.memberId === user?.id && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    본인의 승인은 취소할 수 없습니다.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
