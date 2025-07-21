import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/layout/app-header";
import { BottomNavigation } from "@/components/layout/bottom-navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Users, AlertCircle } from "lucide-react";

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pendingRegistrations, isLoading } = useQuery({
    queryKey: ["/api/admin/pending-registrations"],
    queryFn: async () => {
      const response = await fetch("/api/admin/pending-registrations", { credentials: "include" });
      return response.json();
    },
    enabled: !!user?.isAdmin,
  });

  const updateRegistrationMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const response = await fetch(`/api/admin/pending-registrations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-registrations"] });
      toast({
        title: "처리 완료",
        description: "회원 가입 요청이 처리되었습니다.",
      });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "처리 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

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
      <AppHeader />
      
      <div className="max-w-md mx-auto px-4 pb-20">
        <div className="py-4">
          <h1 className="text-xl font-bold kakao-brown mb-6">관리자 패널</h1>
          
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pending">가입 승인</TabsTrigger>
              <TabsTrigger value="posts">게시글 관리</TabsTrigger>
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
                  ) : pendingRegistrations?.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">
                      승인 대기 중인 요청이 없습니다.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {pendingRegistrations?.map((registration: any) => (
                        <div key={registration.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="font-bold">{registration.name}</p>
                              <p className="text-sm text-gray-600">{registration.email}</p>
                              <p className="text-xs text-gray-500">
                                {new Date(registration.createdAt).toLocaleDateString()}
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
              <div className="grid gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold">1,247</p>
                      <p className="text-sm text-gray-600">총 회원 수</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold">856</p>
                      <p className="text-sm text-gray-600">인증 완료</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold">₩42,800,000</p>
                      <p className="text-sm text-gray-600">총 회비 수납액</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <BottomNavigation />
    </div>
  );
}
