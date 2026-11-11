import type { Comment } from "@shared/schema";
import type { UploadedFile } from "@shared/contracts/uploads";
import type { PostViewer } from "./storage-contract";

export type ReadableComment = Omit<Comment, "content"> & {
  content: string | null;
  author: { id: number; name: string } | null;
};
export type CommentContent = { content: string; attachment: UploadedFile | null };
export type CommentChange =
  | { operation: "edit"; content: CommentContent }
  | { operation: "delete" }
  | { operation: "visibility"; isHidden: boolean };
export type CommentChangeResult = "saved" | "missing" | "forbidden" | "conflict";

export interface CommentStorageContract {
  getCommentsByPost(postId: number, viewer: PostViewer): Promise<ReadableComment[]>;
  getComment(id: number): Promise<Comment | undefined>;
  createComment(
    data: CommentContent & { postId: number; authorId: number },
  ): Promise<Comment | undefined>;
  changeComment(
    id: number,
    viewer: PostViewer,
    revision: number,
    change: CommentChange,
  ): Promise<CommentChangeResult>;
}
