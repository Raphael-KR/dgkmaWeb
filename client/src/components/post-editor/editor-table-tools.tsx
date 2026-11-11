import { useEditorState, type Editor } from "@tiptap/react";
import type { ChainedCommands } from "@tiptap/core";
import { EditorTool } from "./editor-tool";

const actions: { label: string; apply: (chain: ChainedCommands) => ChainedCommands }[] = [
  { label: "위 행 추가", apply: (chain) => chain.addRowBefore() },
  { label: "아래 행 추가", apply: (chain) => chain.addRowAfter() },
  { label: "행 삭제", apply: (chain) => chain.deleteRow() },
  { label: "앞 열 추가", apply: (chain) => chain.addColumnBefore() },
  { label: "뒤 열 추가", apply: (chain) => chain.addColumnAfter() },
  { label: "열 삭제", apply: (chain) => chain.deleteColumn() },
  { label: "셀 병합", apply: (chain) => chain.mergeCells() },
  { label: "셀 분리", apply: (chain) => chain.splitCell() },
  { label: "헤더 행 전환", apply: (chain) => chain.toggleHeaderRow() },
  { label: "헤더 열 전환", apply: (chain) => chain.toggleHeaderColumn() },
  { label: "헤더 셀 전환", apply: (chain) => chain.toggleHeaderCell() },
  { label: "표 삭제", apply: (chain) => chain.deleteTable() },
];

export function EditorTableTools({ editor }: { editor: Editor }) {
  const available = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      actions.map(({ apply }) => apply(current.can().chain()).run()),
  });
  return (
    <div className="mt-2 flex flex-wrap gap-1 border-t pt-2" role="group" aria-label="표 편집">
      {actions.map(({ label, apply }, index) => (
        <EditorTool
          key={label}
          label={label}
          disabled={!available[index]}
          onClick={() => {
            apply(editor.chain().focus()).run();
          }}
        >
          {label}
        </EditorTool>
      ))}
    </div>
  );
}
