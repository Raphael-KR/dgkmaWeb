import { useRef, type ChangeEvent } from "react";
import { Paperclip } from "lucide-react";
import {
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_LABEL,
  DOCUMENT_UPLOAD_MAX_MB,
  DOCUMENT_ATTACHMENT_LIMIT,
  POST_ATTACHMENT_LIMIT,
} from "@shared/contracts/uploads";
import { Button } from "@/components/ui/button";

export function EditorFileUpload({
  disabled,
  onFiles,
}: {
  disabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!disabled && files.length) onFiles(files);
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={DOCUMENT_UPLOAD_ACCEPT}
        className="hidden"
        aria-label="일반 파일 선택"
        disabled={disabled}
        onChange={addFiles}
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={() => input.current?.click()}
        title={`${DOCUMENT_UPLOAD_LABEL} · 파일당 ${DOCUMENT_UPLOAD_MAX_MB}MB · 일반 파일 ${DOCUMENT_ATTACHMENT_LIMIT}개 · 본문·첨부 전체 합계 ${POST_ATTACHMENT_LIMIT}개`}
      >
        <Paperclip size={16} className="mr-1" />
        파일 첨부
      </Button>
    </>
  );
}
