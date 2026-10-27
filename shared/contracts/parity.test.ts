import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { z } from "zod";
import * as contracts from "./index";
import * as persistence from "../../server/db/schema";
import * as compatibility from "../schema";

function assertValidationParity(
  browser: z.ZodTypeAny,
  server: z.ZodTypeAny,
  inputs: unknown[],
) {
  for (const input of inputs) {
    const actual = browser.safeParse(input);
    const expected = server.safeParse(input);
    assert.equal(actual.success, expected.success, JSON.stringify(input));
    if (actual.success && expected.success) {
      assert.deepEqual(actual.data, expected.data);
    } else if (!actual.success && !expected.success) {
      assert.deepEqual(actual.error.issues, expected.error.issues);
    }
  }
}

test("browser post validation preserves persistence input boundaries and stripping", () => {
  const base = { title: "동문 소식", content: "내용" };
  const inputs: unknown[] = [
    undefined, null, [], {}, base,
    { title: "", content: "" },
    { ...base, id: 1, createdAt: new Date(), unknown: "stripped" },
  ];
  for (const field of ["categoryId", "authorId"]) {
    for (const value of [
      undefined, null, 0, -1, 1, -2147483648, 2147483647,
      -2147483649, 2147483648, 1.5, NaN, Infinity, "1", true, {},
    ]) {
      inputs.push({ ...base, [field]: value });
    }
  }
  for (const value of [undefined, null, true, false, 0, "true"]) {
    inputs.push({ ...base, isPublished: value });
  }
  for (const value of [
    undefined, null, [], [""], ["/image.jpg"], [1], [null], [false],
    [{}], [["nested"]], [undefined], ["/image.jpg", 1, null, { path: "/other.jpg" }],
    "image.jpg", 1, false, {}, { 0: "/image.jpg", length: 1 },
  ]) {
    inputs.push({ ...base, imageUrls: value });
  }
  for (const field of ["title", "content"]) {
    for (const value of [undefined, null, 1, false, [], {}]) {
      inputs.push({ ...base, [field]: value });
    }
  }
  assertValidationParity(contracts.insertPostSchema, persistence.insertPostSchema, inputs);
});

test("post attachment arrays preserve existing element string coercion", () => {
  const input = {
    title: "동문 소식",
    content: "내용",
    imageUrls: ["/image.jpg", 1, null, false, { path: "/other.jpg" }, ["nested"], undefined],
  };
  const expected = persistence.insertPostSchema.parse(input);
  const actual = contracts.insertPostSchema.parse(input);
  assert.deepEqual(actual.imageUrls, [
    "/image.jpg", "1", "null", "false", "[object Object]", "nested", "undefined",
  ]);
  assert.deepEqual(actual, expected);
});

test("browser comment validation matches server messages, limits and stripping", () => {
  assertValidationParity(contracts.insertCommentSchema, persistence.insertCommentSchema, [
    undefined, null, {}, { content: "" }, { content: " " }, { content: "댓글" },
    { content: "가".repeat(1000) }, { content: "가".repeat(1001) },
    { content: null }, { content: 1 },
    { content: "댓글", authorId: 2, postId: 3, id: 4 },
  ]);
});

test("handwritten validators remain shared with server compatibility exports", () => {
  assert.equal(compatibility.insertObituarySchema, contracts.insertObituarySchema);
  assert.equal(compatibility.updateProfileSchema, contracts.updateProfileSchema);
  assert.equal(compatibility.activityRegionSchema, contracts.activityRegionSchema);
  assert.equal(compatibility.PENDING_REGISTRATION_CONFLICT_REASONS,
    contracts.PENDING_REGISTRATION_CONFLICT_REASONS);
  const obituary = contracts.insertObituarySchema.parse({
    title: "부고", deceasedName: "김동문", deceasedRelation: "부친",
    dateOfDeath: "2026-01-01", authorId: 99,
  });
  assert.deepEqual(obituary, {
    title: "부고", deceasedName: "김동문", deceasedRelation: "부친",
    dateOfDeath: "2026-01-01", funeralHome: "", jangji: "", bankAccount: "",
    chiefMourner: "", contactNumber: "",
  });
  assert.equal(contracts.REGION_OPTIONS.length, 18);
  assert.equal(contracts.ANNUAL_DUES, 50000);
});

test("legacy schema entrypoint preserves persistence table and validator identities", () => {
  for (const key of Object.keys(persistence) as (keyof typeof persistence)[]) {
    assert.equal(compatibility[key], persistence[key], key);
  }
});

test("browser-safe shared modules have no direct or transitive persistence imports", () => {
  const sharedRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const visited = new Set<string>();
  function visit(path: string) {
    if (visited.has(path)) return;
    visited.add(path);
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /(?:drizzle-orm|drizzle-zod|pg-core)/, path);
    const imports = Array.from(source.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g));
    for (const [, specifier] of imports) {
      assert.ok(!specifier.includes("server/"), `${path}: ${specifier}`);
      assert.ok(!/(?:^|\/)schema(?:\.ts)?$/.test(specifier), `${path}: ${specifier}`);
      if (!specifier.startsWith(".") && !specifier.startsWith("@shared/")) continue;
      const target = specifier.startsWith("@shared/")
        ? resolve(sharedRoot, specifier.slice("@shared/".length))
        : resolve(dirname(path), specifier);
      assert.ok(target.startsWith(sharedRoot + "/"), `${path}: ${specifier}`);
      let resolved = target;
      if (!target.endsWith(".ts")) {
        try {
          readFileSync(target + ".ts");
          resolved = target + ".ts";
        } catch {
          resolved = resolve(target, "index.ts");
        }
      }
      visit(resolved);
    }
  }
  // Includes compatibility utilities, excluding the deliberately server-only schema.
  for (const entry of readdirSync(sharedRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".ts") && entry.name !== "schema.ts") {
      visit(resolve(sharedRoot, entry.name));
    }
  }
  visit(resolve(sharedRoot, "contracts/index.ts"));
  for (const entry of readdirSync(resolve(sharedRoot, "domain"))) {
    if (entry.endsWith(".ts")) visit(resolve(sharedRoot, "domain", entry));
  }
});

// These assignments fail TypeScript checking if input or serialized DTO parity drifts.
type JsonDates<T> = {
  [K in keyof T]: T[K] extends Date | null ? string | null : T[K];
};
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
const typeParity: [
  Equal<contracts.InsertPost, persistence.InsertPost>,
  Equal<contracts.InsertComment, persistence.InsertComment>,
  Equal<contracts.Category, JsonDates<persistence.Category>>,
  Equal<contracts.Post, JsonDates<persistence.Post>>,
  Equal<contracts.Comment, JsonDates<persistence.Comment>>,
  Equal<contracts.Obituary, JsonDates<persistence.Obituary>>,
  Equal<contracts.ClientUser, persistence.ClientUser>,
] = [true, true, true, true, true, true, true];
void typeParity;
