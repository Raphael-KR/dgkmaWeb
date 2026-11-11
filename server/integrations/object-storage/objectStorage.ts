import { isUploadImageContentType } from "@shared/contracts/uploads";
import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import { logObjectStorageFailure } from "../../lib/safe-logging";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// Replit sidecar가 제공하는 자격으로 버킷에 접근한다.
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// 앱의 업로드 저장과 인증된 첨부 응답에 필요한 Object Storage 작업.
export class ObjectStorageService {
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var.",
      );
    }
    return dir;
  }

  async downloadObject(file: File, res: Response) {
    try {
      const [metadata] = await file.getMetadata();
      // 보안: 이미지가 아닌 파일은 octet-stream + 첨부 다운로드로 강제하고
      // nosniff 를 적용해 앱 오리진에서의 저장형 XSS(예: text/html 업로드) 를 차단.
      const rawContentType = metadata.contentType || "application/octet-stream";
      const normalizedContentType = rawContentType.toLowerCase().split(";")[0].trim();
      const isImage = isUploadImageContentType(normalizedContentType);
      const safeContentType = isImage ? rawContentType : "application/octet-stream";
      res.set({
        "Content-Type": safeContentType,
        "Content-Length": metadata.size,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(isImage
          ? {}
          : {
              "Content-Disposition":
                typeof metadata.metadata?.downloadName === "string" &&
                /^[A-Za-z0-9%_.!~*'()-]+$/.test(metadata.metadata.downloadName)
                  ? `attachment; filename="download"; filename*=UTF-8''${metadata.metadata.downloadName}`
                  : "attachment",
            }),
      });

      const stream = file.createReadStream();

      stream.on("error", (err) => {
        logObjectStorageFailure("stream", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      logObjectStorageFailure("download", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  createObjectEntityUploadTarget(): {
    objectId: string;
    objectPath: string;
  } {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    // Validate the configured path while the target is created instead of
    // waiting until the upload request reaches object storage.
    parseObjectPath(fullPath);

    return {
      objectId,
      objectPath: `/objects/uploads/${objectId}`,
    };
  }

  // Stores an upload after the request route has validated its size and type.
  async uploadObjectEntity(
    objectId: string,
    contents: Buffer,
    contentType: string,
    name: string,
  ): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(objectId)) {
      throw new Error("Invalid object ID");
    }

    const privateObjectDir = this.getPrivateObjectDir();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const objectFile = objectStorageClient.bucket(bucketName).file(objectName);

    await objectFile.save(contents, {
      resumable: false,
      metadata: {
        contentType,
        metadata: {
          downloadName: encodeURIComponent(name).replace(
            /['()*]/g,
            (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
          ),
        },
      },
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}
