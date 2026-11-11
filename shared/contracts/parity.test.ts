import assert from "node:assert/strict";
import test from "node:test";
import * as contracts from "./index";
import * as persistence from "../../server/db/schema";
import * as compatibility from "../schema";

const post = {
  title: "동문 소식",
  content: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "내용" }] }],
  },
};

test("post metadata validates types and strips persistence-only fields", () => {
  assert.deepEqual(
    contracts.insertPostSchema.parse({
      ...post,
      id: 1,
      createdAt: new Date(),
      unknown: "stripped",
    }),
    post,
  );
  for (const input of [undefined, {}, { title: "", content: "" }]) {
    assert.equal(contracts.insertPostSchema.safeParse(input).success, false);
  }
  for (const field of ["categoryId", "authorId"]) {
    for (const value of [undefined, null, -2147483648, 2147483647]) {
      assert.equal(contracts.insertPostSchema.safeParse({ ...post, [field]: value }).success, true);
    }
    for (const value of [-2147483649, 2147483648, 1.5, "1"]) {
      assert.equal(
        contracts.insertPostSchema.safeParse({ ...post, [field]: value }).success,
        false,
      );
    }
  }
  for (const value of [undefined, null, true, false]) {
    assert.equal(
      contracts.insertPostSchema.safeParse({ ...post, isPublished: value }).success,
      true,
    );
  }
  assert.equal(
    contracts.insertPostSchema.safeParse({ ...post, isPublished: "true" }).success,
    false,
  );
  for (const field of ["title", "content"]) {
    for (const value of [undefined, null, 1]) {
      assert.equal(
        contracts.insertPostSchema.safeParse({ ...post, [field]: value }).success,
        false,
      );
    }
  }
  for (const imageUrls of [undefined, null, []]) {
    assert.equal(contracts.insertPostSchema.safeParse({ ...post, imageUrls }).success, true);
  }
});

test("post images require an array of attachment paths", () => {
  for (const imageUrls of [[""], ["/image.jpg"], [1], "image.jpg"]) {
    assert.equal(contracts.insertPostSchema.safeParse({ ...post, imageUrls }).success, false);
  }
});

test("comments preserve limits and strip persistence-only fields", () => {
  for (const input of [
    undefined,
    {},
    { content: "" },
    { content: " " },
    { content: "가".repeat(1001) },
    { content: 1 },
  ]) {
    assert.equal(contracts.insertCommentSchema.safeParse(input).success, false);
  }
  for (const content of ["댓글", "가".repeat(1000)]) {
    assert.deepEqual(contracts.insertCommentSchema.parse({ content }), {
      content,
      attachmentPath: null,
    });
  }
  assert.deepEqual(
    contracts.insertCommentSchema.parse({
      content: "댓글",
      authorId: 2,
      postId: 3,
      id: 4,
      isHidden: false,
      revision: 9,
    }),
    { content: "댓글", attachmentPath: null },
  );
  const attachmentPath = "/objects/uploads/example";
  assert.deepEqual(contracts.insertCommentSchema.parse({ content: "", attachmentPath }), {
    content: "",
    attachmentPath,
  });
  assert.equal(
    contracts.insertCommentSchema.safeParse({ content: "", attachmentPath: [attachmentPath] })
      .success,
    false,
  );
  assert.equal(contracts.updateCommentSchema.safeParse({ content: "댓글" }).success, false);
  assert.equal(
    contracts.commentVisibilitySchema.safeParse({ revision: 0, isHidden: true }).success,
    true,
  );
});

test("server compatibility exports keep the shared validators and persistence identities", () => {
  for (const key of [
    "insertPostSchema",
    "insertCommentSchema",
    "updateProfileSchema",
    "activityRegionSchema",
    "PENDING_REGISTRATION_CONFLICT_REASONS",
  ] as const) {
    assert.equal(compatibility[key], contracts[key], key);
  }
  for (const key of Object.keys(persistence) as (keyof typeof persistence)[]) {
    assert.equal(compatibility[key], persistence[key], key);
  }
});

// These assignments fail TypeScript checking if input or serialized DTO parity drifts.
type JsonDates<T> = {
  [K in keyof T]: T[K] extends Date | null ? string | null : T[K];
};
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const typeParity: [
  Equal<contracts.Category, JsonDates<persistence.Category>>,
  Equal<
    contracts.Post,
    JsonDates<
      Omit<persistence.Post, "eventData" | "sourceText"> & {
        eventType: contracts.NoticeType | null;
      }
    >
  >,
  Equal<contracts.Comment, JsonDates<persistence.Comment>>,
] = [true, true, true];
void typeParity;
