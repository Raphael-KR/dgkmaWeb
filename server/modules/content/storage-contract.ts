import type { Post, InsertPost, Category, InsertCategory } from "@shared/schema";
import type { NoticeType, UpdatePost } from "@shared/contracts";

export type PublishedPost = Pick<
  Post,
  | "id"
  | "title"
  | "content"
  | "categoryId"
  | "authorId"
  | "authorName"
  | "authorAffiliation"
  | "importData"
  | "isPublished"
  | "isHidden"
  | "revision"
  | "imageUrls"
  | "createdAt"
  | "updatedAt"
  | "publishedAt"
> & { eventType: NoticeType | null };
export type PostViewer = { id: string; isAdmin?: boolean | null };

export interface ContentStorageContract {
  getCategories(): Promise<Category[]>;
  getCategory(id: number): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  getPosts(
    categoryName?: string,
    limit?: number,
    offset?: number,
  ): Promise<(PublishedPost & { category: Category })[]>;
  getPost(
    id: number,
    viewer?: PostViewer,
  ): Promise<(PublishedPost & { category: Category }) | undefined>;
  getHiddenPosts(
    viewer: PostViewer,
    categoryName?: string,
    limit?: number,
    offset?: number,
  ): Promise<(PublishedPost & { category: Category })[]>;
  getPostForManagement(id: number): Promise<Post | undefined>;
  canReadPostAttachment(path: string, viewer: PostViewer): Promise<boolean>;
  createPost(post: InsertPost): Promise<Post>;
  updatePost(id: number, authorId: string, data: UpdatePost): Promise<Post | undefined>;
  deletePost(id: number, authorId: string, revision: number): Promise<boolean>;
  setPostHidden(id: number, adminId: string, revision: number, isHidden: boolean): Promise<boolean>;
  searchPosts(query: string): Promise<(PublishedPost & { category: Category })[]>;
}
