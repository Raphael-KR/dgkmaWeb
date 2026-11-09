import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Bold, Italic, Strikethrough, List, ListOrdered, Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { enteredPostLink, safePostLink } from "@/lib/post-content";
import "./post-content.css";

type Props = {
  value: string;
  onChange: (markdown: string) => void;
  onBlur?: () => void;
  id?: string;
  name?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

export const PostBodyEditor = forwardRef<HTMLElement, Props>(function PostBodyEditor(
  { value, onChange, onBlur, id, name, "aria-describedby": descriptionId, "aria-invalid": invalid }, ref,
) {
  const [mode, setMode] = useState<"visual" | "markdown">("visual");
  const [source, setSource] = useState(value);
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
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        blockquote: false, code: false, codeBlock: false, horizontalRule: false, underline: false,
        link: {
          openOnClick: false,
          defaultProtocol: "https",
          isAllowedUri: (url) => Boolean(safePostLink(url)),
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
        },
      }),
      Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
    ],
    content: value,
    contentType: "markdown",
    editorProps: {
      attributes: { class: "post-body text-sm text-gray-800", role: "textbox", "aria-label": "게시글 내용", "aria-multiline": "true" },
      handlePaste: (_view, event) => {
        // Rich clipboard HTML uses Tiptap's schema parser; text accepts Markdown or copied HTML source.
        if (event.clipboardData?.getData("text/html")) return false;
        const pasted = event.clipboardData?.getData("text/plain");
        if (!pasted || !editorRef.current) return false;
        event.preventDefault();
        const html = /^\s*<(?:p|div|h[1-4]|strong|b|em|i|s|del|ol|ul|li|a|br)\b/i.test(pasted);
        return editorRef.current.commands.insertContent(pasted, { contentType: html ? "html" : "markdown" });
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = current.isEmpty ? "" : current.getMarkdown();
      emitted.current = markdown;
      setSource(markdown);
      setCopyStatus("");
      change.current(markdown);
    },
    onSelectionUpdate: () => { setLinkEditing(false); setLinkError(""); },
  });
  editorRef.current = editor;
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => current ? {
      empty: current.isEmpty,
      bold: current.isActive("bold"), italic: current.isActive("italic"), strike: current.isActive("strike"),
      bullet: current.isActive("bulletList"), ordered: current.isActive("orderedList"), link: current.isActive("link"),
      heading: [1, 2, 3, 4].find((level) => current.isActive("heading", { level })),
    } : null,
  });

  useImperativeHandle(ref, () => mode === "markdown" ? sourceInput.current! : editor?.view.dom ?? container.current!, [editor, mode]);
  useEffect(() => {
    if (!editor || value === emitted.current) return;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    emitted.current = value;
    setSource(value);
    setCopyStatus("");
  }, [editor, value]);
  useEffect(() => {
    if (!editor) return;
    const element = editor.view.dom;
    if (id) element.id = mode === "visual" ? id : `${id}-visual`;
    if (descriptionId) element.setAttribute("aria-describedby", descriptionId);
    else element.removeAttribute("aria-describedby");
    element.setAttribute("aria-invalid", String(invalid ?? false));
  }, [editor, id, mode, descriptionId, invalid]);

  const editSource = (text: string) => {
    if (!editor) return;
    setSource(text);
    setCopyStatus("");
    editor.commands.setContent(text, { contentType: "markdown", emitUpdate: false });
    const markdown = editor.isEmpty ? "" : editor.getMarkdown();
    emitted.current = markdown;
    change.current(markdown);
  };
  const switchMode = (next: typeof mode) => {
    if (next === mode || !editor) return;
    if (next === "markdown") setSource(editor.getMarkdown());
    setLinkEditing(false);
    setMode(next);
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
        await navigator.clipboard.writeText(format === "html" ? editor.getHTML() : editor.getMarkdown());
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
        <Button type="button" size="sm" variant="ghost" disabled={!editor || state?.empty} onClick={() => void copy("html")}>HTML 복사</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!editor || state?.empty} onClick={() => void copy("markdown")}>MD 복사</Button>
      </div>
    </div>
    <p className="text-xs text-muted-foreground">HTML 서식을 붙여 넣거나 마크다운으로 작성하세요. 글자를 선택하면 서식 도구가 나타납니다.</p>
    <div className="post-editor relative rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring" hidden={mode !== "visual"}>
      {state?.empty && <span className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground">게시글 내용을 입력하세요</span>}
      <EditorContent editor={editor} />
    </div>
    {mode === "markdown" && <Textarea ref={sourceInput} id={id} name={name} value={source} aria-label="게시글 마크다운 내용" aria-describedby={descriptionId} aria-invalid={invalid}
      onChange={(event) => editSource(event.target.value)} className="min-h-[180px] font-mono text-sm md:min-h-[320px] md:text-base" placeholder="마크다운 내용을 입력하세요" />}
    {editor && mode === "visual" && <BubbleMenu editor={editor} updateDelay={0} appendTo={() => container.current!} className="z-[60]"
      options={{ placement: "top", offset: 8, flip: true, shift: true }}
      shouldShow={({ editor: current, state: currentState, from, to }) => current.isEditable && !currentState.selection.empty && Boolean(currentState.doc.textBetween(from, to).trim()) && (current.isFocused || Boolean(toolbar.current?.contains(document.activeElement)))}>
      <div ref={toolbar} className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-white p-1.5 shadow-lg" role="toolbar" aria-label="선택한 글자 서식">
        <div className="flex flex-wrap gap-1">
          {tool("굵게", state?.bold, () => editor.chain().focus().toggleBold().run(), <Bold size={16} />)}
          {tool("기울임", state?.italic, () => editor.chain().focus().toggleItalic().run(), <Italic size={16} />)}
          {tool("취소선", state?.strike, () => editor.chain().focus().toggleStrike().run(), <Strikethrough size={16} />)}
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
