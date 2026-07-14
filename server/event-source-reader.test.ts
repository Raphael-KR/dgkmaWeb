import assert from "node:assert/strict";
import test from "node:test";
import type { PublicPageResult } from "./public-page-fetcher";
import { readEventSources } from "./event-source-reader";

const htmlPage = (url: string, body: string): PublicPageResult => ({
  requestedUrl: url,
  finalUrl: url,
  contentType: "text/html",
  body,
});

test("keeps normalized user text when no URL is present", async () => {
  const result = await readEventSources("  김동국 동문 부친상\n\n 빈소: 동국병원  ");

  assert.equal(result.combinedText, "김동국 동문 부친상\n빈소: 동국병원");
  assert.deepEqual(result.urls, []);
  assert.deepEqual(result.sources, []);
});

test("reads a URL-only source and appends extracted public text", async () => {
  const result = await readEventSources("https://example.com/notice", {
    fetchPage: async (url) => htmlPage(url, "<main>부고 안내</main>"),
  });

  assert.equal(result.combinedText, "부고 안내");
  assert.deepEqual(result.urls, ["https://example.com/notice"]);
  assert.deepEqual(result.sources, [{
    url: "https://example.com/notice",
    status: "fetched",
    message: "링크 내용을 불러왔습니다.",
  }]);
});

test("combines pasted message text and fetched link content", async () => {
  const result = await readEventSources(
    "故김한의 향년 88세 https://example.com/notice 발인 안내",
    { fetchPage: async (url) => htmlPage(url, "<article>빈소: 동국병원</article>") },
  );

  assert.match(result.combinedText, /^故김한의 향년 88세\s+발인 안내/);
  assert.match(result.combinedText, /빈소: 동국병원$/);
});

test("continues after one unavailable link and keeps successful content", async () => {
  const result = await readEventSources(
    "문자 내용 https://first.example/a https://second.example/b",
    {
      fetchPage: async (url) => {
        if (url.includes("first")) throw new Error("upstream 10.0.0.1 secret body");
        return htmlPage(url, "<main>공개된 내용</main>");
      },
    },
  );

  assert.equal(result.combinedText, "문자 내용\n공개된 내용");
  assert.deepEqual(result.sources.map(({ status, message }) => ({ status, message })), [
    {
      status: "unavailable",
      message: "링크가 종료되었거나 공개되지 않아 입력한 문자만 분석했습니다.",
    },
    { status: "fetched", message: "링크 내용을 불러왔습니다." },
  ]);
  assert.doesNotMatch(JSON.stringify(result.sources), /10\.0\.0\.1|secret body/);
});

test("preserves original message text when every link is unavailable", async () => {
  const result = await readEventSources(
    "김동국 동문 모친상 https://expired.example/notice",
    { fetchPage: async () => { throw new Error("expired"); } },
  );

  assert.equal(result.combinedText, "김동국 동문 모친상");
  assert.equal(result.sources[0]?.status, "unavailable");
});

test("reports private destinations as blocked without invoking the fetcher", async () => {
  let fetched = false;
  const result = await readEventSources("안내 http://127.0.0.1/private", {
    fetchPage: async () => {
      fetched = true;
      return htmlPage("http://127.0.0.1/private", "unexpected");
    },
  });

  assert.equal(fetched, false);
  assert.equal(result.combinedText, "안내");
  assert.deepEqual(result.sources, [{
    url: "http://127.0.0.1/private",
    status: "blocked",
    message: "안전하지 않은 주소는 읽지 않았습니다.",
  }]);
});
