import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { postEditorExtensions, normalizePostDocument, postDocumentFromMarkdown, postDocumentMarkdown, postDocumentsEqual, markdownProjection } from "@shared/editor/post-document";
import type { PostDocument } from "@shared/contracts/post-document";
import { Bold, Italic, Strikethrough, List, ListOrdered, Link2, Unlink, Underline, Code, SquareCode, Quote, Minus, Pilcrow, Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { enteredPostLink } from "@/lib/post-content";
import "./post-content.css";

type Props = {
  value: PostDocument;
  onChange: (document: PostDocument) => void;
  onValidityChange?: (valid: boolean) => void;
  disabled?: boolean;
  onBlur?: () => void;
  id?: string;
  name?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

export const PostBodyEditor = forwardRef<HTMLElement, Props>(function PostBodyEditor(
  { value, onChange, onValidityChange, disabled = false, onBlur, id, name, "aria-describedby": descriptionId, "aria-invalid": invalid }, ref,
) {
  const [mode, setMode] = useState<"visual" | "markdown">("visual");
  const [source, setSource] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [lossless, setLossless] = useState(true);
  const [allowConversion, setAllowConversion] = useState(false);
  const markdownBase = useRef<{ document: PostDocument; source: string } | null>(null);
  const validity = useRef(onValidityChange);
  validity.current = onValidityChange;
  const [linkEditing, setLinkEditing] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const sourceInput = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const change = useRef(onChange);
  const emitted = useRef(value);
  change.current = onChange;

  const editor = useEditor({
    extensions: postEditorExtensions,
    content: value,
    editorProps: {
      attributes: { class: "post-body text-sm text-gray-800", role: "textbox", "aria-label": "게시글 내용", "aria-multiline": "true" },
      handlePaste: (_view, event) => {
        if (event.clipboardData?.getData("text/html") || editorRef.current?.isActive("codeBlock")) return false;
        const pasted = event.clipboardData?.getData("text/plain");
        if (!pasted || !editorRef.current) return false;
        const html = /^\s*<(?:p|div|h[1-4]|strong|b|u|em|i|s|del|ol|ul|li|a|br|pre|code|blockquote|hr)\b/i.test(pasted);
        try {
          const content = html ? pasted : postDocumentFromMarkdown(pasted);
          event.preventDefault();
          return editorRef.current.commands.insertContent(content, { contentType: html ? "html" : "json" });
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
    onSelectionUpdate: () => { setLinkEditing(false); setLinkError(""); },
  });
  editorRef.current = editor;
  useEffect(() => { editor?.setEditable(!disabled, false); }, [editor, disabled]);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => current ? {
      empty: current.isEmpty,
      underline: current.isActive("underline"), code: current.isActive("code"),
      codeBlock: current.isActive("codeBlock"), quote: current.isActive("blockquote"),
      bold: current.isActive("bold"), italic: current.isActive("italic"), strike: current.isActive("strike"),
      bullet: current.isActive("bulletList"), ordered: current.isActive("orderedList"), link: current.isActive("link"),
      heading: [1, 2, 3, 4].find((level) => current.isActive("heading", { level })),
    } : null,
  });

  useImperativeHandle(ref, () => mode === "markdown" ? sourceInput.current! : editor?.view.dom ?? container.current!, [editor, mode]);
  useEffect(() => {
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
  }, [editor, value, mode]);
  useEffect(() => { validity.current?.(true); }, []);
  useEffect(() => {
    if (!editor) return;
    const element = editor.view.dom;
    if (id) element.id = mode === "visual" ? id : `${id}-visual`;
    if (descriptionId) element.setAttribute("aria-describedby", descriptionId);
    else element.removeAttribute("aria-describedby");
    element.setAttribute("aria-invalid", String(invalid ?? false));
  }, [editor, id, mode, descriptionId, invalid]);

  const commitDocument = (document: PostDocument) => {
    if (!editor) return;
    editor.commands.setContent(document, { emitUpdate: false });
    emitted.current = document;
    change.current(document);
    setSourceError("");
    validity.current?.(true);
  };
  const editSource = (text: string) => {
    if (!editor || !lossless && !allowConversion) return;
    setSource(text);
    setCopyStatus("");
    try {
      commitDocument(text === markdownBase.current?.source
        ? markdownBase.current.document : postDocumentFromMarkdown(text));
    } catch {
      setSourceError("지원하지 않는 Markdown 서식이 있습니다. 내용을 수정하거나 변경을 취소해 주세요. 게시 전 마지막 유효 본문이 보존됩니다.");
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
    setLinkEditing(false);
    setMode(next);
  };
  const cancelMarkdown = () => {
    if (markdownBase.current) commitDocument(markdownBase.current.document);
    setMode("visual");
  };
  const applyLink = () => {
    if (!editor) return;
    const href = enteredPostLink(linkValue);
    if (!href) { setLinkError("웹 주소 또는 이메일·전화 링크를 확인해 주세요."); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkEditing(false);
    setLinkError("");
  };
  const copy = async (format: "html" | "markdown") => {
    if (!editor) return;
    try {
      if (format === "html" && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([editor.getHTML()], { type: "text/html" }),
          "text/plain": new Blob([editor.getText()], { type: "text/plain" }),
        })]);
      } else {
        await navigator.clipboard.writeText(format === "html" ? editor.getHTML() : postDocumentMarkdown(normalizePostDocument(editor.getJSON())));
      }
      setCopyStatus(format === "html" ? "HTML로 복사했습니다." : "마크다운으로 복사했습니다.");
    } catch (error) {
      console.warn("Post clipboard write failed", { format, clipboardAvailable: Boolean(navigator.clipboard), errorType: error instanceof Error ? error.name : typeof error, contentOmitted: true });
      setCopyStatus("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
    }
  };
  const tool = (label: string, active: boolean | undefined, action: () => void, icon: ReactNode) =>
    <button key={label} type="button" title={label} aria-label={label} aria-pressed={Boolean(active)}
      className={`h-8 min-w-8 rounded px-2 text-sm hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${active ? "bg-blue-100 text-blue-800" : "text-gray-700"}`}
      onMouseDown={(event) => event.preventDefault()} onClick={action}>{icon}</button>;

  return <div ref={container} className="space-y-2" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur?.();
  }}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-1" aria-label="본문 입력 방식">
        <Button type="button" size="sm" variant={mode === "visual" ? "secondary" : "ghost"} aria-pressed={mode === "visual"} disabled={!editor} onClick={() => switchMode("visual")}>서식</Button>
        <Button type="button" size="sm" variant={mode === "markdown" ? "secondary" : "ghost"} aria-pressed={mode === "markdown"} disabled={!editor} onClick={() => switchMode("markdown")}>마크다운</Button>
      </div>
      <div className="flex gap-1">
        <Button type="button" size="sm" variant="ghost" disabled={!editor || state?.empty || Boolean(sourceError)} onClick={() => void copy("html")}>HTML 복사</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!editor || state?.empty || Boolean(sourceError)} onClick={() => void copy("markdown")}>MD 복사</Button>
      </div>
    </div>
    <p className="text-xs text-muted-foreground">HTML 서식을 붙여 넣거나 마크다운으로 작성하세요. 글자를 선택하면 서식 도구가 나타납니다.</p>
    <div className="post-editor relative rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring" hidden={mode !== "visual"}>
      {state?.empty && <span className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground">게시글 내용을 입력하세요</span>}
      <EditorContent editor={editor} />
    </div>
    {mode === "markdown" && !lossless && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" role="status">
      <p>일부 서식은 Markdown으로 그대로 표현할 수 없습니다. 보기와 복사는 원본을 유지합니다. 변환본을 수정하면 표현되지 않는 서식이 사라질 수 있습니다.</p>
      {!allowConversion && <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setMode("visual")}>서식 편집 계속</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setAllowConversion(true)}>변환본으로 편집</Button>
      </div>}
    </div>}
    {mode === "markdown" && <Textarea ref={sourceInput} id={id} name={name} value={source} readOnly={!lossless && !allowConversion} aria-label="게시글 마크다운 내용" aria-describedby={descriptionId} aria-invalid={invalid}
      onChange={(event) => editSource(event.target.value)} className="min-h-[180px] font-mono text-sm md:min-h-[320px] md:text-base" placeholder="마크다운 내용을 입력하세요" />}
    {sourceError && <p role="alert" className="text-sm text-red-700">{sourceError}</p>}
    {mode === "markdown" && <Button type="button" size="sm" variant="ghost" onClick={cancelMarkdown}>마크다운 변경 취소</Button>}
    {editor && mode === "visual" && <BubbleMenu editor={editor} updateDelay={0} appendTo={() => container.current!} className="z-[60]"
      options={{ placement: "top", offset: 8, flip: true, shift: true }}
      shouldShow={({ editor: current, state: currentState, from, to }) => current.isEditable && !currentState.selection.empty && Boolean(currentState.doc.textBetween(from, to).trim()) && (current.isFocused || Boolean(toolbar.current?.contains(document.activeElement)))}>
      <div ref={toolbar} className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-white p-1.5 shadow-lg" role="toolbar" aria-label="선택한 글자 서식">
        <div className="flex flex-wrap gap-1">
          {tool("굵게", state?.bold, () => editor.chain().focus().toggleBold().run(), <Bold size={16} />)}
          {tool("기울임", state?.italic, () => editor.chain().focus().toggleItalic().run(), <Italic size={16} />)}
          {tool("취소선", state?.strike, () => editor.chain().focus().toggleStrike().run(), <Strikethrough size={16} />)}
          {tool("밑줄", state?.underline, () => editor.chain().focus().toggleUnderline().run(), <Underline size={16} />)}
          {tool("인라인 코드", state?.code, () => editor.chain().focus().toggleCode().run(), <Code size={16} />)}
          {tool("코드 블록", state?.codeBlock, () => editor.chain().focus().toggleCodeBlock().run(), <SquareCode size={16} />)}
          {tool("인용", state?.quote, () => editor.chain().focus().toggleBlockquote().run(), <Quote size={16} />)}
          {tool("구분선", false, () => editor.chain().focus().setHorizontalRule().run(), <Minus size={16} />)}
          {tool("일반 문단", false, () => editor.chain().focus().setParagraph().run(), <Pilcrow size={16} />)}
          {tool("실행 취소", false, () => editor.chain().focus().undo().run(), <Undo2 size={16} />)}
          {tool("다시 실행", false, () => editor.chain().focus().redo().run(), <Redo2 size={16} />)}
          {tool("번호 목록", state?.ordered, () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={16} />)}
          {tool("글머리기호 목록", state?.bullet, () => editor.chain().focus().toggleBulletList().run(), <List size={16} />)}
          {tool("링크", state?.link, () => { setLinkValue(String(editor.getAttributes("link").href ?? "")); setLinkError(""); setLinkEditing((open) => !open); }, <Link2 size={16} />)}
          {state?.link && tool("링크 제거", false, () => editor.chain().focus().extendMarkRange("link").unsetLink().run(), <Unlink size={16} />)}
          {([1, 2, 3, 4] as const).map((level) => tool(`제목 H${level}`, state?.heading === level, () => editor.chain().focus().toggleHeading({ level }).run(), `H${level}`))}
        </div>
        {linkEditing && <div className="mt-2 space-y-2 border-t pt-2">
          <input autoFocus type="text" inputMode="url" aria-label="링크 주소" value={linkValue} placeholder="https://" className="w-full rounded border px-2 py-1 text-sm"
            onChange={(event) => { setLinkValue(event.target.value); setLinkError(""); }}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); applyLink(); } if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setLinkEditing(false); editor.commands.focus(); } }} />
          {linkError && <p role="alert" className="text-xs text-red-700">{linkError}</p>}
          <Button type="button" size="sm" onMouseDown={(event) => event.preventDefault()} onClick={applyLink}>링크 적용</Button>
        </div>}
      </div>
    </BubbleMenu>}
    {copyStatus && <p role="status" className="text-xs text-muted-foreground">{copyStatus}</p>}
  </div>;
});
