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
        options: {
          nodeMapping: {
            taskItem: ({ node, children }) => (
              <li data-type="taskItem" data-checked={node.attrs.checked}>
                <label>
                  <input
                    type="checkbox"
                    checked={node.attrs.checked}
                    readOnly
                    disabled
                    aria-label="완료 여부"
                  />
                </label>
                <div>{children}</div>
              </li>
            ),
          },
        },
      }),
    [content],
  );
  return (
    <div className={cn("post-body site-reading-width text-sm text-gray-800", className)}>
      {body}
    </div>
  );
}

export function PostExcerpt({ content, className }: { content: PostDocument; className?: string }) {
  return <div className={className}>{postDocumentText(content)}</div>;
}
