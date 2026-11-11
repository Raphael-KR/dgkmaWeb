import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  insertCommentSchema,
  updateCommentSchema,
  commentRevisionSchema,
  commentVisibilitySchema,
} from "@shared/contracts/comments";
import { storage } from "../../storage";
import { getErrorType } from "../../lib/safe-logging";
import { resolveCommentAttachment, CommentAttachmentError } from "./comment-attachment";
import type { CommentChangeResult } from "./comment-storage-contract";

const idSchema = z.coerce.number().int().positive().max(2147483647);

function failure(res: Response, error: unknown) {
  if (error instanceof z.ZodError)
    return res
      .status(400)
      .json({ message: error.issues[0]?.message ?? "입력 내용을 확인해 주세요." });
  if (error instanceof CommentAttachmentError)
    return res.status(400).json({ message: error.message });
  console.error("Comment request failed", { errorType: getErrorType(error) });
  return res.status(500).json({ message: "댓글 요청을 처리하지 못했습니다." });
}

async function actor(req: Request, res: Response) {
  const viewer = req.session.userId ? await storage.getUser(req.session.userId) : undefined;
  if (!viewer) res.status(401).json({ message: "로그인이 필요합니다." });
  return viewer;
}

function changed(res: Response, result: CommentChangeResult) {
  if (result === "saved") return res.status(204).end();
  const errors = {
    missing: [404, "댓글이나 게시글을 찾을 수 없습니다."],
    forbidden: [403, "댓글을 변경할 권한이 없습니다."],
    conflict: [409, "댓글이 다른 창에서 변경되었습니다. 입력 내용을 보관한 뒤 다시 불러와 주세요."],
  } as const;
  const [status, message] = errors[result];
  return res.status(status).json({ message });
}

// Registered behind the content router's authentication and no-store middleware.
export function registerCommentRoutes(app: Express) {
  app.get("/api/posts/:postId/comments", async (req, res) => {
    try {
      const viewer = await actor(req, res);
      if (!viewer) return;
      const postId = idSchema.parse(req.params.postId);
      if (!(await storage.getPost(postId)))
        return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
      res.json(await storage.getCommentsByPost(postId, viewer));
    } catch (error) {
      failure(res, error);
    }
  });

  app.post("/api/posts/:postId/comments", async (req, res) => {
    try {
      const viewer = await actor(req, res);
      if (!viewer) return;
      const postId = idSchema.parse(req.params.postId);
      const input = insertCommentSchema.parse(req.body);
      if (!(await storage.getPost(postId)))
        return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
      const attachment = await resolveCommentAttachment(input.attachmentPath, viewer);
      const comment = await storage.createComment({
        postId,
        authorId: viewer.id,
        content: input.content,
        attachment,
      });
      if (!comment) return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
      res.status(201).json(comment);
    } catch (error) {
      failure(res, error);
    }
  });

  app.patch("/api/comments/:id", async (req, res) => {
    try {
      const viewer = await actor(req, res);
      if (!viewer) return;
      const id = idSchema.parse(req.params.id);
      const input = updateCommentSchema.parse(req.body);
      const comment = await storage.getComment(id);
      if (!comment || !(await storage.getPost(comment.postId, viewer)))
        return res.status(404).json({ message: "댓글을 찾을 수 없습니다." });
      if (comment.authorId !== viewer.id)
        return res.status(403).json({ message: "작성자만 댓글을 수정할 수 있습니다." });
      if (comment.revision !== input.revision) return changed(res, "conflict");
      const attachment = await resolveCommentAttachment(
        input.attachmentPath,
        viewer,
        comment.attachment,
      );
      changed(
        res,
        await storage.changeComment(id, viewer, input.revision, {
          operation: "edit",
          content: { content: input.content, attachment },
        }),
      );
    } catch (error) {
      failure(res, error);
    }
  });

  app.delete("/api/comments/:id", async (req, res) => {
    try {
      const viewer = await actor(req, res);
      if (!viewer) return;
      const id = idSchema.parse(req.params.id);
      const { revision } = commentRevisionSchema.parse(req.body);
      changed(res, await storage.changeComment(id, viewer, revision, { operation: "delete" }));
    } catch (error) {
      failure(res, error);
    }
  });

  app.patch("/api/comments/:id/visibility", async (req, res) => {
    try {
      const viewer = await actor(req, res);
      if (!viewer) return;
      if (!viewer.isAdmin)
        return res.status(403).json({ message: "관리자만 댓글을 가리거나 복원할 수 있습니다." });
      const id = idSchema.parse(req.params.id);
      const { revision, isHidden } = commentVisibilitySchema.parse(req.body);
      changed(
        res,
        await storage.changeComment(id, viewer, revision, { operation: "visibility", isHidden }),
      );
    } catch (error) {
      failure(res, error);
    }
  });
}
