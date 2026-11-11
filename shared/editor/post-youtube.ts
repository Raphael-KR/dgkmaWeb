import Youtube, { getEmbedUrlFromYoutubeUrl } from "@tiptap/extension-youtube";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

// Official HTML/Markdown attributes may contain decimal strings.
function numericAttribute(value: unknown, fallback: number) {
  if (value == null) return fallback;
  if (typeof value === "number") return value;
  return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
}

/** Validate at both input and storage boundaries, before an iframe can load. */
export function postYoutubeAttributes(attrs: Record<string, unknown> | undefined) {
  if (typeof attrs?.src !== "string") return null;
  try {
    const url = new URL(attrs.src.trim());
    if (
      !["https:", "http:"].includes(url.protocol) ||
      !YOUTUBE_HOSTS.has(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      return null;
    const embed = getEmbedUrlFromYoutubeUrl({ url: url.href, nocookie: true });
    if (!embed) return null;
    const id = new URL(embed).pathname.match(/^\/embed\/([\w-]{11})$/)?.[1];
    if (!id) return null;
    const start = numericAttribute(attrs.start ?? url.searchParams.get("start"), 0);
    const width = numericAttribute(attrs.width, 640);
    const height = numericAttribute(attrs.height, 360);
    if (
      !Number.isSafeInteger(start) ||
      start < 0 ||
      !Number.isSafeInteger(width) ||
      width <= 0 ||
      !Number.isSafeInteger(height) ||
      height <= 0
    )
      return null;
    return { src: `https://www.youtube.com/watch?v=${id}`, start, width, height };
  } catch {
    return null;
  }
}

export const PostYoutube = Youtube.extend({
  parseHTML() {
    return (this.parent?.() ?? []).map((rule) => ({
      ...rule,
      getAttrs: (element: HTMLElement) =>
        postYoutubeAttributes({ src: element.getAttribute("src") }) ? null : false,
    }));
  },
  renderHTML(props) {
    const attrs = postYoutubeAttributes(props.HTMLAttributes);
    if (!attrs) return ["p", {}, "지원하지 않는 YouTube 주소입니다."];
    // The official renderer preserves /embed/ URLs verbatim. Canonical watch URLs
    // ensure nocookie/autoplay options also apply to pasted HTML and stored JSON.
    return this.parent!({ ...props, HTMLAttributes: { ...props.HTMLAttributes, ...attrs } });
  },
}).configure({
  nocookie: true,
  autoplay: false,
  width: 640,
  height: 360,
  // The existing HTML/Markdown paste bridge calls the official insertion command.
  addPasteHandler: false,
  HTMLAttributes: {
    title: "YouTube 영상",
    loading: "lazy",
    referrerPolicy: "strict-origin-when-cross-origin",
  },
});
