import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ClientUser, Comment, Post } from "@shared/contracts";

type CommentWithAuthor = Comment & { author: { id: number; name: string } | null };

// 상세 화면과 같은 수명으로 유지하고, 가린 글에서는 댓글을 조회하지 않는다.
export function usePostComments(
  postId: string | undefined,
  user: ClientUser | null,
  post: Post | undefined,
) {
  const { toast } = useToast();
  const [commentText, setCommentText] = useState("");

  const {
    data: comments = [],
    isLoading: commentsLoading,
    isError: commentsError,
    isFetching: commentsFetching,
    refetch: refetchComments,
  } = useQuery<CommentWithAuthor[]>({
    queryKey: ["/api/posts", postId, "comments"],
    enabled: !!postId && !!user && !!post && !post.isHidden,
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
      toast({
        title: "댓글 작성 실패",
        description: "댓글을 등록하지 못했습니다.",
        variant: "destructive",
      });
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
      toast({
        title: "삭제 실패",
        description: "댓글을 삭제하지 못했습니다.",
        variant: "destructive",
      });
    },
  });

  const handleSubmitComment = () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    createComment.mutate(trimmed);
  };

  return {
    comments,
    commentsLoading,
    commentsError,
    commentsFetching,
    refetchComments,
    commentText,
    setCommentText,
    createComment,
    deleteComment,
    handleSubmitComment,
  };
}

export type PostCommentsController = ReturnType<typeof usePostComments>;
