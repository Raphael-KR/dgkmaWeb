import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  POST_CATEGORY_NAMES,
  isRegularPostCategory,
  isSelectablePostCategory,
} from "@shared/category-policy";

test("all six active post categories are selectable and regular forms exclude notices", () => {
  assert.deepEqual(POST_CATEGORY_NAMES, [
    "notice",
    "free",
    "event",
    "news",
    "obituary",
    "celebration",
  ]);

  for (const name of POST_CATEGORY_NAMES) {
    assert.equal(isSelectablePostCategory({ name, isActive: true }), true);
    assert.equal(
      isRegularPostCategory({ name, isActive: true }),
      name !== "obituary" && name !== "celebration",
    );
  }

  assert.equal(isSelectablePostCategory({ name: "all", isActive: true }), false);
  assert.equal(isSelectablePostCategory({ name: "notice", isActive: false }), false);
  assert.equal(isSelectablePostCategory({ name: "market", isActive: true }), false);
  assert.equal(isSelectablePostCategory(undefined), false);
});

test("server and board forms use the shared category policy", async () => {
  const [routes, createForm, editForm] = await Promise.all([
    readFile(new URL("../../../../../server/modules/content/routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../create-post-dialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../post-edit-form.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(routes, /isRegularPostCategory\(category\)/);
  for (const form of [createForm, editForm]) {
    assert.match(form, /\.filter\(isRegularPostCategory\)/);
  }
});
