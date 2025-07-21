import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function PostDetail() {
  const [, params] = useRoute("/post/:id");
  const { user } = useAuth();
  const postId = params?.id;

  // 페이지 로드 시 최상단으로 스크롤
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: post, isLoading, error } = useQuery({
    queryKey: ["/api/posts", postId],
    queryFn: async () => {
      const response = await fetch(`/api/posts/${postId}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("게시글을 불러올 수 없습니다");
      }
      return response.json();
    },
    enabled: !!postId && !!user,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-kakao-gray flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-kakao-gray">
        <div className="max-w-md mx-auto px-4 pt-8">
          <Card>
            <CardContent className="p-6 text-center">
              <h2 className="text-lg font-bold text-gray-800 mb-2">게시글을 찾을 수 없습니다</h2>
              <p className="text-gray-600 mb-4">요청하신 게시글이 존재하지 않거나 삭제되었습니다.</p>
              <Link href="/boards">
                <Button className="bg-kakao-yellow text-kakao-brown hover:bg-yellow-400">
                  <ArrowLeft size={16} className="mr-2" />
                  게시판으로 돌아가기
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-kakao-gray">
      <div className="max-w-md mx-auto px-4 pb-20 pt-4">
        {/* 뒤로가기 버튼 */}
        <div className="mb-4">
          <Link href="/boards">
            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-800">
              <ArrowLeft size={16} className="mr-2" />
              게시판으로 돌아가기
            </Button>
          </Link>
        </div>

        {/* 게시글 상세 */}
        <Card className="shadow-sm">
          <CardContent className="p-6">
            {/* 헤더 정보 */}
            <div className="mb-4">
              <div className="flex items-center space-x-2 mb-3">
                <Badge variant={post.category?.badgeVariant as any}>
                  {post.category?.displayName}
                </Badge>
                <span className="text-xs text-gray-500">
                  {new Date(post.createdAt).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              
              {/* 제목 */}
              <h1 className="text-xl font-bold text-gray-800 mb-2">
                {post.title}
              </h1>
              
              {/* 작성자 정보 */}
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span>작성자: {post.author?.name || "관리자"}</span>
              </div>
            </div>

            <hr className="mb-6" />

            {/* 본문 내용 */}
            <div className="prose prose-sm max-w-none">
              <div className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                {post.content}
              </div>
            </div>

            {/* 하단 액션 버튼들 */}
            <div className="mt-8 pt-6 border-t border-gray-100">
              <div className="flex justify-between items-center">
                <Link href="/boards">
                  <Button variant="outline">
                    <ArrowLeft size={16} className="mr-2" />
                    목록으로
                  </Button>
                </Link>
                
                {/* 관리자나 작성자만 수정/삭제 가능 (추후 구현) */}
                {(user?.isAdmin || user?.id === post.authorId) && (
                  <div className="space-x-2">
                    <Button variant="outline" size="sm">
                      수정
                    </Button>
                    <Button variant="destructive" size="sm">
                      삭제
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}