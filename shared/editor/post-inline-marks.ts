import { markInputRule, markPasteRule } from "@tiptap/core";
import Italic, {
  starInputRegex,
  starPasteRegex,
  underscoreInputRegex,
  underscorePasteRegex,
} from "@tiptap/extension-italic";
import Underline from "@tiptap/extension-underline";

export const PostItalic = Italic.extend({
  addInputRules() {
    return [markInputRule({ find: starInputRegex, type: this.type })];
  },
  addPasteRules() {
    return [markPasteRule({ find: starPasteRegex, type: this.type })];
  },
  parseMarkdown(token, helpers) {
    // 공식 lexer가 판정한 강조 토큰만 바꿔 코드·링크 주소·이스케이프는 보존한다.
    const mark = token.raw?.startsWith("_") ? "underline" : "italic";
    return helpers.applyMark(mark, helpers.parseInline(token.tokens || []));
  },
});

export const PostUnderline = Underline.extend({
  addInputRules() {
    return [markInputRule({ find: underscoreInputRegex, type: this.type })];
  },
  addPasteRules() {
    return [markPasteRule({ find: underscorePasteRegex, type: this.type })];
  },
});
