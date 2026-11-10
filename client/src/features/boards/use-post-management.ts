import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { postRequest, refreshPosts } from "@/lib/post-management";
import { useToast } from "@/hooks/use-toast";
import type { Post } from "@shared/contracts";

export function usePostManagement(postId: string | undefined, post: Post | undefined) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [action, setAction] = useState<"delete" | "hide" | "show" | null>(null);

  const manage = useMutation({
    mutationFn: async (operation: "delete" | "hide" | "show") => {
      if (!post) return;
      return operation === "delete"
        ? postRequest("DELETE", `/api/posts/${post.id}`, { revision: post.revision })
        : postRequest("PATCH", `/api/posts/${post.id}/visibility`, {
            revision: post.revision,
            isHidden: operation === "hide",
          });
    },
    onSuccess: async (_, operation) => {
      setAction(null);
      if (operation === "delete") {
        navigate("/b");
        queryClient.removeQueries({ queryKey: ["/api/posts", postId] });
      }
      await refreshPosts();
      toast({
        title:
          operation === "delete"
            ? "게시글을 삭제했습니다."
            : operation === "hide"
              ? "게시글을 가렸습니다."
              : "게시글을 다시 표시합니다.",
      });
    },
    onError: (cause: Error) =>
      toast({
        title: "변경하지 못했습니다.",
        description: cause.message,
        variant: "destructive",
      }),
  });

  return { action, setAction, manage };
}

export type PostManagementController = ReturnType<typeof usePostManagement>;
