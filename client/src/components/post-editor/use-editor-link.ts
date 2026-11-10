import { useState, type MutableRefObject } from "react";
import type { Editor } from "@tiptap/react";
import { enteredPostLink } from "@shared/post-link";

export function useEditorLink(editorRef: MutableRefObject<Editor | null>) {
  const [linkEditing, setLinkEditing] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState("");

  const resetSelection = () => {
    setLinkEditing(false);
    setLinkError("");
  };

  const applyLink = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const href = enteredPostLink(linkValue);
    if (!href) {
      setLinkError("웹 주소 또는 이메일·전화 링크를 확인해 주세요.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkEditing(false);
    setLinkError("");
  };

  return {
    linkEditing,
    setLinkEditing,
    linkValue,
    setLinkValue,
    linkError,
    setLinkError,
    resetSelection,
    applyLink,
  };
}

export type EditorLinkController = ReturnType<typeof useEditorLink>;
