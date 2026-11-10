import { COMMENT_MAX_LENGTH } from "@shared/contracts/content-limits";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { QueryError } from "@/components/query-error";
import type { PostCommentsController } from "./use-post-comments";
import type { ClientUser } from "@shared/contracts";

type Props = {
  controller: PostCommentsController;
  user: ClientUser | null;
};

export function PostComments({ controller, user }: Props) {
  const {
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
  } = controller;

  return (
    <Card className="min-w-0 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center mb-4">
          <MessageSquare size={18} className="mr-2 text-gray-500" />
          <h2 className="font-bold text-gray-800">
            댓글 {!commentsLoading && !commentsError && comments.length}
          </h2>
        </div>

        {/* 작성 폼 */}
        <div className="mb-6">
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="댓글을 입력하세요..."
            aria-label="댓글 내용"
            className="min-h-[80px] resize-none mb-2"
            maxLength={COMMENT_MAX_LENGTH}
          />
          <div className="flex justify-end">
            <Button
              variant="community"
              onClick={handleSubmitComment}
              disabled={createComment.isPending || !commentText.trim()}
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
        {commentsError ? (
          <QueryError
            message="댓글을 불러오지 못했습니다."
            onRetry={() => void refetchComments()}
            retrying={commentsFetching}
          />
        ) : commentsLoading ? (
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
                      {new Date(c.createdAt!).toLocaleDateString("ko-KR", {
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
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
  );
}
