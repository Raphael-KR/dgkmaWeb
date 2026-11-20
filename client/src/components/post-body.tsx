import { importedPostDisplay } from "@/lib/imported-post-display";
import { useMemo } from "react";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { postExtensions, normalizePostDocument } from "@shared/editor/post-document";
import { postDocumentText, type PostDocument } from "@shared/contracts/post-document";
import { cn } from "@/lib/utils";
import "./post-content.css";

export function PostBody({
  content,
  className,
  imported = false,
}: {
  content: PostDocument;
  className?: string;
  imported?: boolean;
}) {
  const body = useMemo(
    () =>
      renderToReactElement({
        extensions: postExtensions,
        content: normalizePostDocument(importedPostDisplay(content, imported)),
      }),
    [content, imported],
  );
  return (
    <div className={cn("post-body site-reading-width text-sm text-gray-800", className)}>
      {body}
    </div>
  );
}

export function PostExcerpt({
  content,
  className,
  imported = false,
}: {
  content: PostDocument;
  className?: string;
  imported?: boolean;
}) {
  return (
    <div className={className}>{postDocumentText(importedPostDisplay(content, imported))}</div>
  );
}
