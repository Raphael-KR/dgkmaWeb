import type { Express } from "express";
import { insertPostSchema, insertCommentSchema, insertCategorySchema } from "@shared/schema";
import { isSelectablePostCategory } from "@shared/category-policy";
import { z } from "zod";
import { storage } from "../../storage";
import { getErrorType } from "../../lib/safe-logging";

export function registerContentRoutes(app: Express): void {
  // Categories routes
  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post("/api/categories", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }

      const viewer = await storage.getUser(userId);
      if (!viewer?.isAdmin) {
        return res.status(403).json({ message: "관리자 권한이 필요합니다" });
      }

      const validatedData = insertCategorySchema.parse(req.body);
      const category = await storage.createCategory(validatedData);
      res.status(201).json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  // Posts routes
  app.get("/api/posts", async (req, res) => {
    try {
      const { category, limit } = req.query;
      const posts = await storage.getPosts(
        category as string,
        limit ? parseInt(limit as string) : undefined
      );
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch posts" });
    }
  });

  // Search posts (must be before the /:id route)
  app.get("/api/posts/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.trim() === "") {
        return res.json([]);
      }

      const posts = await storage.searchPosts(query);
      res.json(posts);
    } catch (error) {
      console.error("Search error:", getErrorType(error));
      res.status(500).json({
        message: "Failed to search posts",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/posts/:id", async (req, res) => {
    try {
      const post = await storage.getPost(parseInt(req.params.id));
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      res.json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch post" });
    }
  });

  app.post("/api/posts", async (req, res) => {
    try {
      // 로그인 필수 + authorId 는 세션에서만 (body 의 authorId 스푸핑 방지).
      if (!req.session?.userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const { authorId: _ignoredAuthorId, ...rest } = req.body ?? {};
      const validatedData = insertPostSchema.parse(rest);
      const category = validatedData.categoryId == null
        ? undefined
        : await storage.getCategory(validatedData.categoryId);
      if (!isSelectablePostCategory(category)) {
        return res.status(400).json({ message: "게시글 카테고리를 선택해주세요" });
      }
      // 첨부 이미지 경로는 오브젝트 스토리지 상대경로만 허용 (외부 URL <img src> 주입 차단).
      if (
        validatedData.imageUrls &&
        !validatedData.imageUrls.every((u) => /^\/objects\//.test(u))
      ) {
        return res.status(400).json({ message: "잘못된 첨부 이미지 경로입니다" });
      }
      const post = await storage.createPost({
        ...validatedData,
        authorId: req.session.userId,
      });
      res.status(201).json(post);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create post" });
    }
  });

  // 게시글 댓글 목록 — GET 게시글과 동일 정책(비게이팅). 회원 전용 접근은 클라이언트 라우트가 담당.
  app.get("/api/posts/:postId/comments", async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      if (Number.isNaN(postId)) {
        return res.status(400).json({ message: "잘못된 게시글입니다" });
      }
      const list = await storage.getCommentsByPost(postId);
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "댓글을 불러오지 못했습니다" });
    }
  });

  // 댓글 작성 — 로그인 필수. authorId 는 세션, postId 는 URL 에서만 채움.
  app.post("/api/posts/:postId/comments", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const postId = parseInt(req.params.postId);
      if (Number.isNaN(postId)) {
        return res.status(400).json({ message: "잘못된 게시글입니다" });
      }
      const post = await storage.getPost(postId);
      if (!post) {
        return res.status(404).json({ message: "게시글을 찾을 수 없습니다" });
      }
      const { content } = insertCommentSchema.parse(req.body);
      const comment = await storage.createComment({
        postId,
        authorId: req.session.userId,
        content,
      });
      res.status(201).json(comment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "댓글 작성에 실패했습니다" });
    }
  });

  // 댓글 삭제 — 작성자 본인 또는 관리자만.
  app.delete("/api/comments/:id", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const id = parseInt(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: "잘못된 댓글입니다" });
      }
      const comment = await storage.getComment(id);
      if (!comment) {
        return res.status(404).json({ message: "댓글을 찾을 수 없습니다" });
      }
      if (comment.authorId !== userId) {
        const viewer = await storage.getUser(userId);
        if (!viewer?.isAdmin) {
          return res.status(403).json({ message: "권한이 없습니다" });
        }
      }
      await storage.deleteComment(id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "댓글 삭제에 실패했습니다" });
    }
  });
}
