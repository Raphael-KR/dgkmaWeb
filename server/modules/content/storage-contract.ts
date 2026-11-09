import type { Post, InsertPost, Category, InsertCategory, Comment } from "@shared/schema";

export type PublishedPost = Pick<Post, "id" | "title" | "content" | "categoryId" | "authorId" | "isPublished" | "imageUrls" | "createdAt" | "updatedAt" | "publishedAt">;

// 댓글 + 작성자 표시 정보(이름). authorId 가 없는(탈퇴 등) 경우 author=null.
export type CommentWithAuthor = Comment & {
  author: { id: number; name: string } | null;
};

export interface ContentStorageContract {
  getCategories(): Promise<Category[]>;
  getCategory(id: number): Promise<Category | undefined>;
  getCategoryByName(name: string): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: number, category: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: number): Promise<boolean>;
  getPosts(categoryName?: string, limit?: number): Promise<(PublishedPost & { category: Category })[]>;
  getPost(id: number): Promise<(PublishedPost & { category: Category }) | undefined>;
  createPost(post: InsertPost): Promise<Post>;
  updatePost(id: number, post: Partial<InsertPost>): Promise<Post | undefined>;
  deletePost(id: number): Promise<boolean>;
  searchPosts(query: string): Promise<(PublishedPost & { category: Category })[]>;
  getCommentsByPost(postId: number): Promise<CommentWithAuthor[]>;
  getComment(id: number): Promise<Comment | undefined>;
  createComment(data: { postId: number; authorId: number; content: string }): Promise<Comment>;
  deleteComment(id: number): Promise<boolean>;
}
