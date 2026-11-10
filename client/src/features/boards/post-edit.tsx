import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import type { Post } from "@shared/contracts";
import { useAuth } from "@/features/auth";
import { NoticeEditor } from "@/features/events";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { QueryError } from "@/components/query-error";
import { useSeo } from "@/lib/seo";
import { postRequest, refreshPosts } from "@/lib/post-management";
import { PostEditForm } from "./post-edit-form";

export default function PostEdit() {
  const [, params] = useRoute("/p/:id/edit");
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const {
    data: post,
    isLoading,
    error,
    isFetching,
    refetch,
  } = useQuery<Post>({
    queryKey: ["/api/posts", params?.id],
    enabled: !!user && !!params?.id,
    queryFn: () => postRequest("GET", `/api/posts/${params!.id}`),
  });
  useSeo({
    title: "게시글 수정",
    description: "작성한 게시글 수정",
    noIndex: true,
    path: `/p/${params?.id}/edit`,
  });

  const saved = async () => {
    await refreshPosts();
    navigate(`/p/${post!.id}`);
  };

  if (isLoading)
    return (
      <div className="member-container">
        <LoadingSpinner />
      </div>
    );
  if (error) {
    return (
      <div className="member-container space-y-4">
        <QueryError
          message="수정할 게시글을 불러오지 못했습니다."
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
        <Button onClick={() => navigate("/b")}>게시판으로</Button>
      </div>
    );
  }
  if (!post || post.authorId !== user?.id) {
    return (
      <div className="member-container space-y-4">
        <p role="alert">작성한 게시글만 수정할 수 있습니다.</p>
        <Button onClick={() => navigate("/b")}>게시판으로</Button>
      </div>
    );
  }

  return (
    <div className="member-container space-y-5">
      <h1 className="text-2xl font-bold">게시글 수정</h1>
      {post.isHidden && (
        <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm">
          관리자가 가린 글입니다. 수정해도 가린 상태는 유지됩니다.
        </p>
      )}
      <Suspense fallback={<LoadingSpinner />}>
        {post.eventType ? (
          <NoticeEditor key={`${post.id}:${post.revision}`} post={post} onSaved={saved} />
        ) : (
          <PostEditForm key={`${post.id}:${post.revision}`} post={post} onSaved={saved} />
        )}
      </Suspense>
    </div>
  );
}
