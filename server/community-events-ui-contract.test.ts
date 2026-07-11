import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("community event routes and list requests stay member-only and guarded", async () => {
  const [app, page, list, robots] = await Promise.all([
    readFile(new URL("../client/src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/events/index.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/events/event-list.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/public/robots.txt", import.meta.url), "utf8"),
  ]);

  assert.match(app, /<Route path="\/events">\s*<AuthGate><CommunityEventsPage \/><\/AuthGate>/);
  assert.match(app, /<Route path="\/events\/:id">\s*<AuthGate><CommunityEventDetail \/><\/AuthGate>/);
  assert.match(page, /전체/);
  assert.match(page, /부고/);
  assert.match(page, /결혼/);
  assert.match(page, /개원/);
  assert.match(page, /기타/);
  assert.match(page, /<EventComposer/);
  assert.match(page, /<EventList/);
  assert.match(list, /queryKey: \["\/api\/events", selectedType\]/);
  assert.match(list, /selectedType === "all" \? "\/api\/events" : `\/api\/events\?type=\$\{selectedType\}`/);
  assert.match(list, /credentials: "include"/);
  assert.match(list, /if \(!response\.ok\) \{\s*throw new Error/);
  assert.doesNotMatch(list, /sourceText/);
  assert.match(robots, /^Disallow: \/events$/m);
  assert.match(robots, /^Disallow: \/events\/$/m);
});

test("community event detail guards malformed details and keeps fixed private SEO", async () => {
  const [detail, clientSeo, serverSeo] = await Promise.all([
    readFile(new URL("../client/src/pages/events/detail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/lib/seo.ts", import.meta.url), "utf8"),
    readFile(new URL("./seo.ts", import.meta.url), "utf8"),
  ]);

  assert.match(detail, /function isEventDetails\(value: unknown\)/);
  assert.match(detail, /typeof value === "object"/);
  assert.match(detail, /!Array\.isArray\(value\)/);
  assert.match(detail, /isEventDetails\(details\) \? details : \{\}/);
  assert.doesNotMatch(detail, /sourceText/);
  assert.match(detail, /const backPath = `\/events\?type=\$\{event\.eventType\}`/);
  assert.match(detail, /setLocation\(backPath\)/);
  assert.match(detail, /useSeo\(\{\s*\.\.\.COMMUNITY_EVENTS_SEO\.detail,/);
  assert.doesNotMatch(detail, /title:\s*event\?\.title/);

  assert.match(clientSeo, /title: "경조사"/);
  assert.match(clientSeo, /title: "경조사 상세"/);
  assert.match(clientSeo, /noIndex: true/);
  assert.match(clientSeo, /opts\.noIndex \? "noindex, nofollow" : "index, follow"/);
  assert.match(serverSeo, /title: "경조사"/);
  assert.match(serverSeo, /title: "경조사 상세"/);
  assert.match(serverSeo, /noIndex: true/);
  assert.match(serverSeo, /meta\.noIndex \? "noindex, nofollow" : "index, follow"/);
});
