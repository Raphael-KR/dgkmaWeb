import { useState, useCallback } from "react";
import type { UploadedFile } from "@shared/contracts/uploads";

interface UploadResponse extends UploadedFile {
  uploadURL: string;
}

interface UseUploadOptions {
  onError?: (error: Error) => void;
}

// URL 발급 후 파일을 PUT한다. 업로드 상태와 호출자 콜백은 이 훅이 소유한다.
export function useUpload(options: UseUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);

  // 서버가 반환한 오류 메시지를 호출부에 전달한다.
  const requestUploadUrl = useCallback(async (file: File): Promise<UploadResponse> => {
    const response = await fetch("/api/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to get upload URL");
    }

    return response.json();
  }, []);

  const uploadToBoundedUrl = useCallback(
    async (file: File, upload: UploadResponse): Promise<void> => {
      const response = await fetch(upload.uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": upload.contentType,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "파일을 저장하지 못했습니다.");
      }
    },
    [],
  );

  const uploadFile = useCallback(
    async (file: File): Promise<UploadResponse | null> => {
      setIsUploading(true);

      try {
        const uploadResponse = await requestUploadUrl(file);
        await uploadToBoundedUrl(file, uploadResponse);
        return uploadResponse;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Upload failed");
        options.onError?.(error);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [requestUploadUrl, uploadToBoundedUrl, options],
  );

  return {
    uploadFile,
    isUploading,
  };
}
