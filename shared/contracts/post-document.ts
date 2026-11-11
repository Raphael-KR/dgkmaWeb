import type { JSONContent } from "@tiptap/core";
import { z } from "zod";

export type PostDocument = JSONContent & { type: "doc"; content: JSONContent[] };

// Lightweight wire contract. The server checks the complete official schema before writing.
export const postDocumentSchema = z.custom<PostDocument>(
  (value) =>
    Boolean(
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as PostDocument).type === "doc" &&
      Array.isArray((value as PostDocument).content),
    ),
  "본문은 Tiptap JSON 문서여야 합니다.",
);
export const emptyPostDocument = (): PostDocument => ({
  type: "doc",
  content: [{ type: "paragraph" }],
});

/** Image references stay in the document; attachment arrays remain separate. */
export function postDocumentImagePaths(document: PostDocument): string[] {
  const paths: string[] = [];
  const pending = [...document.content];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== "object") continue;
    if (node.type === "image" && typeof node.attrs?.src === "string") paths.push(node.attrs.src);
    if (Array.isArray(node.content)) for (const child of node.content) pending.push(child);
  }
  return paths;
}

/** One linked file can span multiple text nodes when its label has formatting. */
export function postDocumentFilePaths(document: PostDocument): string[] {
  const paths = new Set<string>();
  const pending = [...document.content];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node.marks))
      for (const mark of node.marks) {
        const href = typeof mark?.attrs?.href === "string" ? mark.attrs.href.trim() : undefined;
        if (mark?.type === "link" && typeof href === "string" && href.startsWith("/objects/"))
          paths.add(href);
      }
    if (Array.isArray(node.content)) for (const child of node.content) pending.push(child);
  }
  return Array.from(paths);
}
export const POST_TEXT_BOUNDARIES = [
  "paragraph",
  "heading",
  "codeBlock",
  "hardBreak",
  "horizontalRule",
] as const;

/** Derived text only: inline marks never split words; blocks and hard breaks separate lines. */
export function postDocumentText(document: PostDocument): string {
  const parts: string[] = [];
  const walk = (node: JSONContent) => {
    if (POST_TEXT_BOUNDARIES.some((type) => type === node.type)) parts.push("\n");
    if (node.type === "text") parts.push(node.text ?? "");
    node.content?.forEach(walk);
  };
  walk(document);
  return parts.join("").trim();
}
