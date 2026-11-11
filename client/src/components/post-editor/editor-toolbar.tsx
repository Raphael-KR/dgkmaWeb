import { useRef, type ReactNode, type RefObject } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { CellSelection } from "@tiptap/pm/tables";
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  ListTodo,
  Link2,
  Unlink,
  Underline,
  Code,
  SquareCode,
  Quote,
  Minus,
  Pilcrow,
  Undo2,
  Redo2,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EditorLinkController } from "./use-editor-link";
import { EditorTool } from "./editor-tool";
import { EditorTableTools } from "./editor-table-tools";

export function usePostEditorState(editor: Editor | null) {
  return useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            empty: current.isEmpty,
            underline: current.isActive("underline"),
            code: current.isActive("code"),
            codeBlock: current.isActive("codeBlock"),
            quote: current.isActive("blockquote"),
            bold: current.isActive("bold"),
            italic: current.isActive("italic"),
            strike: current.isActive("strike"),
            bullet: current.isActive("bulletList"),
            ordered: current.isActive("orderedList"),
            task: current.isActive("taskList"),
            characters: current.storage.characterCount.characters(),
            link: current.isActive("link"),
            table: current.isActive("table"),
            heading: [1, 2, 3, 4].find((level) => current.isActive("heading", { level })),
          }
        : null,
  });
}

type Props = {
  editor: Editor;
  container: RefObject<HTMLDivElement>;
  state: ReturnType<typeof usePostEditorState>;
  link: EditorLinkController;
};

export function EditorToolbar({ editor, container, state, link }: Props) {
  const toolbar = useRef<HTMLDivElement>(null);
  const {
    linkEditing,
    setLinkEditing,
    linkValue,
    setLinkValue,
    linkError,
    setLinkError,
    applyLink,
  } = link;
  const tool = (
    label: string,
    active: boolean | undefined,
    action: () => void,
    icon: ReactNode,
  ) => (
    <EditorTool key={label} label={label} active={active} onClick={action}>
      {icon}
    </EditorTool>
  );

  return (
    <BubbleMenu
      editor={editor}
      updateDelay={0}
      appendTo={() => container.current!}
      className="z-[60]"
      options={{ placement: "top", offset: 8, flip: true, shift: true }}
      shouldShow={({ editor: current, state: currentState, from, to }) =>
        current.isEditable &&
        !currentState.selection.empty &&
        (currentState.selection instanceof CellSelection ||
          Boolean(currentState.doc.textBetween(from, to).trim())) &&
        (current.isFocused || Boolean(toolbar.current?.contains(document.activeElement)))
      }
    >
      <div
        ref={toolbar}
        className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-white p-1.5 shadow-lg"
        role="toolbar"
        aria-label="선택한 내용 서식"
      >
        <div className="flex flex-wrap gap-1">
          {tool(
            "굵게",
            state?.bold,
            () => editor.chain().focus().toggleBold().run(),
            <Bold size={16} />,
          )}
          {tool(
            "기울임",
            state?.italic,
            () => editor.chain().focus().toggleItalic().run(),
            <Italic size={16} />,
          )}
          {tool(
            "취소선",
            state?.strike,
            () => editor.chain().focus().toggleStrike().run(),
            <Strikethrough size={16} />,
          )}
          {tool(
            "밑줄",
            state?.underline,
            () => editor.chain().focus().toggleUnderline().run(),
            <Underline size={16} />,
          )}
          {tool(
            "인라인 코드",
            state?.code,
            () => editor.chain().focus().toggleCode().run(),
            <Code size={16} />,
          )}
          {tool(
            "코드 블록",
            state?.codeBlock,
            () => editor.chain().focus().toggleCodeBlock().run(),
            <SquareCode size={16} />,
          )}
          {tool(
            "인용",
            state?.quote,
            () => editor.chain().focus().toggleBlockquote().run(),
            <Quote size={16} />,
          )}
          {tool(
            "구분선",
            false,
            () => editor.chain().focus().setHorizontalRule().run(),
            <Minus size={16} />,
          )}
          {tool(
            "일반 문단",
            false,
            () => editor.chain().focus().setParagraph().run(),
            <Pilcrow size={16} />,
          )}
          {tool("실행 취소", false, () => editor.chain().focus().undo().run(), <Undo2 size={16} />)}
          {tool("다시 실행", false, () => editor.chain().focus().redo().run(), <Redo2 size={16} />)}
          {tool(
            "번호 목록",
            state?.ordered,
            () => editor.chain().focus().toggleOrderedList().run(),
            <ListOrdered size={16} />,
          )}
          {tool(
            "글머리기호 목록",
            state?.bullet,
            () => editor.chain().focus().toggleBulletList().run(),
            <List size={16} />,
          )}
          {tool(
            "체크리스트",
            state?.task,
            () => editor.chain().focus().toggleTaskList().run(),
            <ListTodo size={16} />,
          )}
          {tool(
            "링크",
            state?.link,
            () => {
              setLinkValue(String(editor.getAttributes("link").href ?? ""));
              setLinkError("");
              setLinkEditing((open) => !open);
            },
            <Link2 size={16} />,
          )}
          {state?.link &&
            tool(
              "링크 제거",
              false,
              () => editor.chain().focus().extendMarkRange("link").unsetLink().run(),
              <Unlink size={16} />,
            )}
          {([1, 2, 3, 4] as const).map((level) =>
            tool(
              `제목 H${level}`,
              state?.heading === level,
              () => editor.chain().focus().toggleHeading({ level }).run(),
              `H${level}`,
            ),
          )}
          {!state?.table && (
            <EditorTool
              label="표 삽입"
              disabled={
                !editor
                  .can()
                  .chain()
                  .setTextSelection(editor.state.selection.to)
                  .insertTable()
                  .run()
              }
              onClick={() => {
                editor
                  .chain()
                  .focus()
                  .setTextSelection(editor.state.selection.to)
                  .insertTable()
                  .run();
              }}
            >
              <Table2 size={16} />
            </EditorTool>
          )}
        </div>
        {state?.table && <EditorTableTools editor={editor} />}
        {linkEditing && (
          <div className="mt-2 space-y-2 border-t pt-2">
            <input
              autoFocus
              type="text"
              inputMode="url"
              aria-label="링크 주소"
              value={linkValue}
              placeholder="https://"
              className="w-full rounded border px-2 py-1 text-sm"
              onChange={(event) => {
                setLinkValue(event.target.value);
                setLinkError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  applyLink();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setLinkEditing(false);
                  editor.commands.focus();
                }
              }}
            />
            {linkError && (
              <p role="alert" className="text-xs text-red-700">
                {linkError}
              </p>
            )}
            <Button
              type="button"
              size="sm"
              onMouseDown={(event) => event.preventDefault()}
              onClick={applyLink}
            >
              링크 적용
            </Button>
          </div>
        )}
      </div>
    </BubbleMenu>
  );
}
