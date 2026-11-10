import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { ClientUser, Post } from "@shared/contracts";
import type { PostManagementController } from "./use-post-management";

type ControllerProps = { controller: PostManagementController };
type ButtonsProps = ControllerProps & {
  post: Post;
  user: ClientUser | null;
};

export function PostManagementButtons({ post, user, controller }: ButtonsProps) {
  const { manage, setAction } = controller;
  return (
    <div className="flex flex-wrap gap-2">
      {user?.id === post.authorId && (
        <>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/p/${post.id}/edit`}>수정</Link>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={manage.isPending}
            onClick={() => setAction("delete")}
          >
            삭제
          </Button>
        </>
      )}
      {user?.isAdmin && (
        <Button
          variant="outline"
          size="sm"
          disabled={manage.isPending}
          onClick={() => setAction(post.isHidden ? "show" : "hide")}
        >
          {post.isHidden ? "다시 표시" : "글 가리기"}
        </Button>
      )}
    </div>
  );
}

export function PostManagementDialog({ controller }: ControllerProps) {
  const { action, setAction, manage } = controller;
  return (
    <AlertDialog
      open={action !== null}
      onOpenChange={(open) => {
        if (!open && !manage.isPending) setAction(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {action === "delete"
              ? "게시글을 삭제할까요?"
              : action === "hide"
                ? "게시글을 가릴까요?"
                : "게시글을 다시 표시할까요?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {action === "delete"
              ? "게시글과 댓글이 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
              : action === "hide"
                ? "목록과 검색에서 제외하고 작성자와 관리자만 볼 수 있게 합니다. 본문과 댓글은 보존됩니다."
                : "회원들이 목록과 검색에서 이 글을 다시 볼 수 있습니다."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={manage.isPending}>취소</AlertDialogCancel>
          <AlertDialogAction
            disabled={manage.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (action) manage.mutate(action);
            }}
          >
            {manage.isPending ? "처리 중…" : "확인"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
