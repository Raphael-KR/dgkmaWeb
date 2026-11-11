import { useMemo, useRef } from "react";
import FileHandler from "@tiptap/extension-file-handler";
import type { Editor, Range } from "@tiptap/core";
import { postAttachmentPathSchema } from "@shared/contracts/post-input";
import {
  formatUploadSize,
  isUploadImageContentType,
  type UploadedFile,
} from "@shared/contracts/uploads";

export type UploadEditorFiles = (files: File[]) => Promise<UploadedFile[]>;

/** A template stays inert while unsupported image sources are removed. */
export function prepareImageHtml(html: string, removeAll = false) {
  const template = document.createElement("template");
  template.innerHTML = html;
  let removed = 0;
  for (const image of Array.from(template.content.querySelectorAll("img"))) {
    if (removeAll || !postAttachmentPathSchema.safeParse(image.getAttribute("src")).success) {
      image.remove();
      removed++;
    }
  }
  return { template, removed };
}

export function useEditorFiles(
  upload: UploadEditorFiles | undefined,
  setStatus: (message: string) => void,
) {
  const uploadRef = useRef(upload);
  const pending = useRef(false);
  uploadRef.current = upload;

  return useMemo(() => {
    const insert = async (
      editor: Editor,
      files: File[],
      position: number | Range,
      html?: string,
    ) => {
      if (!editor.isEditable || pending.current || !files.length) return;
      if (!uploadRef.current) {
        setStatus("이 편집 화면에서는 파일을 업로드할 수 없습니다.");
        return;
      }
      pending.current = true;
      try {
        const uploaded = await uploadRef.current(files);
        if (editor.isDestroyed) return;
        if (uploaded.some((file) => !postAttachmentPathSchema.safeParse(file.objectPath).success))
          throw new Error("업로드 결과의 파일 경로를 확인하지 못했습니다.");
        // FileHandler owns this paste: keep companion text but insert each uploaded file once.
        const { template } = prepareImageHtml(html ?? "", true);
        for (const file of uploaded) {
          if (isUploadImageContentType(file.contentType)) {
            const image = document.createElement("img");
            image.setAttribute("src", file.objectPath);
            template.content.append(image);
          } else {
            const paragraph = document.createElement("p");
            const link = document.createElement("a");
            link.setAttribute("href", file.objectPath);
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noopener noreferrer");
            link.textContent = `${file.name} (${formatUploadSize(file.size)})`;
            paragraph.append(link);
            template.content.append(paragraph);
          }
        }
        if (!template.content.hasChildNodes()) return;
        const end = editor.state.doc.content.size;
        const target =
          typeof position === "number"
            ? Math.min(position, end)
            : { from: Math.min(position.from, end), to: Math.min(position.to, end) };
        if (!editor.chain().focus().insertContentAt(target, template.innerHTML).run())
          throw new Error(
            "현재 위치에 파일을 추가하지 못했습니다. 삽입 위치를 다시 선택해 주세요.",
          );
        setStatus(
          uploaded.length
            ? `파일 ${uploaded.length}개를 본문에 추가했습니다.`
            : "파일은 추가하지 않았으며 함께 붙인 텍스트는 유지했습니다.",
        );
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "파일을 본문에 넣지 못했습니다.");
      } finally {
        pending.current = false;
      }
    };
    const extension = FileHandler.configure({
      // Validate all files in the shared upload callback so rejected formats get an explanation.
      consumePasteEvent: true,
      onPaste: (editor, files, html) => {
        const { from, to } = editor.state.selection;
        void insert(editor, files, { from, to }, html);
      },
      onDrop: (editor, files, position) => {
        void insert(editor, files, position);
      },
    });
    return { extension, insert };
  }, [setStatus]);
}
