import { useEffect, useReducer } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, RefreshCw, FileSpreadsheet, Users, AlertCircle } from "lucide-react";
import type { AdminPendingRegistrationDto, AdminPendingRegistrationUpdateResult } from "@shared/schema";
import {
  alumniSyncInitialState,
  alumniSyncReducer,
  getAlumniSyncControls,
  type AlumniSyncPreview,
} from "./admin-alumni-sync-state";

type AlumniSyncApplyResponse = {
  report: AlumniSyncPreview["report"];
};

async function readAdminResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => ({})) as { message?: unknown };
  if (!response.ok) {
    throw new Error(typeof body.message === "string" ? body.message : fallback);
  }
  return body as T;
}

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [alumniSyncState, dispatchAlumniSync] = useReducer(
    alumniSyncReducer,
    alumniSyncInitialState,
  );
  const preview = alumniSyncState.preview;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: pendingRegistrations = [], isLoading, isError, error } =
    useQuery<AdminPendingRegistrationDto[]>({
    queryKey: ["/api/admin/pending-registrations"],
    queryFn: async () => {
      const response = await fetch("/api/admin/pending-registrations", { credentials: "include" });
      const responseBody = await response.json().catch(() => ({})) as
        | AdminPendingRegistrationDto[]
        | { message?: unknown };
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
    enabled: !!user?.isAdmin,
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
      const responseBody = await response.json().catch(() => ({})) as {
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

  // Google Sheets 연결 테스트
  const { data: googleSheetsStatus, refetch: refetchGoogleSheetsStatus } = useQuery({
    queryKey: ["/api/admin/test-google-sheets"],
    queryFn: async () => {
      const response = await fetch("/api/admin/test-google-sheets", { credentials: "include" });
      return response.json();
    },
    enabled: !!user?.isAdmin,
  });

  const previewAlumniMutation = useMutation<AlumniSyncPreview, Error>({
    mutationFn: async () => {
      const response = await fetch("/api/admin/sync-alumni/preview", {
        method: "POST",
        credentials: "include",
      });
      return readAdminResponse<AlumniSyncPreview>(
        response,
        "변경 미리보기를 불러오지 못했습니다.",
      );
    },
    onMutate: () => dispatchAlumniSync({ type: "preview-started" }),
    onSuccess: (nextPreview) => dispatchAlumniSync({
      type: "preview-succeeded",
      preview: nextPreview,
    }),
    onError: (error) => {
      dispatchAlumniSync({ type: "preview-failed", message: error.message });
      toast({
        title: "미리보기 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const applyAlumniMutation = useMutation<AlumniSyncApplyResponse, Error>({
    mutationFn: async () => {
      if (!preview?.fingerprint) throw new Error("유효한 미리보기가 필요합니다.");
      const response = await fetch("/api/admin/sync-alumni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fingerprint: preview.fingerprint }),
      });
      return readAdminResponse<AlumniSyncApplyResponse>(
        response,
        "변경 사항을 적용하지 못했습니다.",
      );
    },
    onMutate: () => dispatchAlumniSync({ type: "apply-started" }),
    onSuccess: ({ report }) => {
      dispatchAlumniSync({ type: "apply-succeeded" });
      queryClient.invalidateQueries({ queryKey: ["/api/alumni"] });
      refetchGoogleSheetsStatus();
      toast({
        title: "명부 반영 완료",
        description: `${report.insert}건 추가, ${report.update}건 수정했습니다.`,
      });
    },
    onError: (error) => {
      dispatchAlumniSync({ type: "apply-failed", message: error.message });
      toast({
        title: "동기화 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { canPreview, canApply } = getAlumniSyncControls(
    alumniSyncState,
    Boolean(googleSheetsStatus?.connected),
  );

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen bg-kakao-gray flex items-center justify-center">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
            <h2 className="text-xl font-bold mb-2">접근 권한 없음</h2>
            <p className="text-gray-600">관리자만 접근할 수 있습니다.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleApprove = (id: number) => {
    updateRegistrationMutation.mutate({ id, status: "approved" });
  };

  const handleReject = (id: number) => {
    updateRegistrationMutation.mutate({ id, status: "rejected" });
  };

  return (
    <div className="min-h-screen bg-kakao-gray">
      <div className="max-w-md mx-auto px-4 pb-20">
        <div className="py-4">
          <h1 className="text-xl font-bold kakao-brown mb-6">관리자 패널</h1>
          
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="pending">가입 승인</TabsTrigger>
              <TabsTrigger value="alumni">동문 데이터</TabsTrigger>
              <TabsTrigger value="posts">게시글</TabsTrigger>
              <TabsTrigger value="stats">통계</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-4 mt-6">
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
                    <p className="text-center text-gray-500 py-4">
                      승인 대기 중인 요청이 없습니다.
                    </p>
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
            </TabsContent>

            <TabsContent value="alumni" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <FileSpreadsheet size={20} />
                    <span>Google Sheets 동문 데이터베이스</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 연결 상태 */}
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold mb-2">연결 상태</h3>
                    {googleSheetsStatus ? (
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${googleSheetsStatus.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="text-sm">
                          {googleSheetsStatus.message}
                          {googleSheetsStatus.sampleCount && ` (${googleSheetsStatus.sampleCount}건 확인)`}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <LoadingSpinner />
                        <span className="text-sm">연결 상태 확인 중...</span>
                      </div>
                    )}
                  </div>

                  {/* 동기화 기능 */}
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold mb-2">데이터 동기화</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      적용 전에 추가·수정 건수와 차단 오류를 확인합니다.
                    </p>

                    {alumniSyncState.errorMessage && (
                      <Alert variant="destructive" className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>동기화 요청 실패</AlertTitle>
                        <AlertDescription>{alumniSyncState.errorMessage}</AlertDescription>
                      </Alert>
                    )}

                    {preview && (
                      <div className="mb-4 space-y-3" aria-live="polite">
                        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border bg-gray-200">
                          {[
                            ["원본", preview.report.sourceTotal],
                            ["DB", preview.report.databaseTotal],
                            ["추가", preview.report.insert],
                            ["수정", preview.report.update],
                            ["동일", preview.report.unchanged],
                            ["충돌", preview.report.conflict],
                            ["오류", preview.report.invalid],
                            ["원본만", preview.report.sourceOnly],
                            ["DB만", preview.report.databaseOnly],
                          ].map(([label, value]) => (
                            <div key={label} className="bg-white px-2 py-3 text-center">
                              <div className="text-lg font-semibold">{value}</div>
                              <div className="text-xs text-gray-500">{label}</div>
                            </div>
                          ))}
                        </div>
                        {preview.report.blocked && (
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>적용할 수 없는 명부입니다</AlertTitle>
                            <AlertDescription>
                              차단 오류 {preview.report.issues.reduce(
                                (total, issue) => total + issue.count,
                                0,
                              )}건을 원본에서 확인해주세요.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => previewAlumniMutation.mutate()}
                        disabled={!canPreview}
                      >
                        {alumniSyncState.phase === "previewing" ? (
                          <LoadingSpinner className="mr-2" />
                        ) : (
                          <RefreshCw className="mr-2" size={16} />
                        )}
                        변경 미리보기
                      </Button>
                      <Button
                        onClick={() => applyAlumniMutation.mutate()}
                        disabled={!canApply}
                      >
                        {alumniSyncState.phase === "applying" ? (
                          <LoadingSpinner className="mr-2" />
                        ) : (
                          <Check className="mr-2" size={16} />
                        )}
                        변경 적용
                      </Button>
                    </div>
                  </div>

                  {/* 설정 안내 */}
                  {!googleSheetsStatus?.connected && (
                    <div className="border rounded-lg p-4 bg-yellow-50">
                      <h3 className="font-semibold mb-2 text-yellow-800">설정 필요</h3>
                      <div className="text-sm text-yellow-700 space-y-1">
                        <p>• Google Cloud Console에서 서비스 계정 생성</p>
                        <p>• Google Sheets API 활성화</p>
                        <p>• 동문 명단 스프레드시트에 뷰어 권한 부여</p>
                        <p>• 환경 변수 설정 완료 후 연결 가능</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="posts" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>게시글 관리</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-center text-gray-500 py-4">
                    게시글 관리 기능은 준비 중입니다.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="stats" className="space-y-4 mt-6">
              <Card>
                <CardContent className="p-6 text-center">
                  <p className="font-semibold">통계 집계 준비 중</p>
                  <p className="mt-1 text-sm text-gray-500">
                    실제 집계 API가 연결되면 표시됩니다.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>


    </div>
  );
}
