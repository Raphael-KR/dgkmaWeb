import { useEffect, useRef, useState } from "react";
import {
  normalizePostDocument,
  postDocumentFromMarkdown,
  postDocumentsEqual,
  markdownProjection,
} from "@shared/editor/post-document";
import type { PostDocument } from "@shared/contracts/post-document";
import type { DocumentEditorController } from "./use-document-editor";

type Options = {
  value: PostDocument;
  documentEditor: DocumentEditorController;
  sourceError: string;
  setSourceError: (message: string) => void;
  setCopyStatus: (message: string) => void;
  closeLinkEditing: () => void;
};

export function useMarkdownMode({
  value,
  documentEditor,
  sourceError,
  setSourceError,
  setCopyStatus,
  closeLinkEditing,
}: Options) {
  const { editor, emitted, validity, commitDocument } = documentEditor;
  const [mode, setMode] = useState<"visual" | "markdown">("visual");
  const [source, setSource] = useState("");
  const [lossless, setLossless] = useState(true);
  const [allowConversion, setAllowConversion] = useState(false);
  const markdownBase = useRef<{ document: PostDocument; source: string } | null>(null);

  useEffect(() => {
    // 부모가 되돌려 준 같은 JSON은 재설정하지 않아 선택 영역과 편집 이력을 보존한다.
    if (!editor || postDocumentsEqual(value, emitted.current)) return;
    editor.commands.setContent(value, { emitUpdate: false });
    emitted.current = value;
    setSourceError("");
    validity.current?.(true);
    if (mode === "markdown") {
      const projection = markdownProjection(value);
      setSource(projection.source);
      setLossless(projection.lossless);
      setAllowConversion(false);
      markdownBase.current = { document: value, source: projection.source };
    }
    setCopyStatus("");
  }, [editor, value, mode, emitted, validity, setSourceError, setCopyStatus]);

  const editSource = (text: string) => {
    if (!editor || (!lossless && !allowConversion)) return;
    setSource(text);
    setCopyStatus("");
    try {
      // Markdown 문자열이 원래대로 돌아오면 손실 가능한 재변환 대신 원본 JSON을 복원한다.
      commitDocument(
        text === markdownBase.current?.source
          ? markdownBase.current.document
          : postDocumentFromMarkdown(text),
      );
    } catch {
      setSourceError(
        "지원하지 않는 Markdown 서식이 있습니다. 내용을 수정하거나 변경을 취소해 주세요. 게시 전 마지막 유효 본문이 보존됩니다.",
      );
      validity.current?.(false);
    }
  };

  const switchMode = (next: typeof mode) => {
    if (next === mode || !editor || sourceError) return;
    if (next === "markdown") {
      const document = normalizePostDocument(editor.getJSON());
      const projection = markdownProjection(document);
      markdownBase.current = { document, source: projection.source };
      setSource(projection.source);
      setLossless(projection.lossless);
      setAllowConversion(false);
      editor.commands.blur();
    }
    closeLinkEditing();
    setMode(next);
  };

  const cancelMarkdown = () => {
    if (markdownBase.current) commitDocument(markdownBase.current.document);
    setMode("visual");
  };

  return {
    mode,
    setMode,
    source,
    lossless,
    allowConversion,
    setAllowConversion,
    editSource,
    switchMode,
    cancelMarkdown,
  };
}
