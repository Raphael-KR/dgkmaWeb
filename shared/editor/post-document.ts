import { getSchema, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import {
  emptyPostDocument,
  postDocumentSchema,
  type PostDocument,
} from "../contracts/post-document";
import { safePostLink } from "../post-link";
import { postAttachmentPathSchema } from "../contracts/post-input";
import { isTableCell, validTableCellAttributes, validPostTables } from "./post-table";
import { PostYoutube, postYoutubeAttributes } from "./post-youtube";
import { PostItalic, PostUnderline } from "./post-inline-marks";

export const postExtensions = [
  StarterKit.configure({
    // Opening a stored document or moving focus must not append content.
    trailingNode: false,
    italic: false,
    underline: false,
    heading: { levels: [1, 2, 3, 4] },
    link: {
      openOnClick: false,
      defaultProtocol: "https",
      isAllowedUri: (url) => Boolean(safePostLink(url)),
      HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
    },
  }),
  PostItalic,
  PostUnderline,
  Image.configure({ allowBase64: false }),
  TableKit.configure({ table: { renderWrapper: true } }),
  PostYoutube,
];
export const postMarkdownOptions = { gfm: true, breaks: true };
export const postEditorExtensions = [
  ...postExtensions,
  Markdown.configure({ markedOptions: postMarkdownOptions }),
];
export const postSchema = getSchema(postExtensions);
const MAX_DOCUMENT_NODES = 10_000;
const markdown = new MarkdownManager({
  extensions: postExtensions,
  markedOptions: postMarkdownOptions,
});

export class PostDocumentError extends Error {
  constructor(
    public readonly reason: string,
    public readonly path = "doc",
  ) {
    super("본문 서식을 확인해 주세요. 지원하지 않는 형식은 저장할 수 없습니다.");
    this.name = "PostDocumentError";
  }
}

/** Keep standard Tiptap JSON; reject unknown content instead of silently dropping it. */
export function normalizePostDocument(value: unknown): PostDocument {
  if (!postDocumentSchema.safeParse(value).success) throw new PostDocumentError("document_shape");
  if (JSON.stringify(value).length > 250_000) throw new PostDocumentError("document_size");
  const document = structuredClone(value) as PostDocument;
  let count = 0;
  const walk = (node: JSONContent, path: string, depth: number) => {
    if (++count > MAX_DOCUMENT_NODES || depth > 64)
      throw new PostDocumentError("document_complexity", path);
    if (
      !node ||
      typeof node !== "object" ||
      typeof node.type !== "string" ||
      !Object.prototype.hasOwnProperty.call(postSchema.nodes, node.type)
    )
      throw new PostDocumentError("node_type", path);
    if (
      Object.keys(node).some((key) => !["type", "attrs", "text", "content", "marks"].includes(key))
    )
      throw new PostDocumentError("node_property", path);
    const attrs = (
      input: Record<string, unknown> | undefined,
      allowed: Record<string, unknown> | undefined,
      arrayAttribute?: string,
    ) => {
      if (
        input !== undefined &&
        input !== null &&
        (typeof input !== "object" ||
          Array.isArray(input) ||
          Object.entries(input).some(
            ([key, val]) =>
              !Object.prototype.hasOwnProperty.call(allowed ?? {}, key) ||
              (val !== null &&
                !["string", "number", "boolean"].includes(typeof val) &&
                !(key === arrayAttribute && Array.isArray(val))),
          ))
      ) {
        throw new PostDocumentError("attributes", path);
      }
    };
    attrs(
      node.attrs,
      postSchema.nodes[node.type].spec.attrs,
      isTableCell(node.type) ? "colwidth" : undefined,
    );
    if (isTableCell(node.type) && !validTableCellAttributes(node.attrs))
      throw new PostDocumentError("table_cell_attributes", path);
    if (node.type === "youtube") {
      const youtube = postYoutubeAttributes(node.attrs);
      if (!youtube) throw new PostDocumentError("youtube_attributes", path);
      node.attrs = youtube;
    }
    if (node.type === "image") {
      if (!postAttachmentPathSchema.safeParse(node.attrs?.src).success)
        throw new PostDocumentError("image_uri", path);
      for (const key of ["alt", "title"])
        if (node.attrs?.[key] != null && typeof node.attrs[key] !== "string")
          throw new PostDocumentError("image_text", path);
      for (const key of ["width", "height"])
        if (
          node.attrs?.[key] != null &&
          (!["number", "string"].includes(typeof node.attrs[key]) ||
            !Number.isFinite(Number(node.attrs[key])) ||
            Number(node.attrs[key]) <= 0)
        )
          throw new PostDocumentError("image_dimensions", path);
    }
    if (node.type === "heading" && ![1, 2, 3, 4].includes(node.attrs?.level))
      throw new PostDocumentError("heading_level", path);
    if (node.text !== undefined && (node.type !== "text" || typeof node.text !== "string"))
      throw new PostDocumentError("text", path);
    if (node.marks !== undefined && !Array.isArray(node.marks))
      throw new PostDocumentError("marks", path);
    node.marks?.forEach((mark) => {
      if (
        !mark ||
        typeof mark.type !== "string" ||
        !Object.prototype.hasOwnProperty.call(postSchema.marks, mark.type) ||
        Object.keys(mark).some((key) => !["type", "attrs"].includes(key))
      )
        throw new PostDocumentError("mark_type", path);
      attrs(mark.attrs, postSchema.marks[mark.type].spec.attrs);
      if (mark.type === "link") {
        const href = typeof mark.attrs?.href === "string" && safePostLink(mark.attrs.href);
        if (!href) throw new PostDocumentError("link_uri", path);
        if (href.startsWith("/objects/") && !postAttachmentPathSchema.safeParse(href).success)
          throw new PostDocumentError("attachment_uri", path);
        mark.attrs = {
          ...mark.attrs,
          href,
          target: "_blank",
          rel: "noopener noreferrer",
          class: null,
        };
      }
    });
    if (node.content !== undefined && !Array.isArray(node.content))
      throw new PostDocumentError("children", path);
    node.content?.forEach((child, i) => walk(child, `${path}.content[${i}]`, depth + 1));
  };
  walk(document, "doc", 0);
  try {
    const node = postSchema.nodeFromJSON(document);
    node.check();
    if (!validPostTables(node, MAX_DOCUMENT_NODES)) throw new PostDocumentError("table_structure");
    return node.toJSON() as PostDocument;
  } catch (error) {
    if (error instanceof PostDocumentError) throw error;
    throw new PostDocumentError("schema_content");
  }
}

export function postDocumentFromMarkdown(source: string): PostDocument {
  // The official lexer identifies unsupported syntax before the parser can discard it.
  markdown.instance.walkTokens(
    markdown.instance.lexer(source, markdown.instance.defaults),
    (token) => {
      if (token.type === "html" && !/^<br\s*\/?>$/i.test(token.raw.trim())) {
        throw new PostDocumentError(`markdown_${token.type}`);
      }
      if (token.type === "link" && !safePostLink(token.href))
        throw new PostDocumentError("link_uri");
      if (token.type === "image" && !postAttachmentPathSchema.safeParse(token.href).success)
        throw new PostDocumentError("image_uri");
    },
  );
  const parsed = markdown.parse(source);
  return normalizePostDocument(parsed.content?.length ? parsed : emptyPostDocument());
}
export function postDocumentMarkdown(document: PostDocument): string {
  return markdown.serialize(normalizePostDocument(document));
}
export function postDocumentsEqual(left: PostDocument, right: PostDocument): boolean {
  return postSchema
    .nodeFromJSON(normalizePostDocument(left))
    .eq(postSchema.nodeFromJSON(normalizePostDocument(right)));
}
