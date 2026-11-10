import { useScrollToTop } from "@/hooks/use-scroll-to-top";
import { Link } from "wouter";
import { useAuth } from "@/features/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle } from "lucide-react";
import { usePendingRegistrations } from "./use-pending-registrations";
import { useAlumniSync } from "./use-alumni-sync";
import { PendingRegistrationsPanel } from "./pending-registrations-panel";
import { AlumniSyncPanel } from "./alumni-sync-panel";

export default function Admin() {
  const { user } = useAuth();
  // 탭의 표시 여부와 무관하게 요청 상태와 동기화 미리보기를 페이지 수명 동안 유지한다.
  const pending = usePendingRegistrations(!!user?.isAdmin);
  const alumniSync = useAlumniSync(!!user?.isAdmin);
  useScrollToTop();

  if (!user?.isAdmin) {
    return (
      <div className="member-screen screen-center">
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

  return (
    <div className="member-screen">
      <div className="max-w-md mx-auto px-4 pb-20">
        <div className="py-4">
          <h1 className="text-xl font-bold  mb-6">관리자 패널</h1>

          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="pending">가입 승인</TabsTrigger>
              <TabsTrigger value="alumni">동문 데이터</TabsTrigger>
              <TabsTrigger value="posts">게시글</TabsTrigger>
              <TabsTrigger value="stats">통계</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-4 mt-6">
              <PendingRegistrationsPanel {...pending} />
            </TabsContent>

            <TabsContent value="alumni" className="space-y-4 mt-6">
              <AlumniSyncPanel {...alumniSync} />
            </TabsContent>

            <TabsContent value="posts" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>게시글 관리</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-sm text-gray-500">
                    게시글 상세에서 글을 가리거나 다시 표시할 수 있습니다. 다른 작성자의 본문은
                    수정·삭제하지 않습니다.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <Link href="/b">게시글 보기</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href="/b?view=hidden">가린 글 관리</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="stats" className="space-y-4 mt-6">
              <Card>
                <CardContent className="p-6 text-center">
                  <p className="font-semibold">통계 집계 준비 중</p>
                  <p className="mt-1 text-sm text-gray-500">실제 집계 API가 연결되면 표시됩니다.</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
