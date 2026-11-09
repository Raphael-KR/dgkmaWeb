import { getSchema, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import { emptyPostDocument, postDocumentSchema, type PostDocument } from "../contracts/post-document";
import { safePostLink } from "../post-link";

export const postExtensions = [StarterKit.configure({
  // Opening a stored document or blurring for Markdown view must not append content.
  trailingNode: false,
  heading: { levels: [1, 2, 3, 4] },
  link: {
    openOnClick: false, defaultProtocol: "https",
    isAllowedUri: (url) => Boolean(safePostLink(url)),
    HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
  },
})];
export const postMarkdownOptions = { gfm: true, breaks: true };
export const postEditorExtensions = [...postExtensions, Markdown.configure({ markedOptions: postMarkdownOptions })];
export const postSchema = getSchema(postExtensions);
const markdown = new MarkdownManager({ extensions: postExtensions, markedOptions: postMarkdownOptions });

export class PostDocumentError extends Error {
  constructor(public readonly reason: string, public readonly path = "doc") {
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
    if (++count > 10_000 || depth > 64) throw new PostDocumentError("document_complexity", path);
    if (!node || typeof node !== "object" || typeof node.type !== "string"
      || !Object.prototype.hasOwnProperty.call(postSchema.nodes, node.type)) throw new PostDocumentError("node_type", path);
    if (Object.keys(node).some((key) => !["type", "attrs", "text", "content", "marks"].includes(key))) throw new PostDocumentError("node_property", path);
    const attrs = (input: Record<string, unknown> | undefined, allowed: Record<string, unknown> | undefined) => {
      if (input !== undefined && input !== null && (typeof input !== "object" || Array.isArray(input)
        || Object.entries(input).some(([key, val]) => !Object.prototype.hasOwnProperty.call(allowed ?? {}, key) || val !== null && !["string", "number", "boolean"].includes(typeof val)))) {
        throw new PostDocumentError("attributes", path);
      }
    };
    attrs(node.attrs, postSchema.nodes[node.type].spec.attrs);
    if (node.type === "heading" && ![1, 2, 3, 4].includes(node.attrs?.level)) throw new PostDocumentError("heading_level", path);
    if (node.text !== undefined && (node.type !== "text" || typeof node.text !== "string")) throw new PostDocumentError("text", path);
    if (node.marks !== undefined && !Array.isArray(node.marks)) throw new PostDocumentError("marks", path);
    node.marks?.forEach((mark) => {
      if (!mark || typeof mark.type !== "string" || !Object.prototype.hasOwnProperty.call(postSchema.marks, mark.type)
        || Object.keys(mark).some((key) => !["type", "attrs"].includes(key))) throw new PostDocumentError("mark_type", path);
      attrs(mark.attrs, postSchema.marks[mark.type].spec.attrs);
      if (mark.type === "link") {
        const href = typeof mark.attrs?.href === "string" && safePostLink(mark.attrs.href);
        if (!href) throw new PostDocumentError("link_uri", path);
        mark.attrs = { ...mark.attrs, href, target: "_blank", rel: "noopener noreferrer", class: null };
      }
    });
    if (node.content !== undefined && !Array.isArray(node.content)) throw new PostDocumentError("children", path);
    node.content?.forEach((child, i) => walk(child, `${path}.content[${i}]`, depth + 1));
  };
  walk(document, "doc", 0);
  try {
    const node = postSchema.nodeFromJSON(document);
    node.check();
    return node.toJSON() as PostDocument;
  } catch { throw new PostDocumentError("schema_content"); }
}

export function postDocumentFromMarkdown(source: string): PostDocument {
  // The official lexer identifies unsupported syntax before the parser can discard it.
  markdown.instance.walkTokens(markdown.instance.lexer(source, markdown.instance.defaults), (token) => {
    if (["table", "image", "html"].includes(token.type) || token.type === "list_item" && token.task) {
      throw new PostDocumentError(`markdown_${token.type}`);
    }
    if (token.type === "link" && !safePostLink(token.href)) throw new PostDocumentError("link_uri");
  });
  const parsed = markdown.parse(source);
  return normalizePostDocument(parsed.content?.length ? parsed : emptyPostDocument());
}
export function postDocumentMarkdown(document: PostDocument): string {
  return markdown.serialize(normalizePostDocument(document));
}
export function postDocumentsEqual(left: PostDocument, right: PostDocument): boolean {
  return postSchema.nodeFromJSON(normalizePostDocument(left)).eq(postSchema.nodeFromJSON(normalizePostDocument(right)));
}
export function markdownProjection(document: PostDocument) {
  const source = postDocumentMarkdown(document);
  try { return { source, lossless: postDocumentsEqual(document, postDocumentFromMarkdown(source)) }; }
  catch { return { source, lossless: false }; }
}
