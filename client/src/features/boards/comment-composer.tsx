import { useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useUpload } from "@/hooks/use-upload";
import { COMMENT_MAX_LENGTH } from "@shared/contracts/content-limits";
import type { InsertComment } from "@shared/contracts/comments";
import {
  IMAGE_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_LABEL,
  IMAGE_UPLOAD_MAX_MB,
  DOCUMENT_UPLOAD_MAX_MB,
  validateUploadType,
  uploadSizeLimit,
  type UploadedFile,
} from "@shared/contracts/uploads";
import { CommentAttachment } from "./comment-attachment";

type Props = {
  content?: string;
  attachment?: UploadedFile | null;
  pending: boolean;
  onSave: (input: InsertComment) => Promise<boolean>;
  onCancel?: () => void;
};

export function CommentComposer({
  content = "",
  attachment = null,
  pending,
  onSave,
  onCancel,
}: Props) {
  const [text, setText] = useState(content);
  const [file, setFile] = useState(attachment);
  const [error, setError] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const submitting = useRef(false);
  const { uploadFile, isUploading } = useUpload({ onError: (cause) => setError(cause.message) });
  const busy = pending || isUploading;

  async function attach(selected: File) {
    if (busy || uploading.current || submitting.current) return;
    setError("");
    const type = validateUploadType(selected.name, selected.type);
    if (!type.ok) {
      setError(type.message);
      return;
    }
    const limit = uploadSizeLimit(type.contentType);
    if (selected.size <= 0 || selected.size > limit.bytes) {
      setError(`파일은 0바이트 초과 ${limit.mb}MB 이하만 첨부할 수 있습니다.`);
      return;
    }
    uploading.current = true;
    try {
      const result = await uploadFile(selected);
      if (result) {
        const { objectPath, name, size, contentType } = result;
        setFile({ objectPath, name, size, contentType });
      }
    } finally {
      uploading.current = false;
    }
  }

  async function save() {
    if (busy || uploading.current || submitting.current || (!text.trim() && !file)) return;
    submitting.current = true;
    setError("");
    try {
      if (await onSave({ content: text, attachmentPath: file?.objectPath ?? null })) {
        if (!onCancel) {
          setText("");
          setFile(null);
        }
      }
    } finally {
      submitting.current = false;
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="space-y-2"
    >
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={busy}
        maxLength={COMMENT_MAX_LENGTH}
        aria-label={onCancel ? "댓글 수정 내용" : "댓글 내용"}
        placeholder="댓글을 입력하세요..."
        className="min-h-[80px] resize-none"
      />
      {file && (
        <div className="flex items-start justify-between gap-2 rounded-md border p-2">
          <CommentAttachment file={file} />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={busy}
            onClick={() => setFile(null)}
            aria-label="댓글 첨부 제거"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <input
        ref={picker}
        type="file"
        hidden
        accept={`${IMAGE_UPLOAD_ACCEPT},${DOCUMENT_UPLOAD_ACCEPT}`}
        disabled={busy}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          if (selected) void attach(selected);
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => picker.current?.click()}
        >
          {isUploading ? (
            <LoadingSpinner className="mr-1 h-4 w-4" />
          ) : (
            <Paperclip className="mr-1 h-4 w-4" />
          )}
          {file ? "첨부 교체" : "파일 첨부"}
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {text.length.toLocaleString("ko-KR")} / {COMMENT_MAX_LENGTH.toLocaleString("ko-KR")}자
          </span>
          {onCancel && (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
              취소
            </Button>
          )}
          <Button
            type="submit"
            variant="community"
            size="sm"
            disabled={busy || (!text.trim() && !file)}
          >
            {pending ? (
              <LoadingSpinner className="mr-1 h-4 w-4" />
            ) : (
              <Send className="mr-1 h-4 w-4" />
            )}
            {onCancel ? "저장" : "등록"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        이미지({IMAGE_UPLOAD_MAX_MB}MB) 또는 {DOCUMENT_UPLOAD_LABEL}({DOCUMENT_UPLOAD_MAX_MB}MB) 중
        1개를 첨부할 수 있습니다.
      </p>
      {error && (
        <p role="alert" className="whitespace-pre-line text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
