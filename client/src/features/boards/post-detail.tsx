import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useAuth } from "@/features/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ArrowLeft, MessageSquare, Send, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useSeo } from "@/lib/seo";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type Comment } from "@shared/contracts";
import { PostBody } from "@/components/post-body";

type CommentWithAuthor = Comment & { author: { id: number; name: string } | null };

export default function PostDetail() {
  const [, postParams] = useRoute("/post/:id");
  const [, shortPostParams] = useRoute("/p/:id");
  const { user } = useAuth();
  const { toast } = useToast();
  const postId = postParams?.id || shortPostParams?.id;
  const [commentText, setCommentText] = useState("");

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

  const { data: comments = [], isLoading: commentsLoading } = useQuery<CommentWithAuthor[]>({
    queryKey: ["/api/posts", postId, "comments"],
    enabled: !!postId,
  });

  const createComment = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/posts/${postId}/comments`, { content });
      return res.json();
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
    },
    onError: () => {
      toast({ title: "댓글 작성 실패", description: "댓글을 등록하지 못했습니다.", variant: "destructive" });
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/comments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
    },
    onError: () => {
      toast({ title: "삭제 실패", description: "댓글을 삭제하지 못했습니다.", variant: "destructive" });
    },
  });

  const handleSubmitComment = () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    createComment.mutate(trimmed);
  };

  useSeo({
    title: "회원 게시글",
    description: "로그인한 회원만 게시글을 확인할 수 있습니다.",
    noIndex: true,
    path: postId ? `/post/${postId}` : undefined,
    type: "article",
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
        <div className="member-container md:max-w-3xl">
          <Card>
            <CardContent className="p-6 text-center">
              <h2 className="text-lg font-bold text-gray-800 mb-2">게시글을 찾을 수 없습니다</h2>
              <p className="text-gray-600 mb-4">요청하신 게시글이 존재하지 않거나 삭제되었습니다.</p>
              <Link href="/b">
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
                <Badge variant={post.category?.badgeVariant as any}>
                  {post.category?.displayName}
                </Badge>
                <span className="text-xs text-gray-500">
                  {new Date(post.publishedAt || post.createdAt).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>

              {/* 제목 */}
              <h1 className="mb-3 break-words text-xl font-bold leading-snug text-gray-800 md:text-3xl">
                {post.title}
              </h1>

              {/* 작성자 정보 */}
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span>작성자: {post.author?.name || "관리자"}</span>
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

        {/* 댓글 */}
        <Card className="min-w-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <MessageSquare size={18} className="mr-2 text-gray-500" />
              <h2 className="font-bold text-gray-800">댓글 {comments.length}</h2>
            </div>

            {/* 작성 폼 */}
            <div className="mb-6">
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="댓글을 입력하세요..."
                aria-label="댓글 내용"
                className="min-h-[80px] resize-none mb-2"
                maxLength={1000}
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleSubmitComment}
                  disabled={createComment.isPending || !commentText.trim()}
                  className="bg-kakao-yellow text-kakao-brown hover:bg-yellow-400"
                  size="sm"
                >
                  {createComment.isPending ? (
                    <LoadingSpinner className="mr-2 h-4 w-4" />
                  ) : (
                    <Send size={14} className="mr-1" />
                  )}
                  등록
                </Button>
              </div>
            </div>

            {/* 목록 */}
            {commentsLoading ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-6">첫 댓글을 남겨보세요.</p>
            ) : (
              <div className="space-y-4">
                {comments.map((c) => (
                  <div key={c.id} className="border-b border-gray-100 pb-3 last:border-0">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 break-words text-sm font-medium text-gray-800">
                        {c.author?.name || "회원"}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {new Date(c.createdAt!).toLocaleDateString('ko-KR', {
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {(user?.isAdmin || user?.id === c.authorId) && (
                          <button
                            onClick={() => deleteComment.mutate(c.id)}
                            disabled={deleteComment.isPending}
                            className="text-gray-400 hover:text-red-500"
                            aria-label="댓글 삭제"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-gray-700 [overflow-wrap:anywhere]">
                      {c.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
