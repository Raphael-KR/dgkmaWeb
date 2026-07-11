import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("community events member routes render the composer, filters, and list", async () => {
  const [app, page] = await Promise.all([
    readFile(new URL("../client/src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/events/index.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(app, /path="\/events"/);
  assert.match(app, /path="\/events\/:id"/);
  assert.match(page, /전체/);
  assert.match(page, /부고/);
  assert.match(page, /결혼/);
  assert.match(page, /개원/);
  assert.match(page, /기타/);
  assert.match(page, /<EventComposer/);
  assert.match(page, /<EventList/);
});
