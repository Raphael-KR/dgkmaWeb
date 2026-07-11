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

test("community event composer stays visible and only submits schema-backed event data", async () => {
  const [composer, fields] = await Promise.all([
    readFile(new URL("../client/src/pages/events/event-composer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/events/event-fields.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(composer, /useForm<CommunityEventDraftInput>/);
  assert.match(composer, /zodResolver\(communityEventDraftSchema\)/);
  assert.match(composer, /<ToggleGroup/);
  assert.match(composer, /\["obituary", "wedding", "opening", "other"\]/);
  assert.match(composer, /EVENT_TYPE_LABELS\[eventType\]/);
  assert.match(composer, /<Textarea/);
  assert.match(composer, /문자와 공개 링크를 함께 붙여넣으세요/);
  assert.match(composer, /<EventFields/);
  assert.match(composer, /communityEventPublishSchema\.safeParse/);
  assert.match(composer, /form\.handleSubmit\(publish\)/);
  assert.match(composer, /apiRequest\("POST", "\/api\/events\/drafts"/);
  assert.match(composer, /apiRequest\("POST", `\/api\/events\/\$\{publishDraftId\}\/publish`/);
  assert.match(composer, /apiRequest\("GET", `\/api\/events\/\$\{publishDraftId\}`/);
  assert.match(composer, /apiRequest\("POST", "\/api\/obituary\/parse"/);
  assert.match(composer, /링크 내용 수집은 준비 중이며 입력한 문자만 분석했습니다\./);
  assert.match(composer, /분석할 문자 내용이 없습니다/);
  assert.match(composer, /form\.setError/);
  assert.match(composer, /form\.setFocus/);
  assert.match(composer, /onPublished/);
  assert.match(composer, /disabled=\{isBusy\}/);
  assert.match(composer, /invalidateQueries\(\{ queryKey: \["\/api\/events"\] \}\)/);
  assert.match(composer, /removeQueries\(\{ queryKey: \["\/api\/events\/drafts\/latest"\] \}\)/);
  assert.doesNotMatch(composer, /\b(?:Dialog|Accordion|Collapsible)\b/);
  assert.doesNotMatch(composer, /as never/);
  assert.doesNotMatch(composer, /authorId|membershipTier|memberName|memberPhone/);

  assert.match(fields, /details\.memo/);
  assert.match(fields, /details\.deceasedName/);
  assert.match(fields, /details\.deceasedAge/);
  assert.match(fields, /details\.relationship/);
  assert.match(fields, /details\.funeralDate/);
  assert.match(fields, /details\.funeralHome/);
  assert.match(fields, /details\.accountInfo/);
  assert.match(fields, /details\.sourceUrl/);
  assert.match(fields, /details\.memberTitle/);
  assert.match(fields, /details\.familyContact/);
  assert.match(fields, /aria-invalid/);
  assert.match(fields, /aria-describedby/);
  assert.match(fields, /role="alert"/);
  assert.match(fields, /disabled=\{disabled\}/);
});

test("community events page switches the list to a newly published event type", async () => {
  const page = await readFile(new URL("../client/src/pages/events/index.tsx", import.meta.url), "utf8");

  assert.match(page, /<EventComposer onPublished=\{\(eventType\) => setSelectedType\(eventType\)\}/);
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
