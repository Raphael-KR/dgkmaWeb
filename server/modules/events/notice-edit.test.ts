import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import type { Express, Request, RequestHandler, Response } from "express";
import {
  emptyNoticeFacts,
  postDocumentText,
  type NoticeData,
  type NoticeEditPreview,
  type NoticeSource,
  type PostDocument,
} from "@shared/contracts";
import { postDocumentFromMarkdown } from "@shared/editor/post-document";

// Execute the real preview/save handlers and renderers without importing a DB
// or calling an external collector/LLM. No account, post, or test DB is created.
test("notice corrections render and save the selected URL for every notice type", async (t) => {
  const key = Symbol.for("dgkma.notice-edit-test");
  const globals = globalThis as typeof globalThis & { [key: symbol]: unknown };
  const oldSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  t.after(() => {
    if (oldSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = oldSecret;
    delete globals[key];
  });
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("External fetch is not allowed in this test");
  });

  const oldUrl = "https://example.com/notice";
  const newUrl = "https://example.com/obituary";
  const otherUrl = "https://expired.example/notice";
  const oldSource: NoticeSource = { url: oldUrl, status: "fetched" };
  const newSource: NoticeSource = { url: newUrl, status: "fetched" };
  const otherSource: NoticeSource = { url: otherUrl, status: "fetched" };
  type Saved = { eventData: NoticeData; title: string; content: PostDocument };
  type Published = Saved & {
    id: number;
    authorId: number;
    revision: number;
    isPublished: boolean;
    isHidden: boolean;
  };
  let facts = emptyNoticeFacts();
  let post: Published | undefined;
  let saved: Saved | undefined;
  const user = { id: 7, name: "김동국", phoneNumber: "010-0000-0000", isAdmin: false };
  const storage = {
    async getOwnNotice(id: number, userId: number) {
      assert.equal(id, 1);
      assert.equal(userId, user.id);
      return post;
    },
    async getUser(id: number) {
      assert.equal(id, user.id);
      return user;
    },
    async getAlumniRecordByUserId(id: number) {
      assert.equal(id, user.id);
      return {
        name: user.name,
        admissionDate: "2007-03-01",
        generation: "20",
        mobile: user.phoneNumber,
      };
    },
    async getMembershipStatus(id: number) {
      assert.equal(id, user.id);
      return { tier: "회원" };
    },
    async updatePublishedNotice(id: number, userId: number, revision: number, payload: Saved) {
      assert.equal(id, post?.id);
      assert.equal(userId, user.id);
      assert.equal(revision, post?.revision);
      assert.ok(post);
      saved = structuredClone(payload);
      post = { ...post, ...saved, revision: revision + 1 };
      return post;
    },
  };
  globals[key] = { storage, getFacts: () => structuredClone(facts) };

  await mkdir(".superpowers", { recursive: true });
  const temporary = await mkdtemp(resolve(".superpowers/notice-edit-test-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const entry = resolve("server/modules/events/notice-edit.ts");
  const output = resolve(temporary, "notice-edit.mjs");
  const bundled = await build({
    entryPoints: [entry],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    metafile: true,
    plugins: [
      {
        name: "notice-edit-memory-boundaries",
        setup(builder) {
          builder.onResolve({ filter: /^(\.\.\/\.\.\/storage|\.\/notice-extraction)$/ }, (args) => {
            if (args.importer !== entry) return;
            return { path: args.path, namespace: "notice-edit-memory" };
          });
          builder.onLoad({ filter: /.*/, namespace: "notice-edit-memory" }, (args) => ({
            resolveDir: process.cwd(),
            loader: "js",
            contents: args.path.endsWith("storage")
              ? 'export const storage = globalThis[Symbol.for("dgkma.notice-edit-test")].storage;'
              : `export { NoticeGenerationError } from ${JSON.stringify(resolve("server/modules/events/notice-extraction.ts"))};
               export async function extractNoticeFacts() { return globalThis[Symbol.for("dgkma.notice-edit-test")].getFacts(); }`,
          }));
        },
      },
    ],
  });
  assert.ok(
    !Object.keys(bundled.metafile.inputs).some((path) =>
      /server\/(?:db(?:\/|\.ts)|storage\.ts)/.test(path),
    ),
    "DB modules must not enter the test bundle",
  );
  const { registerNoticeEditRoutes } = (await import(
    pathToFileURL(output).href
  )) as typeof import("./notice-edit");
  const handlers = new Map<string, RequestHandler>();
  const app = {
    post(path: string, ...callbacks: RequestHandler[]) {
      handlers.set(`POST ${path}`, callbacks.at(-1)!);
    },
    patch(path: string, handler: RequestHandler) {
      handlers.set(`PATCH ${path}`, handler);
    },
  } as unknown as Express;
  let currentSources: NoticeSource[] = [];
  registerNoticeEditRoutes(app, {
    eventParseLimiter: (_req, _res, next) => next(),
    eventParseTimeoutMs: 1000,
    readSources: async (_text, _signal, type) => {
      assert.equal(type, post?.eventData.eventType);
      return {
        sources: structuredClone(currentSources),
        urls: currentSources.map((source) => source.url),
        combinedText: "",
        evidence: [],
      };
    },
  });
  async function dispatch<T>(method: "POST" | "PATCH", body: unknown): Promise<T> {
    let status = 200;
    let response: unknown;
    const res = {
      status(value: number) {
        status = value;
        return res;
      },
      // Match Express's JSON wire format, including Tiptap's attribute objects.
      json(value: unknown) {
        response = JSON.parse(JSON.stringify(value));
        return res;
      },
    } as unknown as Response;
    const route = method === "POST" ? "edit-preview" : "edit";
    const handler = handlers.get(`${method} /api/posts/notices/:id/${route}`)!;
    await handler(
      { params: { id: "1" }, session: { userId: user.id }, body } as unknown as Request,
      res,
      () => {},
    );
    assert.equal(status, 200, JSON.stringify(response));
    return response as T;
  }

  const cases: {
    name: string;
    original: NoticeSource[];
    correction: NoticeSource[];
    expected: NoticeSource[];
    link: string;
  }[] = [
    {
      name: "replacement URL",
      original: [oldSource],
      correction: [newSource],
      expected: [newSource, oldSource],
      link: newUrl,
    },
    {
      name: "same URL refreshed",
      original: [{ ...oldSource, status: "unavailable" }],
      correction: [oldSource],
      expected: [oldSource],
      link: oldUrl,
    },
    {
      name: "text-only correction",
      original: [oldSource],
      correction: [],
      expected: [oldSource],
      link: oldUrl,
    },
    {
      name: "blocked replacement",
      original: [oldSource],
      correction: [{ ...newSource, status: "blocked" }],
      expected: [{ ...newSource, status: "blocked" }, oldSource],
      link: oldUrl,
    },
    {
      name: "same URL now blocked",
      original: [oldSource, otherSource],
      correction: [{ ...oldSource, status: "blocked" }],
      expected: [{ ...oldSource, status: "blocked" }, otherSource],
      link: otherUrl,
    },
    {
      name: "unavailable replacement with known facts",
      original: [oldSource],
      correction: [{ ...newSource, status: "unavailable" }],
      expected: [{ ...newSource, status: "unavailable" }, oldSource],
      link: newUrl,
    },
  ];
  for (const eventType of ["obituary", "wedding", "opening"] as const) {
    for (const scenario of cases) {
      await t.test(`${eventType}: ${scenario.name}`, async () => {
        facts = {
          ...emptyNoticeFacts(),
          memberName: user.name,
          admissionYear: "07",
          date: "2026-11-10",
          time: "09:00",
          place: "동국병원",
          questions: [],
        };
        if (eventType === "obituary")
          Object.assign(facts, { relation: "부친", deceasedName: "홍길동", deceasedAge: "88" });
        if (eventType === "wedding")
          Object.assign(facts, { weddingRelation: "본인", groomName: user.name });
        if (eventType === "opening") facts.clinicName = "동국한의원";
        const fieldSources: NoticeData["fieldSources"] = { date: [{ kind: "html", url: oldUrl }] };
        post = {
          id: 1,
          authorId: user.id,
          revision: 1,
          isPublished: true,
          isHidden: true,
          title: "기존 공지",
          content: postDocumentFromMarkdown(`기존 공지\n${oldUrl}`),
          eventData: {
            schemaVersion: 1,
            eventType,
            facts: structuredClone(facts),
            questions: [],
            sources: structuredClone(scenario.original),
            fieldSources,
          },
        };
        saved = undefined;
        currentSources = scenario.correction;
        const preview = await dispatch<NoticeEditPreview>("POST", {
          revision: 1,
          sourceText:
            currentSources.map((source) => source.url).join("\n") || "장소는 그대로입니다.",
        });
        assert.deepEqual(preview.questions, []);
        assert.ok(preview.previewToken);
        const text = postDocumentText(preview.content);
        assert.ok(
          text.includes(scenario.link),
          `Expected the selected URL in ${eventType} preview`,
        );
        for (const url of [oldUrl, newUrl, otherUrl])
          if (url !== scenario.link)
            assert.ok(!text.includes(url), "An obsolete or blocked URL entered the post body");
        const result = await dispatch<{ id: number }>("PATCH", {
          previewToken: preview.previewToken,
        });
        assert.equal(result.id, 1);
        const persisted = saved as Saved | undefined;
        assert.ok(persisted);
        assert.deepEqual(persisted.content, preview.content);
        assert.equal(persisted.title, preview.title);
        assert.deepEqual(persisted.eventData.sources, scenario.expected);
        assert.deepEqual(persisted.eventData.fieldSources?.date, fieldSources.date);
        assert.equal(post.revision, 2);
        assert.equal(post.isHidden, true);
      });
    }
  }
});
