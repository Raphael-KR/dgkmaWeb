import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  POST_CATEGORY_NAMES,
  isSelectablePostCategory,
} from "@shared/category-policy";

test("only the four approved active post categories are selectable", () => {
  assert.deepEqual(POST_CATEGORY_NAMES, ["notice", "free", "event", "news"]);

  for (const name of POST_CATEGORY_NAMES) {
    assert.equal(isSelectablePostCategory({ name, isActive: true }), true);
  }

  assert.equal(isSelectablePostCategory({ name: "all", isActive: true }), false);
  assert.equal(isSelectablePostCategory({ name: "notice", isActive: false }), false);
  assert.equal(isSelectablePostCategory({ name: "market", isActive: true }), false);
  assert.equal(isSelectablePostCategory(undefined), false);
});

test("server and board form use the shared category policy", async () => {
  const routes = await readFile(new URL("./routes.ts", import.meta.url), "utf8");
  const boards = await readFile(
    new URL("../client/src/pages/boards.tsx", import.meta.url),
    "utf8",
  );

  assert.match(routes, /isSelectablePostCategory\(category\)/);
  assert.match(boards, /\.filter\(isSelectablePostCategory\)/);
});
