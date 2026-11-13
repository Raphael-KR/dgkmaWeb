import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { postDocumentText } from "../contracts/post-document";
import { normalizePostDocument, postDocumentFromMarkdown, postExtensions } from "./post-document";

// Reuse the four input examples approved in the product policy.
const examples = [
  ["_내용_", "underline", "u"],
  ["*내용*", "italic", "em"],
  ["**내용**", "bold", "strong"],
  ["__내용__", "bold", "strong"],
] as const;

for (const [source, mark, tag] of examples) {
  test(`${source} keeps the approved mark through JSON validation and display`, () => {
    const document = normalizePostDocument(postDocumentFromMarkdown(source));
    assert.equal(postDocumentText(document), "내용");
    assert.deepEqual(document.content[0].content?.[0].marks, [{ type: mark }]);
    assert.equal(
      renderToStaticMarkup(renderToReactElement({ extensions: postExtensions, content: document })),
      `<p><${tag}>내용</${tag}></p>`,
    );
  });
}
