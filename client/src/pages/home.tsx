import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";



import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Heart, Users, Calendar } from "lucide-react";

export default function Home() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [obituaryUrl, setObituaryUrl] = useState("");

  // 페이지 로드 시 최상단으로 스크롤
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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

  const parseObituaryMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch("/api/obituary/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url }),
      });
      return response.json();
    },
    onSuccess: async (parsedData) => {
      // Create post with parsed data
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...parsedData,
          authorId: user?.id,
        }),
      });

      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        toast({
          title: "부고가 등록되었습니다",
          description: "게시판에서 확인하실 수 있습니다.",
        });
        setObituaryUrl("");
      }
    },
    onError: () => {
      toast({
        title: "부고 등록 실패",
        description: "URL을 다시 확인해주세요.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  const handleObituarySubmit = () => {
    if (!obituaryUrl.trim()) {
      toast({
        title: "URL을 입력해주세요",
        description: "부고 사이트 URL을 입력하세요.",
        variant: "destructive",
      });
      return;
    }
    parseObituaryMutation.mutate(obituaryUrl);
  };

  // Handle loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-kakao-gray">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  // Handle unauthenticated state
  if (!user) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">로그인이 필요합니다</h2>
          <p className="text-gray-600 mb-6">동문회 서비스를 이용하려면 로그인해주세요.</p>
          <Link href="/login" className="bg-kakao-yellow text-kakao-brown px-6 py-3 rounded-lg font-medium hover:bg-yellow-400 transition-colors">
            카카오 로그인
          </Link>
        </div>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();
  const currentYearPayment = userPayments?.find((p: any) => p.year === currentYear);

  return (
    <div className="min-h-screen bg-kakao-gray">


      <div className="max-w-md mx-auto px-4 pb-20 pt-4">

        {/* User Info Section */}
        <div className="bg-white rounded-lg p-4 mb-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {/* Avatar */}
              <div className="w-12 h-12 bg-kakao-yellow rounded-full flex items-center justify-center">
                <span className="text-kakao-brown font-bold text-lg">
                  {user.name?.charAt(0) || "?"}
                </span>
              </div>
              
              {/* User Details */}
              <div>
                <p className="font-bold text-gray-800 text-base">
                  {user.name}
                </p>
                <p className="text-sm text-gray-600">
                  {user.graduationYear}년 졸업
                </p>
              </div>
            </div>
            
            {/* Status Badge */}
            <div className="flex items-center gap-2">
              {user.isVerified ? (
                <Badge className="bg-green-100 text-green-700 text-xs px-3 py-1">
                  인증완료
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs px-3 py-1">
                  인증대기
                </Badge>
              )}
              {user.isAdmin && (
                <Badge className="bg-red-100 text-red-800 text-xs px-3 py-1">
                  관리자
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Membership Status */}
        <Card className="shadow-sm mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">회비 납부 현황</h3>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/profile#payment-section")}>
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
                      {new Date(currentYearPayment.paymentDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">{currentYear}년 연회비 미납</p>
                    <p className="text-sm text-gray-600">회비를 납부해 주세요.</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-yellow-600">50,000원</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Posts Section */}
        <Card className="shadow-sm mb-6" id="recent-posts-section">
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
                <div 
                  key={post.id} 
                  className="p-4 border-b border-gray-50 last:border-b-0 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setLocation(`/post/${post.id}`)}
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-kakao-orange rounded-full mt-2 flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <Badge variant={post.category.badgeVariant as any}>
                          {post.category.displayName}
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
                value={obituaryUrl}
                onChange={(e) => setObituaryUrl(e.target.value)}
              />
              <Button 
                className="bg-kakao-yellow text-kakao-brown font-bold px-6 hover:bg-yellow-400"
                onClick={handleObituarySubmit}
                disabled={parseObituaryMutation.isPending}
              >
                {parseObituaryMutation.isPending ? "처리중..." : "등록"}
              </Button>
            </div>
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
                <div className="w-10 h-10 bg-kakao-yellow rounded-lg flex items-center justify-center">
                  <svg className="text-kakao-brown" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
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




    </div>
  );
}