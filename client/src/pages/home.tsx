import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/layout/app-header";
import { BottomNavigation } from "@/components/layout/bottom-navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { CreditCard, BellRing, Users, Calendar, Heart, Download, Settings } from "lucide-react";

export default function Home() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();

  const { data: recentPosts, isLoading: postsLoading } = useQuery({
    queryKey: ["/api/posts"],
    queryFn: async () => {
      const response = await fetch("/api/posts?limit=3", { credentials: "include" });
      return response.json();
    },
    enabled: !!user,
  });

  const { data: userPayments } = useQuery({
    queryKey: ["/api/payments/user", user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/payments/user/${user?.id}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-kakao-gray">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  const currentYearPayment = userPayments?.find((p: any) => p.year === currentYear);

  return (
    <div className="min-h-screen bg-kakao-gray">
      <AppHeader />
      
      <div className="max-w-md mx-auto px-4 pb-20">
        {/* User Welcome Section */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 kakao rounded-full flex items-center justify-center">
              <span className="kakao-brown font-bold text-lg">
                {user.name?.charAt(0) || "?"}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-lg">{user.name}</h3>
              <p className="text-gray-600 text-sm">
                {user.graduationYear ? `${user.graduationYear}년 졸업` : "졸업년도 미확인"}
              </p>
            </div>
            <div className="ml-auto">
              <Badge className={user.isVerified ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                {user.isVerified ? "인증완료" : "인증대기"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Button 
            variant="outline"
            className="bg-white rounded-xl shadow-sm p-6 h-auto flex-col space-y-3 hover:shadow-md"
            onClick={() => setLocation("/payments")}
          >
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <CreditCard className="text-blue-600" size={24} />
            </div>
            <div>
              <h4 className="font-bold text-gray-800">회비 납부</h4>
              <p className="text-sm text-gray-600">온라인 결제</p>
            </div>
          </Button>
          
          <Button 
            variant="outline"
            className="bg-white rounded-xl shadow-sm p-6 h-auto flex-col space-y-3 hover:shadow-md"
            onClick={() => setLocation("/boards")}
          >
            <div className="w-12 h-12 kakao rounded-xl flex items-center justify-center">
              <BellRing className="kakao-brown" size={24} />
            </div>
            <div>
              <h4 className="font-bold text-gray-800">공지사항</h4>
              <p className="text-sm text-gray-600">최신 소식</p>
            </div>
          </Button>
        </div>

        {/* Recent Posts Section */}
        <Card className="shadow-sm mb-6">
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-800">최근 게시글</h3>
          </div>
          
          {postsLoading ? (
            <div className="p-6">
              <LoadingSpinner />
            </div>
          ) : (
            <>
              {recentPosts?.map((post: any, index: number) => (
                <div key={post.id} className="p-4 border-b border-gray-50 last:border-b-0">
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-kakao-orange rounded-full mt-2 flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <Badge variant={post.category === "부고" ? "destructive" : post.category === "공지" ? "default" : "secondary"}>
                          {post.category}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {new Date(post.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <h4 className="font-medium text-gray-800 mb-1 line-clamp-2">
                        {post.title}
                      </h4>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {post.content.substring(0, 100)}...
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              
              <div className="p-4 text-center">
                <Button variant="ghost" onClick={() => setLocation("/boards")}>
                  전체 게시글 보기 →
                </Button>
              </div>
            </>
          )}
        </Card>

        {/* Obituary Quick Submit */}
        <Card className="bg-gradient-to-r from-gray-50 to-gray-100 mb-6">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                <Heart className="text-red-600" size={16} />
              </div>
              <h3 className="font-bold text-gray-800">부고 등록</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              부고 사이트 URL을 입력하시면 자동으로 내용을 파싱하여 등록됩니다.
            </p>
            <div className="flex space-x-2">
              <Input 
                type="url" 
                placeholder="부고 사이트 URL 입력" 
                className="flex-1"
              />
              <Button className="kakao kakao-brown font-bold px-6 hover:bg-yellow-400">
                등록
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Membership Status */}
        <Card className="shadow-sm mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">회비 납부 현황</h3>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/payments")}>
                내역보기
              </Button>
            </div>
            {currentYearPayment ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">{currentYear}년 연회비</p>
                    <p className="text-sm text-gray-600">납부완료</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">
                      {currentYearPayment.amount.toLocaleString()}원
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(currentYearPayment.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Button variant="outline" className="w-full">
                  <Download className="mr-2" size={16} />
                  영수증 다운로드
                </Button>
              </div>
            ) : (
              <div className="p-3 bg-yellow-50 rounded-lg">
                <p className="text-yellow-800 font-medium">{currentYear}년 연회비 미납</p>
                <p className="text-sm text-yellow-600">회비를 납부해 주세요.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alumni Directory Quick Access */}
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <h3 className="font-bold text-gray-800 mb-4">동문 연결</h3>
            <div className="grid grid-cols-3 gap-4">
              <Button 
                variant="ghost"
                className="flex-col p-3 h-auto space-y-2"
                onClick={() => setLocation("/directory")}
              >
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Users className="text-blue-600" size={20} />
                </div>
                <p className="text-xs text-gray-600 font-medium">동문 찾기</p>
              </Button>
              
              <Button variant="ghost" className="flex-col p-3 h-auto space-y-2">
                <div className="w-10 h-10 kakao rounded-lg flex items-center justify-center">
                  <svg className="kakao-brown" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3c5.799 0 10.5 3.664 10.5 8.185 0 4.52-4.701 8.184-10.5 8.184a13.5 13.5 0 0 1-1.658-.1L5.5 21l1.072-3.85a7.55 7.55 0 0 1-1.997-5.065C4.575 6.664 9.201 3 15 3z"/>
                  </svg>
                </div>
                <p className="text-xs text-gray-600 font-medium">카톡방 참여</p>
              </Button>
              
              <Button variant="ghost" className="flex-col p-3 h-auto space-y-2">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Calendar className="text-purple-600" size={20} />
                </div>
                <p className="text-xs text-gray-600 font-medium">모임 일정</p>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admin Floating Button */}
      {user.isAdmin && (
        <Button
          className="fixed bottom-24 right-4 w-14 h-14 bg-kakao-orange text-white rounded-full shadow-lg hover:bg-orange-600"
          onClick={() => setLocation("/admin")}
        >
          <Settings size={20} />
        </Button>
      )}

      <BottomNavigation />
    </div>
  );
}
