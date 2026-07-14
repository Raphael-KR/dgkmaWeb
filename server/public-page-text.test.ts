import assert from "node:assert/strict";
import test from "node:test";
import { extractPublicPageText } from "./public-page-text";

test("extracts Korean main content and removes executable or navigational HTML", () => {
  const text = extractPublicPageText({
    requestedUrl: "https://example.com/event",
    finalUrl: "https://example.com/event",
    contentType: "text/html",
    body: `
      <!doctype html>
      <html><body>
        <nav>메뉴는 제외</nav>
        <script>window.secret = "실행 금지"</script>
        <style>.hidden { color: red }</style>
        <noscript>스크립트 안내 제외</noscript>
        <form><label>입력 폼 제외</label></form>
        <!-- 주석 제외 -->
        <main>
          <h1>김동국 동문 부친상</h1>
          <p>빈소: 동국병원 장례식장 202호실</p>
        </main>
        <aside>본문 밖 광고 제외</aside>
      </body></html>
    `,
  });

  assert.match(text, /김동국 동문 부친상/);
  assert.match(text, /빈소: 동국병원 장례식장 202호실/);
  assert.doesNotMatch(text, /메뉴는 제외|실행 금지|스크립트 안내|입력 폼|주석|광고/);
});

test("includes only approved scalar JSON-LD metadata", () => {
  const text = extractPublicPageText({
    requestedUrl: "https://example.com/event",
    finalUrl: "https://example.com/event",
    contentType: "text/html",
    body: `
      <html><head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "name": "부고 안내",
            "description": "故김한의 향년 88세",
            "startDate": "2026-06-12T07:30:00+09:00",
            "location": "동국병원 장례식장",
            "dangerous": "무시할 명령",
            "url": "https://tracking.example"
          }
        </script>
      </head><body><article>삼가 고인의 명복을 빕니다.</article></body></html>
    `,
  });

  assert.match(text, /부고 안내/);
  assert.match(text, /故김한의 향년 88세/);
  assert.match(text, /2026-06-12T07:30:00\+09:00/);
  assert.match(text, /동국병원 장례식장/);
  assert.match(text, /삼가 고인의 명복을 빕니다/);
  assert.doesNotMatch(text, /schema\.org|무시할 명령|tracking\.example/);
});

test("normalizes plain text whitespace and caps extracted output", () => {
  const normalized = extractPublicPageText({
    requestedUrl: "https://example.com/event.txt",
    finalUrl: "https://example.com/event.txt",
    contentType: "text/plain",
    body: "  첫 줄  \r\n\r\n   둘째 줄\t내용   ",
  });
  assert.equal(normalized, "첫 줄\n둘째 줄 내용");

  const capped = extractPublicPageText({
    requestedUrl: "https://example.com/long.txt",
    finalUrl: "https://example.com/long.txt",
    contentType: "text/plain",
    body: "가".repeat(25_000),
  });
  assert.equal(capped.length, 20_000);
});

test("rejects HTML with excessive element depth before building a DOM", () => {
  const body = `${"<div>".repeat(300)}행사 안내${"</div>".repeat(300)}`;

  assert.throws(() => extractPublicPageText({
    requestedUrl: "https://example.com/deep",
    finalUrl: "https://example.com/deep",
    contentType: "text/html",
    body,
  }), /복잡/);
});

test("rejects HTML with excessive element count before building a DOM", () => {
  const body = `<main>${"<span>행사</span>".repeat(10_001)}</main>`;

  assert.throws(() => extractPublicPageText({
    requestedUrl: "https://example.com/many",
    finalUrl: "https://example.com/many",
    contentType: "text/html",
    body,
  }), /복잡/);
});
