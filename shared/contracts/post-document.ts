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
