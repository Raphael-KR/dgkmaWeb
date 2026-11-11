import { Download } from "lucide-react";
import {
  formatUploadSize,
  isUploadImageContentType,
  type UploadedFile,
} from "@shared/contracts/uploads";

export function CommentAttachment({ file }: { file: UploadedFile }) {
  return (
    <div className="mt-2 max-w-full space-y-1">
      {isUploadImageContentType(file.contentType) && (
        <a
          href={file.objectPath}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="첨부 이미지 원본 열기"
        >
          <img
            src={file.objectPath}
            alt={file.name}
            loading="lazy"
            className="max-h-64 max-w-full rounded-md object-contain"
          />
        </a>
      )}
      <a
        href={file.objectPath}
        download
        className="inline-flex max-w-full items-center gap-2 text-sm text-community-foreground underline underline-offset-2 [overflow-wrap:anywhere]"
      >
        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {file.name} ({formatUploadSize(file.size)})
        </span>
      </a>
    </div>
  );
}
