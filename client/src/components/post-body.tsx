import { useMemo } from "react";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { postExtensions, normalizePostDocument } from "@shared/editor/post-document";
import { postDocumentText, type PostDocument } from "@shared/contracts/post-document";
import { cn } from "@/lib/utils";
import "./post-content.css";

export function PostBody({ content, className }: { content: PostDocument; className?: string }) {
  const body = useMemo(
    () =>
      renderToReactElement({
        extensions: postExtensions,
        content: normalizePostDocument(content),
      }),
    [content],
  );
  return <div className={cn("post-body text-sm text-gray-800", className)}>{body}</div>;
}

export function PostExcerpt({ content, className }: { content: PostDocument; className?: string }) {
  return <div className={className}>{postDocumentText(content)}</div>;
}
