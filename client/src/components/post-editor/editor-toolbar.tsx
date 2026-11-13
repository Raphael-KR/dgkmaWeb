import { useRef, type ReactNode, type RefObject } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { CellSelection } from "@tiptap/pm/tables";
import { Bold, Italic, Strikethrough, Link2, Unlink, Underline, Table2 } from "lucide-react";
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
            underline: current.isActive("underline"),
            bold: current.isActive("bold"),
            italic: current.isActive("italic"),
            strike: current.isActive("strike"),
            characters: current.storage.characterCount.characters(),
            link: current.isActive("link"),
            table: current.isActive("table"),
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
        className="z-50 w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-lg border bg-white p-1.5 shadow-lg"
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
