import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("community event routes and the all-events list stay member-only and guarded", async () => {
  const [app, page, list, robots] = await Promise.all([
    readFile(new URL("../client/src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/events/index.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/events/event-list.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/public/robots.txt", import.meta.url), "utf8"),
  ]);

  assert.match(app, /<Route path="\/events">\s*<AuthGate><CommunityEventsPage \/><\/AuthGate>/);
  assert.match(app, /<Route path="\/events\/:id">\s*<AuthGate><CommunityEventDetail \/><\/AuthGate>/);
  assert.match(page, /<EventComposer/);
  assert.match(page, /<EventList/);
  assert.doesNotMatch(page, /\bTabs(?:List|Trigger)?\b|selectedType|eventFilters/);
  assert.doesNotMatch(page, /동문들의 경조사 소식을 확인합니다/);
  assert.match(list, /queryKey: \["\/api\/events"\]/);
  assert.match(list, /fetch\("\/api\/events", \{ credentials: "include" \}\)/);
  assert.doesNotMatch(list, /\?type=|selectedType/);
  assert.match(list, /credentials: "include"/);
  assert.match(list, /if \(!response\.ok\) \{\s*throw new Error/);
  assert.doesNotMatch(list, /sourceText/);
  assert.match(list, /경조사 목록 다시 불러오기/);
  assert.match(robots, /^Disallow: \/events$/m);
  assert.match(robots, /^Disallow: \/events\/$/m);
});

test("community event composer progressively reveals schema-backed review fields", async () => {
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
  assert.match(composer, /const \[isReviewOpen, setIsReviewOpen\] = useState\(false\)/);
  assert.match(composer, /isPaused: !isReviewOpen \|\| isParsing \|\| isPublishing/);
  assert.match(composer, /`\$\{EVENT_TYPE_LABELS\[currentType\]\} 등록`/);
  assert.match(composer, /\{isReviewOpen && \([\s\S]*<EventFields/);
  assert.match(composer, /setIsReviewOpen\(true\)/);
  assert.match(composer, /setIsReviewOpen\(false\)/);
  assert.doesNotMatch(composer, />경조사 등록<|내용을 확인한 뒤 게시해주세요/);
  assert.match(composer, /communityEventPublishSchema\.safeParse/);
  assert.match(composer, /form\.handleSubmit\(publish, handleInvalidSubmit\)/);
  assert.match(composer, /handleInvalidSubmit/);
  assert.match(composer, /collectFormErrorEntries/);
  assert.match(composer, /apiRequest\("POST", "\/api\/events\/drafts"/);
  assert.match(composer, /requestEventPublish\(fetch, publishDraftId, payload\)/);
  assert.match(composer, /conclusivePublishErrorMessage/);
  assert.match(composer, /apiRequest\("GET", `\/api\/events\/\$\{publishDraftId\}`/);
  assert.match(composer, /apiRequest\(\s*"POST",\s*"\/api\/obituary\/parse"/);
  assert.match(composer, /링크 내용 수집은 준비 중이며 입력한 문자만 분석했습니다\./);
  assert.match(composer, /분석할 문자 내용이 없습니다/);
  assert.match(composer, /form\.setError/);
  assert.match(composer, /form\.setFocus/);
  assert.match(composer, /disabled=\{!canSubmit\}/);
  assert.match(composer, /invalidateQueries\(\{ queryKey: \["\/api\/events"\] \}\)/);
  assert.match(composer, /removeQueries\(\{ queryKey: \["\/api\/events\/drafts\/latest"\] \}\)/);
  assert.doesNotMatch(composer, /\b(?:Dialog|Accordion|Collapsible)\b/);
  assert.doesNotMatch(composer, /as never/);
  assert.doesNotMatch(composer, /authorId|membershipTier|memberName|memberPhone/);

  assert.match(fields, /details\.memo/);
  assert.match(fields, /error=\{publishErrors\["details\.memo"\]\}/);
  assert.match(fields, /fieldA11y\("event-memo", publishErrors\["details\.memo"\]\)/);
  assert.match(fields, /details\.deceasedName/);
  assert.match(fields, /details\.deceasedAge/);
  assert.match(fields, /details\.relationship/);
  assert.match(fields, /<Controller/);
  assert.match(fields, /name=\{toFormPath\("details\.relationship"\)\}/);
  assert.match(fields, /details\.funeralDate/);
  assert.match(fields, /details\.funeralHome/);
  assert.match(fields, /details\.accountInfo/);
  assert.match(fields, /details\.sourceUrl/);
  assert.match(fields, /error=\{publishErrors\["details\.sourceUrl"\]\}/);
  assert.match(fields, /fieldA11y\("obituary-url", publishErrors\["details\.sourceUrl"\]\)/);
  assert.match(fields, /details\.memberTitle/);
  assert.match(fields, /details\.familyContact/);
  assert.match(fields, /aria-invalid/);
  assert.match(fields, /aria-describedby/);
  assert.match(fields, /role="alert"/);
  assert.match(fields, /disabled=\{disabled\}/);
});

test("community events page keeps one unfiltered list after publishing", async () => {
  const page = await readFile(new URL("../client/src/pages/events/index.tsx", import.meta.url), "utf8");

  assert.match(page, /<EventComposer \/>/);
  assert.match(page, /<EventList onSelect=/);
  assert.doesNotMatch(page, /onPublished=|setSelectedType|selectedType/);
});

test("community event entry points replace the obsolete home obituary form", async () => {
  const [boards, home] = await Promise.all([
    readFile(new URL("../client/src/pages/boards.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/home.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(boards, /HeartHandshake/);
  assert.match(boards, /aria-label="경조사 페이지로 이동"/);
  assert.match(boards, /onClick=\{\(\) => setLocation\("\/events"\)\}/);
  assert.match(boards, /flex items-center justify-between gap-3 mb-4/);
  assert.match(boards, /shrink-0/);

  assert.match(home, /HeartHandshake/);
  assert.match(home, /aria-label="경조사 페이지로 이동"/);
  assert.match(home, /onClick=\{\(\) => setLocation\("\/events"\)\}/);
  assert.doesNotMatch(home, /obituaryUrl|parseObituaryMutation|handleObituarySubmit|\/api\/obituary\/parse/);
});

test("legacy obituary entry routes redirect without replacing legacy details or public condolence", async () => {
  const app = await readFile(new URL("../client/src/App.tsx", import.meta.url), "utf8");

  const legacyNewRedirect = '<Route path="/o/new" component={() => <Redirect to="/events?type=obituary&compose=1" replace />} />';
  const legacyListRedirect = '<Route path="/o" component={() => <Redirect to="/events?type=obituary" replace />} />';
  const legacyDetailRoute = '<Route path="/o/:id">\n        <AuthGate><ObituaryDetail /></AuthGate>\n      </Route>';

  assert.match(app, /import \{ Switch, Route, Redirect, useLocation \} from "wouter"/);
  assert.ok(app.includes(legacyNewRedirect));
  assert.ok(app.includes(legacyListRedirect));
  assert.ok(app.includes(legacyDetailRoute));
  assert.ok(app.indexOf(legacyNewRedirect) < app.indexOf(legacyListRedirect));
  assert.ok(app.indexOf(legacyListRedirect) < app.indexOf(legacyDetailRoute));
  assert.match(app, /<Route path="\/about\/condolence" component=\{AboutCondolence\} \/>/);
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
  assert.match(detail, /target="_blank"/);
  assert.match(detail, /rel="noopener noreferrer"/);
  assert.match(detail, /경조사 상세 다시 불러오기/);
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
