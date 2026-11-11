import type { Editor } from "@tiptap/react";
import { normalizePostDocument, markdownProjection } from "@shared/editor/post-document";

export async function copyEditorContent(
  editor: Editor | null,
  format: "html" | "markdown",
  setCopyStatus: (message: string) => void,
) {
  if (!editor) return;
  try {
    const projection =
      format === "markdown" ? markdownProjection(normalizePostDocument(editor.getJSON())) : null;
    if (format === "html" && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([editor.getHTML()], { type: "text/html" }),
          "text/plain": new Blob([editor.getText()], { type: "text/plain" }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(
        format === "html" ? editor.getHTML() : projection!.source,
      );
    }
    setCopyStatus(
      format === "html"
        ? "HTML로 복사했습니다."
        : projection?.lossless
          ? "마크다운으로 복사했습니다."
          : "마크다운으로 복사했습니다. 일부 서식·표 구조는 표현되지 않습니다. 본문 원본은 유지됩니다.",
    );
  } catch (error) {
    console.warn("Post clipboard write failed", {
      format,
      clipboardAvailable: Boolean(navigator.clipboard),
      errorType: error instanceof Error ? error.name : typeof error,
      contentOmitted: true,
    });
    setCopyStatus("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
  }
}
