import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import { useDocumentEditor, type DocumentEditorProps } from "./post-editor/use-document-editor";
import { useEditorLink } from "./post-editor/use-editor-link";
import { EditorToolbar, usePostEditorState } from "./post-editor/editor-toolbar";
import { EditorFileUpload } from "./post-editor/editor-file-upload";
import { EditorDragHandle } from "./post-editor/editor-drag-handle";
import "./post-content.css";

type Props = DocumentEditorProps & {
  onBlur?: () => void;
  id?: string;
  uploading?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

export const PostBodyEditor = forwardRef<HTMLElement, Props>(function PostBodyEditor(
  {
    value,
    onChange,
    onValidityChange,
    disabled = false,
    onUploadFiles,
    uploading = false,
    onBlur,
    id,
    "aria-describedby": descriptionId,
    "aria-invalid": invalid,
  },
  ref,
) {
  const [documentError, setDocumentError] = useState("");
  const [status, setStatus] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const link = useEditorLink(editorRef);
  const { editor, validity, insertFiles } = useDocumentEditor({
    value,
    onChange,
    onValidityChange,
    disabled,
    onUploadFiles,
    editorRef,
    setDocumentError,
    setStatus,
    onSelectionUpdate: link.resetSelection,
  });
  const state = usePostEditorState(editor);

  useImperativeHandle(ref, () => editor?.view.dom ?? container.current!, [editor]);
  useEffect(() => {
    validity.current?.(true);
  }, [validity]);
  useEffect(() => {
    if (!editor) return;
    const element = editor.view.dom;
    if (id) element.id = id;
    if (descriptionId) element.setAttribute("aria-describedby", descriptionId);
    else element.removeAttribute("aria-describedby");
    element.setAttribute("aria-invalid", String(invalid ?? false));
  }, [editor, id, descriptionId, invalid]);

  return (
    <div
      ref={container}
      className="space-y-2"
      aria-busy={uploading}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur?.();
      }}
    >
      <div className="post-editor relative rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
        <EditorContent editor={editor} />
        {editor && !disabled && <EditorDragHandle editor={editor} />}
      </div>
      {documentError && (
        <p role="alert" className="text-sm text-red-700">
          {documentError}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        {onUploadFiles && (
          <EditorFileUpload
            disabled={!editor || disabled || Boolean(documentError)}
            onFiles={insertFiles}
          />
        )}
        {uploading && (
          <span role="status" className="text-xs text-muted-foreground">
            업로드 중…
          </span>
        )}
        <p className="ml-auto text-right text-xs text-muted-foreground">
          본문 {(state?.characters ?? 0).toLocaleString("ko-KR")}자
        </p>
      </div>
      {editor && !disabled && (
        <EditorToolbar editor={editor} container={container} state={state} link={link} />
      )}
      {status && (
        <p role="status" className="text-xs text-muted-foreground">
          {status}
        </p>
      )}
    </div>
  );
});
