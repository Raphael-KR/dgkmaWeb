import assert from "node:assert/strict";
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
