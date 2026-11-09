import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { useToast } from "@/hooks/use-toast";



import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { HeartHandshake, Users, Calendar } from "lucide-react";
import { MembershipBadge } from "@/components/membership-badge";
import { KAKAO_CHANNEL_URL } from "@/lib/config";
import type { MembershipStatus } from "@shared/contracts";
import { isBirthdayToday } from "@shared/birthday";
import { PostExcerpt } from "@/components/post-body";
import { useSeo } from "@/lib/seo";
import { SITE_NAME } from "@shared/site";

export default function Home() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();

  useSeo({ title: SITE_NAME, path: "/" });

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

  const { data: membership, isLoading: membershipLoading } = useQuery<MembershipStatus>({
    queryKey: ["/api/membership/status"],
    enabled: !!user?.id,
  });

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
          <Button variant="kakao" asChild>
            <Link href="/login">카카오 로그인</Link>
          </Button>
        </div>
      </div>
    );
  }

  const currentYear = membership?.year ?? new Date().getFullYear();
  const currentYearPayment = membership?.isPaid ? membership.currentYearPayment : null;

  return (
    <div className="min-h-screen bg-kakao-gray">


      <div className="member-container">
        <div className="mb-6 hidden md:block">
          <h1 className="text-3xl font-bold text-gray-900">동문 커뮤니티</h1>
          <p className="mt-2 text-sm text-gray-500">동문 소식을 만나고 함께 이야기 나누세요.</p>
        </div>

        {isBirthdayToday(user) && (
          <div className="mb-4 border-l-4 border-kakao-yellow bg-white px-4 py-3 shadow-sm" role="status">
            <p className="font-bold text-gray-900">{user.name}님, 생일을 축하합니다!</p>
            <p className="text-sm text-gray-600">행복하고 건강한 하루 보내세요.</p>
          </div>
        )}

        {/* User Info Section */}
        <div className="mb-6 rounded-lg bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center space-x-3">
              {/* Avatar */}
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-kakao-yellow">
                <span className="text-kakao-brown font-bold text-lg">
                  {user.name?.charAt(0) || "?"}
                </span>
              </div>

              {/* User Details */}
              <div className="min-w-0">
                <p className="break-words text-base font-bold text-gray-800 md:text-lg">
                  {user.name}
                </p>
                <p className="text-sm text-gray-600">
                  {user.graduationYear}년 졸업
                </p>
              </div>
            </div>

            {/* Status Badge */}
            <div className="flex flex-wrap items-center gap-2">
              {user.isVerified ? (
                <Badge className="bg-green-100 text-green-700 text-xs px-3 py-1">
                  인증완료
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs px-3 py-1">
                  인증대기
                </Badge>
              )}
              {membership && <MembershipBadge tier={membership.tier} />}
              {user.isAdmin && (
                <Link
                  href="/admin"
                  aria-label="관리자 화면으로 이동"
                  className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                  data-testid="link-admin-panel"
                >
                  <Badge className="bg-red-100 text-red-800 text-xs px-3 py-1 transition-colors hover:bg-red-200">
                    관리자
                  </Badge>
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* Membership Status */}
        <Card className="min-w-0 shadow-sm md:col-start-1 md:row-start-1">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">회비 납부 현황</h3>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/profile#payment-section")}>
                내역보기
              </Button>
            </div>
            {membershipLoading || !membership ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner />
              </div>
            ) : currentYearPayment ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">{currentYear}년 연회비</p>
                    <p className="text-sm text-gray-600">납부완료</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">
                      {membership.paidAmount.toLocaleString()}원
                    </p>
                    {currentYearPayment.createdAt && (
                      <p className="text-xs text-gray-500">
                        {new Date(currentYearPayment.createdAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">{currentYear}년 연회비 미납</p>
                    <p className="text-sm text-gray-600">회비를 납부하시면 권리회원이 됩니다.</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-yellow-600">
                      {(membership?.annualDues ?? 50000).toLocaleString()}원
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full bg-kakao-yellow text-kakao-brown font-bold hover:bg-yellow-400"
                  onClick={() => setLocation("/about/dues")}
                  data-testid="button-dues-cta"
                >
                  회비 납부 안내 보기
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Posts Section */}
        <Card className="min-w-0 site-scroll-target shadow-sm md:col-start-2 md:row-span-3 md:row-start-1" id="recent-posts-section">
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-800">최근 게시글</h3>
          </div>

          {postsLoading ? (
            <div className="p-6">
              <LoadingSpinner />
            </div>
          ) : (
            <>
              {recentPosts?.map((post: any) => (
                <Link
                  key={post.id}
                  className="block border-b border-gray-50 p-4 transition-colors last:border-b-0 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:p-6"
                  href={`/p/${post.id}`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-kakao-orange rounded-full mt-2 flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant={post.category.badgeVariant as any}>
                          {post.category.displayName}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {new Date(post.publishedAt || post.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <h4 className="mb-1 line-clamp-2 break-words font-medium text-gray-800 md:text-lg">
                        {post.title}
                      </h4>
                      <PostExcerpt content={post.content} className="line-clamp-2 text-sm text-gray-600 [overflow-wrap:anywhere]" />
                    </div>
                  </div>
                </Link>
              ))}

              <div className="p-4 text-center">
                <Button variant="ghost" onClick={() => setLocation("/b")}>
                  전체 게시글 보기 →
                </Button>
              </div>
            </>
          )}
        </Card>

        <Button
          className="w-full bg-kakao-yellow font-bold text-kakao-brown hover:bg-yellow-400 md:col-start-1 md:row-start-2"
          onClick={() => setLocation("/b")}
          aria-label="경조사 페이지로 이동"
        >
          <HeartHandshake size={18} className="mr-2" />
          경조사
        </Button>



        {/* Alumni Directory Quick Access */}
        <Card className="min-w-0 shadow-sm md:col-start-1 md:row-start-3">
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

              <Button
                variant="ghost"
                className="flex-col p-3 h-auto space-y-2"
                onClick={() => {
                  if (KAKAO_CHANNEL_URL) {
                    window.open(KAKAO_CHANNEL_URL, "_blank", "noopener,noreferrer");
                  } else {
                    toast({
                      title: "카톡방 준비 중입니다",
                      description: "동문 카카오톡 채널이 곧 연결될 예정입니다.",
                    });
                  }
                }}
                data-testid="button-kakao-channel"
              >
                <div className="w-10 h-10 bg-kakao-yellow rounded-lg flex items-center justify-center">
                  <svg className="text-kakao-brown" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3c5.799 0 10.5 3.664 10.5 8.185 0 4.52-4.701 8.184-10.5 8.184a13.5 13.5 0 0 1-1.658-.1L5.5 21l1.072-3.85a7.55 7.55 0 0 1-1.997-5.065C4.575 6.664 9.201 3 15 3z" />
                  </svg>
                </div>
                <p className="text-xs text-gray-600 font-medium">카톡방 참여</p>
              </Button>

              <Button
                variant="ghost"
                className="flex-col p-3 h-auto space-y-2"
                onClick={() => setLocation("/b")}
                data-testid="button-meeting-schedule"
              >
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




    </div>
  );
}
