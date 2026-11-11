import { MessageSquare, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { QueryError } from "@/components/query-error";
import { CommentComposer } from "./comment-composer";
import { CommentItem } from "./comment-item";
import type { PostCommentsController } from "./use-post-comments";
import type { ClientUser } from "@shared/contracts";

type Props = { controller: PostCommentsController; user: ClientUser | null };

export function PostComments({ controller, user }: Props) {
  const {
    comments,
    commentsLoading,
    commentsError,
    commentsFetching,
    refetchComments,
    pending,
    changeComment,
  } = controller;
  return (
    <Card className="min-w-0 shadow-sm">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="flex items-center font-bold text-gray-800">
            <MessageSquare size={18} className="mr-2 text-gray-500" />
            댓글 {!commentsLoading && !commentsError && comments.length}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="댓글 다시 불러오기"
            disabled={pending || commentsFetching}
            onClick={() => void refetchComments()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="mb-6">
          <CommentComposer
            pending={pending}
            onSave={(input) => changeComment({ operation: "create", input })}
          />
        </div>
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
          <p className="py-6 text-center text-sm text-gray-400">첫 댓글을 남겨보세요.</p>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} user={user} controller={controller} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
