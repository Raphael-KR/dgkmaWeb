import type { ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { cn } from "@/lib/utils";
import { safePostLink } from "@/lib/post-content";
import "./post-content.css";

const elements = ["p", "br", "strong", "em", "del", "ol", "ul", "li", "a", "h1", "h2", "h3", "h4"];
const plugins = [remarkGfm, remarkBreaks];
const components: Components = {
  a: ({ href, children }) => {
    const safe = href && safePostLink(href);
    return safe ? <a href={safe} target="_blank" rel="noopener noreferrer">{children}</a> : <>{children}</>;
  },
};

/** Never enables raw HTML. Clipboard HTML is normalized by the editor before saving. */
export function PostBody({ content, className }: { content: string; className?: string }) {
  return <div className={cn("post-body text-sm text-gray-800", className)}>
    <Markdown remarkPlugins={plugins} allowedElements={elements} unwrapDisallowed skipHtml
      urlTransform={(url) => safePostLink(url) ?? ""} components={components}>{content}</Markdown>
  </div>;
}

const text = ({ children }: { children?: ReactNode }) => <>{children}</>;
const separated = ({ children }: { children?: ReactNode }) => <>{children}{" "}</>;
const excerptComponents: Components = {
  p: separated, h1: separated, h2: separated, h3: separated, h4: separated,
  ol: separated, ul: separated, li: separated,
  strong: text, em: text, del: text, a: text, br: () => <> </>,
};

/** Parse the complete source before clamping, so truncation cannot split Markdown delimiters. */
export function PostExcerpt({ content, className }: { content: string; className?: string }) {
  return <div className={className}>
    <Markdown remarkPlugins={plugins} allowedElements={elements} unwrapDisallowed skipHtml
      urlTransform={(url) => safePostLink(url) ?? ""} components={excerptComponents}>{content}</Markdown>
  </div>;
}
