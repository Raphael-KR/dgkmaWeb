import type { Express } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * Register object storage routes for file uploads.
 *
 * This provides example routes for the presigned URL upload flow:
 * 1. POST /api/uploads/request-url - Get a presigned URL for uploading
 * 2. The client then uploads directly to the presigned URL
 *
 * IMPORTANT: These are example routes. Customize based on your use case:
 * - Add authentication middleware for protected uploads
 * - Add file metadata storage (save to database after upload)
 * - Add ACL policies for access control
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  /**
   * Request a presigned URL for file upload.
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
   *   "uploadURL": "https://storage.googleapis.com/...",
   *   "objectPath": "/objects/uploads/uuid"
   * }
   *
   * IMPORTANT: The client should NOT send the file to this endpoint.
   * Send JSON metadata only, then upload the file directly to uploadURL.
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
        typeof contentType === "string"
          ? contentType.toLowerCase().split(";")[0].trim()
          : "";

      if (!name) {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }
      if (!Number.isFinite(normalizedSize) || normalizedSize <= 0) {
        return res.status(400).json({ error: "올바른 파일 크기가 필요합니다" });
      }
      if (normalizedSize > MAX_UPLOAD_BYTES) {
        return res.status(400).json({ error: "사진은 10MB 이하만 업로드할 수 있습니다" });
      }
      if (!ALLOWED_IMAGE_CONTENT_TYPES.has(normalizedContentType)) {
        return res.status(400).json({ error: "JPG, PNG, WebP, GIF 이미지만 업로드할 수 있습니다" });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();

      // Extract object path from the presigned URL for later reference
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL,
        objectPath,
        // Echo back the metadata for client convenience
        metadata: { name, size: normalizedSize, contentType: normalizedContentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  /**
   * Serve uploaded objects.
   *
   * GET /objects/:objectPath(*)
   *
   * This serves files from object storage. For public files, no auth needed.
   * For protected files, add authentication middleware and ACL checks.
   */
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      // 회원 전용 게시판 첨부이므로 로그인한 사용자만 열람 가능.
      // (<img> 태그는 동일 출처 요청 시 세션 쿠키를 자동 전송하므로 렌더링에 영향 없음)
      if (!req.session?.userId) {
        return res.status(401).json({ error: "로그인이 필요합니다" });
      }
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}
