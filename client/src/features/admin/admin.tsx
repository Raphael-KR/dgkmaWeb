import { useState } from "react";
import { useScrollToTop } from "@/hooks/use-scroll-to-top";
import { Link } from "wouter";
import { useAuth } from "@/features/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle } from "lucide-react";
import { usePendingRegistrations } from "./use-pending-registrations";
import { PendingRegistrationsPanel } from "./pending-registrations-panel";
import { AlumniRosterPanel } from "./alumni-roster-panel";
import { StatisticsPanel } from "./statistics-panel";
import { DuesLedgerPanel } from "./dues-ledger-panel";

export default function Admin() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("pending");
  const pending = usePendingRegistrations(!!user?.isAdmin);
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
      <div className="member-container">
        <div className="py-4">
          <h1 className="text-xl font-bold  mb-6">관리자 패널</h1>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-3 sm:grid-cols-5">
              <TabsTrigger value="pending">가입 승인</TabsTrigger>
              <TabsTrigger value="alumni">동문 데이터</TabsTrigger>
              <TabsTrigger value="posts">게시글</TabsTrigger>
              <TabsTrigger value="stats">통계</TabsTrigger>
              <TabsTrigger value="dues">회비수입</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-4 mt-6">
              <PendingRegistrationsPanel {...pending} />
            </TabsContent>

            <TabsContent value="alumni" className="space-y-4 mt-6">
              <AlumniRosterPanel />
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
              <StatisticsPanel />
            </TabsContent>
            <TabsContent value="dues" className="mt-6">
              <DuesLedgerPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
