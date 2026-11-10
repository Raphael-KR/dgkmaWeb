import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDocumentEditor, type DocumentEditorProps } from "./post-editor/use-document-editor";
import { useMarkdownMode } from "./post-editor/use-markdown-mode";
import { useEditorLink } from "./post-editor/use-editor-link";
import { EditorToolbar, usePostEditorState } from "./post-editor/editor-toolbar";
import { copyEditorContent } from "./post-editor/editor-clipboard";
import "./post-content.css";

type Props = DocumentEditorProps & {
  onBlur?: () => void;
  id?: string;
  name?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

export const PostBodyEditor = forwardRef<HTMLElement, Props>(function PostBodyEditor(
  {
    value,
    onChange,
    onValidityChange,
    disabled = false,
    onBlur,
    id,
    name,
    "aria-describedby": descriptionId,
    "aria-invalid": invalid,
  },
  ref,
) {
  const [sourceError, setSourceError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const sourceInput = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const link = useEditorLink(editorRef);
  const documentEditor = useDocumentEditor({
    value,
    onChange,
    onValidityChange,
    disabled,
    editorRef,
    setSourceError,
    setCopyStatus,
    onSelectionUpdate: link.resetSelection,
  });
  const { editor, validity } = documentEditor;
  const state = usePostEditorState(editor);
  const markdown = useMarkdownMode({
    value,
    documentEditor,
    sourceError,
    setSourceError,
    setCopyStatus,
    closeLinkEditing: () => link.setLinkEditing(false),
  });
  const {
    mode,
    setMode,
    source,
    lossless,
    allowConversion,
    setAllowConversion,
    editSource,
    switchMode,
    cancelMarkdown,
  } = markdown;

  useImperativeHandle(
    ref,
    () => (mode === "markdown" ? sourceInput.current! : (editor?.view.dom ?? container.current!)),
    [editor, mode],
  );
  useEffect(() => {
    validity.current?.(true);
  }, [validity]);
  useEffect(() => {
    if (!editor) return;
    const element = editor.view.dom;
    if (id) element.id = mode === "visual" ? id : `${id}-visual`;
    if (descriptionId) element.setAttribute("aria-describedby", descriptionId);
    else element.removeAttribute("aria-describedby");
    element.setAttribute("aria-invalid", String(invalid ?? false));
  }, [editor, id, mode, descriptionId, invalid]);

  const copy = (format: "html" | "markdown") => copyEditorContent(editor, format, setCopyStatus);

  return (
    <div
      ref={container}
      className="space-y-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur?.();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" aria-label="본문 입력 방식">
          <Button
            type="button"
            size="sm"
            variant={mode === "visual" ? "secondary" : "ghost"}
            aria-pressed={mode === "visual"}
            disabled={!editor}
            onClick={() => switchMode("visual")}
          >
            서식
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "markdown" ? "secondary" : "ghost"}
            aria-pressed={mode === "markdown"}
            disabled={!editor}
            onClick={() => switchMode("markdown")}
          >
            마크다운
          </Button>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!editor || state?.empty || Boolean(sourceError)}
            onClick={() => void copy("html")}
          >
            HTML 복사
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!editor || state?.empty || Boolean(sourceError)}
            onClick={() => void copy("markdown")}
          >
            MD 복사
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        HTML 서식을 붙여 넣거나 마크다운으로 작성하세요. 글자를 선택하면 서식 도구가 나타납니다.
      </p>
      <div
        className="post-editor relative rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring"
        hidden={mode !== "visual"}
      >
        {state?.empty && (
          <span className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground">
            게시글 내용을 입력하세요
          </span>
        )}
        <EditorContent editor={editor} />
      </div>
      {mode === "markdown" && !lossless && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" role="status">
          <p>
            일부 서식은 Markdown으로 그대로 표현할 수 없습니다. 보기와 복사는 원본을 유지합니다.
            변환본을 수정하면 표현되지 않는 서식이 사라질 수 있습니다.
          </p>
          {!allowConversion && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setMode("visual")}>
                서식 편집 계속
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAllowConversion(true)}
              >
                변환본으로 편집
              </Button>
            </div>
          )}
        </div>
      )}
      {mode === "markdown" && (
        <Textarea
          ref={sourceInput}
          id={id}
          name={name}
          value={source}
          readOnly={!lossless && !allowConversion}
          aria-label="게시글 마크다운 내용"
          aria-describedby={descriptionId}
          aria-invalid={invalid}
          onChange={(event) => editSource(event.target.value)}
          className="post-editor-source min-h-[var(--post-editor-min-height)] font-mono text-sm md:text-base"
          placeholder="마크다운 내용을 입력하세요"
        />
      )}
      {sourceError && (
        <p role="alert" className="text-sm text-red-700">
          {sourceError}
        </p>
      )}
      {mode === "markdown" && (
        <Button type="button" size="sm" variant="ghost" onClick={cancelMarkdown}>
          마크다운 변경 취소
        </Button>
      )}
      {editor && mode === "visual" && (
        <EditorToolbar editor={editor} container={container} state={state} link={link} />
      )}
      {copyStatus && (
        <p role="status" className="text-xs text-muted-foreground">
          {copyStatus}
        </p>
      )}
    </div>
  );
});
