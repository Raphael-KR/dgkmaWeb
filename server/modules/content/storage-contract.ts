import type { Post, InsertPost, Category, InsertCategory, Comment } from "@shared/schema";
import type { NoticeType, UpdatePost } from "@shared/contracts";

export type PublishedPost = Pick<
  Post,
  | "id"
  | "title"
  | "content"
  | "categoryId"
  | "authorId"
  | "isPublished"
  | "isHidden"
  | "revision"
  | "imageUrls"
  | "createdAt"
  | "updatedAt"
  | "publishedAt"
> & { eventType: NoticeType | null };
export type PostViewer = { id: number; isAdmin?: boolean | null };

// 댓글 + 작성자 표시 정보(이름). authorId 가 없는(탈퇴 등) 경우 author=null.
export type CommentWithAuthor = Comment & {
  author: { id: number; name: string } | null;
};

export interface ContentStorageContract {
  getCategories(): Promise<Category[]>;
  getCategory(id: number): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  getPosts(
    categoryName?: string,
    limit?: number,
  ): Promise<(PublishedPost & { category: Category })[]>;
  getPost(
    id: number,
    viewer?: PostViewer,
  ): Promise<(PublishedPost & { category: Category }) | undefined>;
  getHiddenPosts(
    viewer: PostViewer,
    categoryName?: string,
  ): Promise<(PublishedPost & { category: Category })[]>;
  getPostForManagement(id: number): Promise<Post | undefined>;
  canReadPostAttachment(path: string, viewer: PostViewer): Promise<boolean>;
  createPost(post: InsertPost): Promise<Post>;
  updatePost(id: number, authorId: number, data: UpdatePost): Promise<Post | undefined>;
  deletePost(id: number, authorId: number, revision: number): Promise<boolean>;
  setPostHidden(id: number, adminId: number, revision: number, isHidden: boolean): Promise<boolean>;
  searchPosts(query: string): Promise<(PublishedPost & { category: Category })[]>;
  getCommentsByPost(postId: number): Promise<CommentWithAuthor[]>;
  getComment(id: number): Promise<Comment | undefined>;
  createComment(data: {
    postId: number;
    authorId: number;
    content: string;
  }): Promise<Comment | undefined>;
  deleteComment(id: number): Promise<boolean>;
}
