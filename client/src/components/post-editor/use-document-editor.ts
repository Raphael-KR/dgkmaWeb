import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions/placeholder";
import { CharacterCount } from "@tiptap/extensions/character-count";
import {
  postEditorExtensions,
  normalizePostDocument,
  postDocumentFromMarkdown,
} from "@shared/editor/post-document";
import type { PostDocument } from "@shared/contracts/post-document";
import { postYoutubeAttributes } from "@shared/editor/post-youtube";
import { prepareImageHtml, useEditorFiles, type UploadEditorFiles } from "./editor-files";

export type DocumentEditorProps = {
  value: PostDocument;
  onChange: (document: PostDocument) => void;
  onValidityChange?: (valid: boolean) => void;
  disabled?: boolean;
  onUploadFiles?: UploadEditorFiles;
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
  onUploadFiles,
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
  const files = useEditorFiles(onUploadFiles, setCopyStatus);
  const extensions = useMemo(
    () => [
      ...postEditorExtensions,
      Placeholder.configure({ placeholder: "게시글 내용을 입력하세요" }),
      CharacterCount.configure({ limit: null, autoTrim: false }),
      files.extension,
    ],
    [files],
  );
  const prepareHtml = (html: string) => {
    const { template, removed } = prepareImageHtml(html);
    if (removed)
      queueMicrotask(() =>
        setCopyStatus(
          `지원하지 않는 주소의 이미지 ${removed}개는 추가하지 않았습니다. 사진 파일을 복사하거나 끌어 넣어 주세요.`,
        ),
      );
    return template.innerHTML;
  };

  const editor = useEditor({
    extensions,
    content: value,
    editorProps: {
      attributes: {
        class: "post-body text-sm text-gray-800",
        role: "textbox",
        "aria-label": "게시글 내용",
        "aria-multiline": "true",
      },
      transformPastedHTML: prepareHtml,
      handleKeyDown: () => !editorRef.current?.isEditable,
      handlePaste: (_view, event) => {
        if (!editorRef.current?.isEditable) return true;
        // Official FileHandler receives clipboard files before plain-text conversion.
        if (event.clipboardData?.files.length) return false;
        // HTML 붙여넣기와 코드 블록 안의 텍스트는 Tiptap 기본 처리를 사용한다.
        if (event.clipboardData?.getData("text/html") || editorRef.current?.isActive("codeBlock"))
          return false;
        const pasted = event.clipboardData?.getData("text/plain");
        if (!pasted || !editorRef.current) return false;
        const youtube = postYoutubeAttributes({ src: pasted });
        if (youtube) {
          event.preventDefault();
          return editorRef.current.commands.setYoutubeVideo(youtube);
        }
        const html =
          /^\s*<(?:p|div|h[1-4]|strong|b|u|em|i|s|del|ol|ul|li|a|br|pre|code|blockquote|hr|img|table)\b/i.test(
            pasted,
          );
        try {
          const content = html ? prepareHtml(pasted) : postDocumentFromMarkdown(pasted);
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

  const insertFiles = (selected: File[]) => {
    if (editor) void files.insert(editor, selected, editor.state.selection.to);
  };

  return { editor, emitted, validity, commitDocument, insertFiles };
}

export type DocumentEditorController = ReturnType<typeof useDocumentEditor>;
