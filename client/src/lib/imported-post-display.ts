import type { JSONContent } from "@tiptap/core";
import type { PostDocument } from "@shared/contracts/post-document";

// Presentation only: keep the stored document and download metadata unchanged.
export function importedPostDisplay(content: PostDocument, imported: boolean): PostDocument {
  if (!imported || import.meta.env.DEV) return content;
  const filenames = /^[^/\\\r\n:;!?]{1,250}\.(?:hwp|hwpx|docx?|xlsx?|pptx?|pdf|csv|txt|md|zip)$/i;
  const text = (node: JSONContent): string =>
    (node.text ?? "") + (node.content ?? []).map(text).join("");
  const links = new Map<string, number>();
  function transform(node: JSONContent): JSONContent | null {
    if (
      node.type === "paragraph" &&
      filenames.test(text(node).trim()) &&
      !(node.content ?? []).some((child) => child.marks?.some((mark) => mark.type === "link"))
    )
      return null;
    const href = node.marks?.find((mark) => mark.type === "link")?.attrs?.href;
    if (node.type === "text" && typeof href === "string" && href.startsWith("/objects/")) {
      const first = !links.has(href);
      if (first) links.set(href, links.size + 1);
      return first ? { ...node, text: `첨부파일 ${links.get(href)} 다운로드` } : null;
    }
    return {
      ...node,
      ...(node.content
        ? {
            content: node.content.flatMap((child) => {
              const next = transform(child);
              return next ? [next] : [];
            }),
          }
        : {}),
    };
  }
  const result = transform(content) as PostDocument;
  function ensureCell(node: JSONContent) {
    if (["tableCell", "tableHeader", "listItem"].includes(node.type ?? "") && !node.content?.length)
      node.content = [{ type: "paragraph" }];
    node.content?.forEach(ensureCell);
  }
  ensureCell(result);
  if (!result.content.length) result.content = [{ type: "paragraph" }];
  return result;
}
