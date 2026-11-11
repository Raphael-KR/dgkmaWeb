import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { postRequest } from "@/lib/post-management";
import { useToast } from "@/hooks/use-toast";
import type { ClientUser, CommentWithAuthor, InsertComment, Post } from "@shared/contracts";

type Change =
  | { operation: "create"; input: InsertComment }
  | { operation: "edit"; id: number; revision: number; input: InsertComment }
  | { operation: "delete"; id: number; revision: number }
  | { operation: "visibility"; id: number; revision: number; isHidden: boolean };

export function usePostComments(
  postId: string | undefined,
  user: ClientUser | null,
  post: Post | undefined,
) {
  const { toast } = useToast();
  const queryKey = ["/api/posts", postId, "comments"];
  const query = useQuery<CommentWithAuthor[]>({
    queryKey,
    enabled: !!postId && !!user && !!post && !post.isHidden,
  });
  const mutation = useMutation({
    mutationFn: (change: Change) => {
      switch (change.operation) {
        case "create":
          return postRequest("POST", `/api/posts/${postId}/comments`, change.input);
        case "edit":
          return postRequest("PATCH", `/api/comments/${change.id}`, {
            ...change.input,
            revision: change.revision,
          });
        case "delete":
          return postRequest("DELETE", `/api/comments/${change.id}`, { revision: change.revision });
        case "visibility":
          return postRequest("PATCH", `/api/comments/${change.id}/visibility`, {
            revision: change.revision,
            isHidden: change.isHidden,
          });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error: Error) =>
      toast({
        title: "댓글을 변경하지 못했습니다.",
        description: error.message,
        variant: "destructive",
      }),
  });
  async function changeComment(change: Change): Promise<boolean> {
    try {
      await mutation.mutateAsync(change);
      return true;
    } catch {
      return false;
    }
  }
  return {
    comments: query.data ?? [],
    commentsLoading: query.isLoading,
    commentsError: query.isError,
    commentsFetching: query.isFetching,
    refetchComments: query.refetch,
    pending: mutation.isPending,
    changeComment,
  };
}
export type PostCommentsController = ReturnType<typeof usePostComments>;
