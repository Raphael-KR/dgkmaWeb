import { useEffect, useRef, type MutableRefObject } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import {
  postEditorExtensions,
  normalizePostDocument,
  postDocumentFromMarkdown,
} from "@shared/editor/post-document";
import type { PostDocument } from "@shared/contracts/post-document";

export type DocumentEditorProps = {
  value: PostDocument;
  onChange: (document: PostDocument) => void;
  onValidityChange?: (valid: boolean) => void;
  disabled?: boolean;
};

type Options = DocumentEditorProps & {
  editorRef: MutableRefObject<Editor | null>;
  setSourceError: (message: string) => void;
  setCopyStatus: (message: string) => void;
  onSelectionUpdate: () => void;
};

export function useDocumentEditor({
  value,
  onChange,
  onValidityChange,
  disabled = false,
  editorRef,
  setSourceError,
  setCopyStatus,
  onSelectionUpdate,
}: Options) {
  const validity = useRef(onValidityChange);
  const change = useRef(onChange);
  const emitted = useRef(value);
  validity.current = onValidityChange;
  change.current = onChange;

  const editor = useEditor({
    extensions: postEditorExtensions,
    content: value,
    editorProps: {
      attributes: {
        class: "post-body text-sm text-gray-800",
        role: "textbox",
        "aria-label": "게시글 내용",
        "aria-multiline": "true",
      },
      handlePaste: (_view, event) => {
        // HTML 붙여넣기와 코드 블록 안의 텍스트는 Tiptap 기본 처리를 사용한다.
        if (event.clipboardData?.getData("text/html") || editorRef.current?.isActive("codeBlock"))
          return false;
        const pasted = event.clipboardData?.getData("text/plain");
        if (!pasted || !editorRef.current) return false;
        const html =
          /^\s*<(?:p|div|h[1-4]|strong|b|u|em|i|s|del|ol|ul|li|a|br|pre|code|blockquote|hr)\b/i.test(
            pasted,
          );
        try {
          const content = html ? pasted : postDocumentFromMarkdown(pasted);
          event.preventDefault();
          return editorRef.current.commands.insertContent(content, {
            contentType: html ? "html" : "json",
          });
        } catch {
          event.preventDefault();
          setCopyStatus("붙여넣을 내용에 지원하지 않는 서식이 있습니다. 원문을 확인해 주세요.");
          return true;
        }
      },
    },
    onUpdate: ({ editor: current }) => {
      try {
        const document = normalizePostDocument(current.getJSON());
        emitted.current = document;
        setSourceError("");
        setCopyStatus("");
        validity.current?.(true);
        change.current(document);
      } catch {
        setSourceError("본문의 크기와 지원 서식을 확인해 주세요. 마지막 유효 본문을 유지합니다.");
        validity.current?.(false);
      }
    },
    onSelectionUpdate,
  });
  editorRef.current = editor;

  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  const commitDocument = (document: PostDocument) => {
    if (!editor) return;
    // 프로그램에 의한 전환은 onUpdate를 재호출하지 않고 한 번만 부모에게 전달한다.
    editor.commands.setContent(document, { emitUpdate: false });
    emitted.current = document;
    change.current(document);
    setSourceError("");
    validity.current?.(true);
  };

  return { editor, emitted, validity, commitDocument };
}

export type DocumentEditorController = ReturnType<typeof useDocumentEditor>;
