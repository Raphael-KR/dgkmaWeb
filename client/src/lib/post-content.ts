/** Shared URL policy for pasted links, the editor and rendered post bodies. */
export function safePostLink(value: string): string | undefined {
  const url = value.trim();
  if (!url || /[\u0000-\u0020\u007f]/.test(url)) return;
  if (url.startsWith("#") || /^\/(?![/\\])/.test(url)) return url;
  if (!/^(?:https?:\/\/|mailto:|tel:)/i.test(url)) return;
  try {
    const parsed = new URL(url);
    if (["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) return url;
  } catch { /* Invalid URLs stay plain text; no content or credentials are logged. */ }
}

export function enteredPostLink(value: string): string | undefined {
  const url = value.trim();
  return safePostLink(/^(?:[a-z][a-z\d+.-]*:|[/#])/i.test(url) ? url : `https://${url}`);
}
