import { useState } from "react";
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import type { ClientUser, CommentWithAuthor } from "@shared/contracts";
import { Button } from "@/components/ui/button";
import { CommentComposer } from "./comment-composer";
import { CommentAttachment } from "./comment-attachment";
import { CommentText } from "./comment-text";
import type { PostCommentsController } from "./use-post-comments";

type Props = {
  comment: CommentWithAuthor;
  user: ClientUser | null;
  controller: PostCommentsController;
};

export function CommentItem({ comment, user, controller }: Props) {
  const [editRevision, setEditRevision] = useState<number | null>(null);
  const own = user?.id === comment.authorId;
  const busy = controller.pending;
  const hidden = comment.isHidden && comment.content === null;
  return (
    <div className="border-b border-gray-100 pb-3 last:border-0">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-words text-sm font-medium text-gray-800">
          {comment.author?.name || "회원"}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {comment.isHidden && <span className="text-xs text-muted-foreground">가림</span>}
          <span className="text-xs text-gray-400">
            {comment.createdAt &&
              new Date(comment.createdAt).toLocaleDateString("ko-KR", {
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
          </span>
          {comment.editedAt && (
            <span
              className="text-xs text-muted-foreground"
              title={new Date(comment.editedAt).toLocaleString("ko-KR")}
            >
              수정됨
            </span>
          )}
          {own && (
            <>
              <Button
                size="icon"
                variant="ghost"
                disabled={busy || editRevision !== null}
                aria-label="댓글 수정"
                onClick={() => setEditRevision(comment.revision)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={busy || editRevision !== null}
                aria-label="댓글 삭제"
                onClick={() =>
                  void controller.changeComment({
                    operation: "delete",
                    id: comment.id,
                    revision: comment.revision,
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
          {user?.isAdmin && (
            <Button
              size="icon"
              variant="ghost"
              disabled={busy || editRevision !== null}
              aria-label={comment.isHidden ? "댓글 다시 표시" : "댓글 가리기"}
              onClick={() =>
                void controller.changeComment({
                  operation: "visibility",
                  id: comment.id,
                  revision: comment.revision,
                  isHidden: !comment.isHidden,
                })
              }
            >
              {comment.isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>
      {editRevision !== null && own ? (
        <CommentComposer
          content={comment.content ?? ""}
          attachment={comment.attachment}
          pending={busy}
          onCancel={() => setEditRevision(null)}
          onSave={async (input) => {
            const saved = await controller.changeComment({
              operation: "edit",
              id: comment.id,
              revision: editRevision,
              input,
            });
            if (saved) setEditRevision(null);
            return saved;
          }}
        />
      ) : hidden ? (
        <p className="text-sm text-muted-foreground">가려진 댓글입니다</p>
      ) : (
        <>
          <CommentText text={comment.content ?? ""} />
          {comment.attachment && <CommentAttachment file={comment.attachment} />}
        </>
      )}
    </div>
  );
}
