import { find } from "linkifyjs";
import type { ReactNode } from "react";
import { safePostLink } from "@shared/post-link";

export function CommentText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const match of find(text, "url", { defaultProtocol: "https" })) {
    if (match.type !== "url" || !/^https?:\/\//i.test(match.href) || !safePostLink(match.href))
      continue;
    parts.push(text.slice(offset, match.start));
    parts.push(
      <a
        key={match.start}
        href={match.href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        {match.value}
      </a>,
    );
    offset = match.end;
  }
  parts.push(text.slice(offset));
  return (
    <p className="whitespace-pre-wrap text-sm text-gray-700 [overflow-wrap:anywhere]">{parts}</p>
  );
}
