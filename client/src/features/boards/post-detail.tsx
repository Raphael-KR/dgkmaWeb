import { CategoryBadge } from "@/components/category-badge";
import { useScrollToTop } from "@/hooks/use-scroll-to-top";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useAuth } from "@/features/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useSeo } from "@/lib/seo";
import { type Post, type Category } from "@shared/contracts";
import { PostBody } from "@/components/post-body";
import { usePostComments } from "./use-post-comments";
import { usePostManagement } from "./use-post-management";
import { PostComments } from "./post-comments";
import { PostManagementButtons, PostManagementDialog } from "./post-management-controls";

export default function PostDetail() {
  const [, postParams] = useRoute("/post/:id");
  const [, shortPostParams] = useRoute("/p/:id");
  const { user } = useAuth();
  const postId = postParams?.id || shortPostParams?.id;

  // 페이지 로드 시 최상단으로 스크롤
  useScrollToTop();

  const {
    data: post,
    isLoading,
    error,
  } = useQuery<Post & { category: Category }>({
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

  const comments = usePostComments(postId, user, post);
  const management = usePostManagement(postId, post);

  useSeo({
    title: "회원 게시글",
    description: "로그인한 회원만 게시글을 확인할 수 있습니다.",
    noIndex: true,
    path: postId ? `/post/${postId}` : undefined,
    type: "article",
  });

  if (isLoading) {
    return (
      <div className="member-screen screen-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="member-screen">
        <div className="member-container md:max-w-3xl">
          <Card>
            <CardContent className="p-6 text-center">
              <h2 className="text-lg font-bold text-gray-800 mb-2">게시글을 찾을 수 없습니다</h2>
              <p className="text-gray-600 mb-4">
                요청하신 게시글이 없거나 표시할 수 없는 상태입니다.
              </p>
              <Link href="/b">
                <Button variant="community">
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
    <div className="member-screen">
      <div className="member-container">
        {/* 뒤로가기 버튼 */}
        <div className="mb-4">
          <Link href="/b">
            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-800">
              <ArrowLeft size={16} className="mr-2" />
              게시판으로 돌아가기
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 md:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
          {/* 게시글 상세 */}
          <Card className="min-w-0 shadow-sm">
            <CardContent className="p-6 md:p-8 lg:p-10">
              {/* 헤더 정보 */}
              <div className="mb-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <CategoryBadge category={post.category} />
                  {post.isHidden && (
                    <Badge variant="secondary">가린 글 · 작성자/관리자만 열람</Badge>
                  )}
                  <span className="text-xs text-gray-500">
                    {new Date(post.publishedAt || post.createdAt || "").toLocaleDateString(
                      "ko-KR",
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}
                  </span>
                </div>

                {/* 제목 */}
                <h1 className="mb-3 break-words text-xl font-bold leading-snug text-gray-800 md:text-3xl">
                  {post.title}
                </h1>

                {/* 작성자 정보 */}
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <span>
                    작성자:{" "}
                    {post.authorId === user?.id ? "본인" : post.authorId ? "회원" : "탈퇴한 회원"}
                  </span>
                </div>
              </div>

              <hr className="mb-6" />

              {/* 본문 내용 */}
              <PostBody content={post.content} className="md:text-base" />

              {/* 첨부 이미지 */}
              {Array.isArray(post.imageUrls) && post.imageUrls.length > 0 && (
                <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
                  {post.imageUrls.map((url: string, i: number) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block min-w-0"
                    >
                      <img
                        src={url}
                        alt={`첨부 이미지 ${i + 1}`}
                        className="h-40 w-full rounded-md border border-gray-200 object-cover md:h-48"
                      />
                    </a>
                  ))}
                </div>
              )}

              {/* 하단 액션 버튼들 */}
              <div className="mt-8 pt-6 border-t border-gray-100">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link href="/b">
                    <Button variant="outline">
                      <ArrowLeft size={16} className="mr-2" />
                      목록으로
                    </Button>
                  </Link>

                  <PostManagementButtons post={post} user={user} controller={management} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 가린 글에는 댓글을 조회하거나 추가하지 않는다. */}
          {!post.isHidden && <PostComments controller={comments} user={user} />}
        </div>
        <PostManagementDialog controller={management} />
      </div>
    </div>
  );
}
