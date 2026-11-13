import { useRef, type ChangeEvent } from "react";
import { Paperclip } from "lucide-react";
import { DOCUMENT_UPLOAD_ACCEPT, IMAGE_UPLOAD_ACCEPT } from "@shared/contracts/uploads";
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
    <div className="md:hidden">
      <input
        ref={input}
        type="file"
        multiple
        accept={`${IMAGE_UPLOAD_ACCEPT},${DOCUMENT_UPLOAD_ACCEPT}`}
        className="hidden"
        aria-label="사진·파일 선택"
        disabled={disabled}
        onChange={addFiles}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled}
        onClick={() => input.current?.click()}
        aria-label="사진·파일 첨부"
        title="사진·파일 첨부"
      >
        <Paperclip size={18} aria-hidden="true" />
      </Button>
    </div>
  );
}
