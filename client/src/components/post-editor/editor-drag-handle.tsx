import { DragHandle } from "@tiptap/extension-drag-handle-react";
import type { Editor } from "@tiptap/react";
import { GripVertical } from "lucide-react";

export function EditorDragHandle({ editor }: { editor: Editor }) {
  return (
    <DragHandle editor={editor} className="post-editor-drag-handle">
      <span title="드래그하여 블록 이동" aria-label="드래그하여 블록 이동">
        <GripVertical size={20} aria-hidden="true" />
      </span>
    </DragHandle>
  );
}
