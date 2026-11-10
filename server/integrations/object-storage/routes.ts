import {
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MAX_MB,
  isUploadImageContentType,
} from "@shared/contracts/uploads";
import type { Express } from "express";
import { storage } from "../../storage";
import { createHmac, timingSafeEqual } from "crypto";
import type { IncomingMessage } from "http";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { logObjectStorageFailure } from "../../lib/safe-logging";

const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;

type UploadTokenPayload = {
  objectId: string;
  size: number;
  contentType: string;
  expiresAt: number;
};

class UploadTooLargeError extends Error {
  constructor() {
    super(`Upload exceeds the ${IMAGE_UPLOAD_MAX_MB} MB limit`);
    this.name = "UploadTooLargeError";
  }
}

function getUploadTokenSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required for upload tokens");
  }
  return secret;
}

function signUploadToken(payload: UploadTokenPayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getUploadTokenSecret())
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyUploadToken(token: string): UploadTokenPayload | null {
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", getUploadTokenSecret())
    .update(encodedPayload)
    .digest("base64url");
  const received = Buffer.from(encodedSignature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as UploadTokenPayload;
    if (
      typeof payload.objectId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(payload.objectId) ||
      typeof payload.size !== "number" ||
      !Number.isInteger(payload.size) ||
      payload.size <= 0 ||
      payload.size > IMAGE_UPLOAD_MAX_BYTES ||
      typeof payload.contentType !== "string" ||
      !isUploadImageContentType(payload.contentType) ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt < Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function normalizeContentType(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().split(";")[0].trim() : "";
}

async function readUploadBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const contentLengthHeader = request.headers["content-length"];
  if (contentLengthHeader !== undefined) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isInteger(contentLength) || contentLength < 0 || contentLength > maxBytes) {
      throw new UploadTooLargeError();
    }
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let tooLarge = false;

    request.on("data", (chunk: Buffer | string) => {
      if (tooLarge) {
        return;
      }
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(buffer);
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(new UploadTooLargeError());
      } else {
        resolve(Buffer.concat(chunks, totalBytes));
      }
    });
    request.on("error", reject);
  });
}

/**
 * Register object storage routes for file uploads.
 *
 * This provides a bounded upload flow:
 * 1. POST /api/uploads/request-url - Get an upload URL
 * 2. The client then uploads directly to the returned application URL
 *
 * The Replit sidecar's signed PUT URL does not carry a content-length
 * constraint. Uploads therefore pass through this application route, which
 * binds and verifies the requested size and content type before storing.
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  app.put("/api/uploads/:uploadToken", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "로그인이 필요합니다" });
      }

      const token = verifyUploadToken(req.params.uploadToken);
      if (!token) {
        return res.status(403).json({ error: "유효하지 않거나 만료된 업로드 URL입니다" });
      }

      const contentType = normalizeContentType(req.headers["content-type"]);
      if (contentType !== token.contentType) {
        return res.status(400).json({ error: "업로드 파일 형식이 요청과 일치하지 않습니다" });
      }

      const contents = await readUploadBody(req, token.size);
      if (contents.length !== token.size) {
        return res.status(400).json({ error: "업로드 파일 크기가 요청과 일치하지 않습니다" });
      }

      await objectStorageService.uploadObjectEntity(token.objectId, contents, token.contentType);
      return res.status(200).end();
    } catch (error) {
      if (error instanceof UploadTooLargeError) {
        return res
          .status(413)
          .json({ error: `사진은 ${IMAGE_UPLOAD_MAX_MB}MB 이하만 업로드할 수 있습니다` });
      }
      logObjectStorageFailure("upload", error);
      return res.status(500).json({ error: "Failed to upload object" });
    }
  });

  /**
   * Request an upload URL for a file.
   *
   * Request body (JSON):
   * {
   *   "name": "filename.jpg",
   *   "size": 12345,
   *   "contentType": "image/jpeg"
   * }
   *
   * Response:
   * {
   *   "uploadURL": "/api/uploads/...",
   *   "objectPath": "/objects/uploads/uuid"
   * }
   *
   * IMPORTANT: The client should NOT send the file to this endpoint.
   * Send JSON metadata only, then upload the file to uploadURL.
   */
  app.post("/api/uploads/request-url", async (req, res) => {
    try {
      // 로그인한 회원만 업로드 URL 요청 가능 (익명 업로드로 버킷 남용 방지).
      if (!req.session?.userId) {
        return res.status(401).json({ error: "로그인이 필요합니다" });
      }

      const { name, size, contentType } = req.body;
      const normalizedSize = typeof size === "number" ? size : Number(size);
      const normalizedContentType =
        typeof contentType === "string" ? contentType.toLowerCase().split(";")[0].trim() : "";

      if (!name) {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }
      if (!Number.isFinite(normalizedSize) || normalizedSize <= 0) {
        return res.status(400).json({ error: "올바른 파일 크기가 필요합니다" });
      }
      if (normalizedSize > IMAGE_UPLOAD_MAX_BYTES) {
        return res
          .status(400)
          .json({ error: `사진은 ${IMAGE_UPLOAD_MAX_MB}MB 이하만 업로드할 수 있습니다` });
      }
      if (!isUploadImageContentType(normalizedContentType)) {
        return res.status(400).json({ error: "JPG, PNG, WebP, GIF 이미지만 업로드할 수 있습니다" });
      }

      const target = objectStorageService.createObjectEntityUploadTarget();
      const uploadToken = signUploadToken({
        objectId: target.objectId,
        size: normalizedSize,
        contentType: normalizedContentType,
        expiresAt: Date.now() + UPLOAD_TOKEN_TTL_MS,
      });

      res.json({
        uploadURL: `/api/uploads/${encodeURIComponent(uploadToken)}`,
        objectPath: target.objectPath,
      });
    } catch (error) {
      logObjectStorageFailure("upload-url", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  /**
   * Serve uploaded objects.
   *
   * GET /objects/:objectPath(*)
   *
   * 회원 세션과 게시글 첨부 열람 권한을 확인한 뒤 private, no-store로 응답한다.
   * 이미지 형식 검사와 nosniff 처리는 downloadObject가 담당한다.
   */
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      // 회원 전용 게시판 첨부이므로 로그인한 사용자만 열람 가능.
      // (<img> 태그는 동일 출처 요청 시 세션 쿠키를 자동 전송하므로 렌더링에 영향 없음)
      if (!req.session?.userId) {
        return res.status(401).json({ error: "로그인이 필요합니다" });
      }
      res.set("Cache-Control", "private, no-store");
      const viewer = await storage.getUser(req.session.userId);
      if (!viewer) return res.status(401).json({ error: "로그인이 필요합니다" });
      if (!(await storage.canReadPostAttachment(req.path, viewer))) {
        return res.status(404).json({ error: "첨부 파일을 찾을 수 없습니다" });
      }
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      logObjectStorageFailure("serve", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}
