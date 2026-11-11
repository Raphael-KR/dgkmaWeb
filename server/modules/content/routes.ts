import { PostDocumentError } from "@shared/editor/post-document";
import { postAttachmentPaths } from "@shared/contracts/post-input";
import type { Express, Request, Response } from "express";
import { insertCategorySchema } from "@shared/schema";
import {
  insertPostSchema,
  createUpdatePostSchema,
  postRevisionSchema,
  postVisibilitySchema,
} from "@shared/contracts";
import { registerCommentRoutes } from "./comment-routes";
import { requireAuthenticated } from "../../middleware/auth";
import { isRegularPostCategory } from "@shared/category-policy";
import { z } from "zod";
import { storage } from "../../storage";
import { getErrorType } from "../../lib/safe-logging";

const postIdSchema = z.coerce.number().int().positive();
const conflict = (res: Response) =>
  res.status(409).json({
    message: "글이 다른 창에서 변경되었습니다. 입력 내용을 보관한 뒤 다시 불러와 주세요.",
  });
function managementFailure(res: Response, error: unknown) {
  if (error instanceof z.ZodError)
    return res.status(400).json({
      message: "입력 내용을 확인해 주세요.",
      issues: error.issues.map(({ path, code }) => ({ path, code })),
    });
  if (error instanceof PostDocumentError)
    return res.status(400).json({ message: error.message, reason: error.reason, path: error.path });
  console.error("Post management failed", { errorType: getErrorType(error) });
  return res.status(500).json({ message: "게시글 변경을 처리하지 못했습니다." });
}
async function readableAttachments(paths: string[], userId: number) {
  if (!paths.length) return true;
  const viewer = await storage.getUser(userId);
  if (!viewer) return false;
  const allowed = await Promise.all(
    paths.map((path) => storage.canReadPostAttachment(path, viewer)),
  );
  return allowed.every(Boolean);
}
async function ownPost(req: Request, res: Response) {
  const post = await storage.getPostForManagement(postIdSchema.parse(req.params.id));
  if (!post) {
    res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
    return;
  }
  if (post.authorId !== req.session.userId) {
    res.status(403).json({ message: "작성자만 수정·삭제할 수 있습니다." });
    return;
  }
  return post;
}

export function registerContentRoutes(app: Express): void {
  app.use(["/api/posts", "/api/categories", "/api/comments"], requireAuthenticated);
  app.use(["/api/posts", "/api/comments"], (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  // Categories routes
  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      console.error("Failed to fetch categories", { errorType: getErrorType(error) });
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
        Math.min(100, Math.max(1, Number(limit) || 50)),
      );
      res.json(posts);
    } catch (error) {
      console.error("Failed to fetch posts", { errorType: getErrorType(error) });
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
      });
    }
  });

  app.get("/api/posts/hidden", async (req, res) => {
    try {
      const viewer = await storage.getUser(req.session.userId!);
      if (!viewer) return res.status(401).json({ message: "로그인이 필요합니다." });
      res.json(
        await storage.getHiddenPosts(
          viewer,
          typeof req.query.category === "string" ? req.query.category : undefined,
        ),
      );
    } catch (error) {
      managementFailure(res, error);
    }
  });

  app.patch("/api/posts/:id", async (req, res) => {
    try {
      const post = await ownPost(req, res);
      if (!post) return;
      if (post.eventData)
        return res.status(400).json({ message: "경조사는 정정 내용과 미리보기로 수정해 주세요." });
      const data = createUpdatePostSchema(post).parse(req.body);
      const category = await storage.getCategory(data.categoryId);
      if (!isRegularPostCategory(category)) {
        return res.status(400).json({ message: "일반 게시글 카테고리를 선택해 주세요." });
      }
      if (!(await readableAttachments(postAttachmentPaths(data), req.session.userId!))) {
        return res.status(403).json({ message: "열람할 수 없는 파일은 첨부할 수 없습니다." });
      }
      const saved = await storage.updatePost(post.id, req.session.userId!, data);
      if (!saved) return conflict(res);
      res.json({ id: saved.id });
    } catch (error) {
      managementFailure(res, error);
    }
  });

  app.delete("/api/posts/:id", async (req, res) => {
    try {
      const post = await ownPost(req, res);
      if (!post) return;
      const { revision } = postRevisionSchema.parse(req.body);
      if (!(await storage.deletePost(post.id, req.session.userId!, revision))) return conflict(res);
      res.status(204).end();
    } catch (error) {
      managementFailure(res, error);
    }
  });

  app.patch("/api/posts/:id/visibility", async (req, res) => {
    try {
      const viewer = await storage.getUser(req.session.userId!);
      if (!viewer?.isAdmin)
        return res.status(403).json({ message: "관리자만 가림 상태를 바꿀 수 있습니다." });
      const id = postIdSchema.parse(req.params.id);
      const data = postVisibilitySchema.parse(req.body);
      if (!(await storage.getPostForManagement(id)))
        return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
      if (!(await storage.setPostHidden(id, viewer.id, data.revision, data.isHidden)))
        return conflict(res);
      res.json({ id });
    } catch (error) {
      managementFailure(res, error);
    }
  });

  app.get("/api/posts/:id", async (req, res) => {
    try {
      const viewer = await storage.getUser(req.session.userId!);
      if (!viewer) return res.status(401).json({ message: "로그인이 필요합니다." });
      const post = await storage.getPost(postIdSchema.parse(req.params.id), viewer);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      res.json(post);
    } catch (error) {
      managementFailure(res, error);
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
      const category =
        validatedData.categoryId == null
          ? undefined
          : await storage.getCategory(validatedData.categoryId);
      if (!isRegularPostCategory(category)) {
        return res.status(400).json({
          message: "일반 게시글 카테고리를 선택해주세요. 부고·경사는 경조사 작성에서 등록합니다",
        });
      }
      if (!(await readableAttachments(postAttachmentPaths(validatedData), req.session.userId))) {
        return res.status(403).json({ message: "열람할 수 없는 파일은 첨부할 수 없습니다." });
      }
      const post = await storage.createPost({
        ...validatedData,
        authorId: req.session.userId,
        isPublished: true,
      });
      const { sourceText: _source, eventData: _event, ...publicPost } = post;
      res.status(201).json({ ...publicPost, eventType: null });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      if (error instanceof PostDocumentError)
        return res
          .status(400)
          .json({ message: error.message, reason: error.reason, path: error.path });
      res.status(500).json({ message: "Failed to create post" });
    }
  });

  registerCommentRoutes(app);
}
