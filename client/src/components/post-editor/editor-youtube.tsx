import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { Youtube } from "lucide-react";
import { postYoutubeAttributes } from "@shared/editor/post-youtube";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function EditorYoutube({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const insert = () => {
    if (!editor?.isEditable || disabled) return;
    const attrs = postYoutubeAttributes({ src: url });
    if (!attrs) {
      setError("https://로 시작하는 YouTube 영상 주소를 확인해 주세요.");
      return;
    }
    const inserted = editor
      .chain()
      .focus()
      .setTextSelection(editor.state.selection.to)
      .setYoutubeVideo(attrs)
      .run();
    if (!inserted) {
      setError("이 위치에는 영상을 넣을 수 없습니다. 다른 문단을 선택해 주세요.");
      return;
    }
    setOpen(false);
    setUrl("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError("");
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" disabled={disabled}>
          <Youtube size={16} className="mr-1" /> YouTube
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>YouTube 영상 넣기</DialogTitle>
        <DialogDescription>
          영상 주소를 입력하세요. 본문에 주소만 붙여 넣어도 영상을 넣을 수 있습니다.
        </DialogDescription>
        <Input
          type="url"
          aria-label="YouTube 영상 주소"
          placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          disabled={disabled}
          onChange={(event) => {
            setUrl(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              insert();
            }
          }}
        />
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <Button type="button" onClick={insert} disabled={disabled || !url.trim()}>
          영상 넣기
        </Button>
      </DialogContent>
    </Dialog>
  );
}
