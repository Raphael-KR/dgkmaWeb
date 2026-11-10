import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Check, X, Users, AlertCircle } from "lucide-react";
import type { usePendingRegistrations } from "./use-pending-registrations";

export function PendingRegistrationsPanel({
  pendingRegistrations,
  isLoading,
  isError,
  error,
  updateRegistrationMutation,
  handleApprove,
  handleReject,
}: ReturnType<typeof usePendingRegistrations>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Users size={20} />
          <span>가입 승인 대기</span>
          {pendingRegistrations?.length > 0 && (
            <Badge variant="destructive">{pendingRegistrations.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>가입 대기 목록 조회 실패</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : "가입 대기 목록을 불러오지 못했습니다."}
            </AlertDescription>
          </Alert>
        ) : pendingRegistrations?.length === 0 ? (
          <p className="text-center text-gray-500 py-4">승인 대기 중인 요청이 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {pendingRegistrations?.map((registration) => (
              <div key={registration.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-bold">{registration.name}</p>
                    <p className="text-sm text-gray-600">{registration.email}</p>
                    <p className="text-xs text-gray-500">
                      {registration.createdAt
                        ? new Date(registration.createdAt).toLocaleDateString()
                        : "날짜 정보 없음"}
                    </p>
                  </div>
                  <Badge variant="outline">대기중</Badge>
                </div>
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => handleApprove(registration.id)}
                    disabled={updateRegistrationMutation.isPending}
                  >
                    <Check className="mr-1" size={16} />
                    승인
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                    onClick={() => handleReject(registration.id)}
                    disabled={updateRegistrationMutation.isPending}
                  >
                    <X className="mr-1" size={16} />
                    거부
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
