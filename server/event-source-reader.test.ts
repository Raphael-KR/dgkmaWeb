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
    method: "static-html",
    message: "링크 내용을 불러왔습니다.",
  }]);
});

test("renders a supported JavaScript obituary shell before parsing it", async () => {
  const url = "https://bugo.gipoom.com/e9597b47c1ec3fcc66e61b0d";
  let rendered = false;
  const result = await readEventSources(`졸업21기 조은영 ${url}`, {
    readProviderSource: async () => undefined,
    fetchPage: async () => htmlPage(url, "<main>기억을 품는 공간, 기품</main>"),
    renderPage: async () => {
      rendered = true;
      return {
        requestedUrl: url,
        finalUrl: url,
        contentType: "text/plain",
        body: "故 조성목\n남/78세\n딸\n조은영\n발인\n2026년 8월 3일 10시 00분",
      };
    },
  });

  assert.equal(rendered, true);
  assert.match(result.combinedText, /故 조성목/);
  assert.doesNotMatch(result.combinedText, /기억을 품는 공간/);
  assert.equal(result.sources[0]?.status, "fetched");
});

test("uses a supported provider adapter before static HTML and JavaScript rendering", async () => {
  const url = "https://bugo.gipoom.com/e9597b47c1ec3fcc66e61b0d";
  let fetched = false;
  let rendered = false;
  const result = await readEventSources(url, {
    readProviderSource: async () => "故 김한의\n남/78세\n딸\n김동국",
    fetchPage: async () => {
      fetched = true;
      throw new Error("must not fetch the page");
    },
    renderPage: async () => {
      rendered = true;
      throw new Error("must not render the page");
    },
  });

  assert.equal(fetched, false);
  assert.equal(rendered, false);
  assert.match(result.combinedText, /故 김한의/);
  assert.equal(result.sources[0]?.status, "fetched");
  assert.equal(result.sources[0]?.method, "provider-api");
});

test("falls back to the existing renderer when the provider adapter fails", async () => {
  const url = "https://bugo.gipoom.com/e9597b47c1ec3fcc66e61b0d";
  let rendered = false;
  const result = await readEventSources(url, {
    readProviderSource: async () => { throw new Error("provider changed"); },
    fetchPage: async () => htmlPage(url, "<main>기억을 품는 공간, 기품</main>"),
    renderPage: async () => {
      rendered = true;
      return {
        requestedUrl: url,
        finalUrl: url,
        contentType: "text/plain",
        body: "故 김한의\n남/78세\n딸\n김동국",
      };
    },
  });

  assert.equal(rendered, true);
  assert.equal(result.sources[0]?.status, "fetched");
  assert.equal(result.sources[0]?.method, "javascript");
});

test("does not execute JavaScript for an unsupported source host", async () => {
  let rendered = false;
  const result = await readEventSources("https://example.com/notice", {
    fetchPage: async (url) => htmlPage(url, "<main>기억을 품는 공간, 기품</main>"),
    renderPage: async () => {
      rendered = true;
      throw new Error("must not render");
    },
  });

  assert.equal(rendered, false);
  assert.equal(result.combinedText, "기억을 품는 공간, 기품");
  assert.equal(result.sources[0]?.status, "fetched");
});

test("keeps message fallback when a supported JavaScript source cannot render", async () => {
  const url = "https://bugo.gipoom.com/e9597b47c1ec3fcc66e61b0d";
  const result = await readEventSources(`졸업21기 조은영 ${url}`, {
    readProviderSource: async () => undefined,
    fetchPage: async () => htmlPage(url, "<div id=\"root\"></div>"),
    renderPage: async () => { throw new Error("browser unavailable"); },
  });

  assert.equal(result.combinedText, "졸업21기 조은영");
  assert.equal(result.sources[0]?.status, "unavailable");
  assert.doesNotMatch(JSON.stringify(result.sources), /browser unavailable/);
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

test("stops reading remaining URLs when the request signal is aborted", async () => {
  const controller = new AbortController();
  const fetched: string[] = [];
  const pending = readEventSources(
    "https://first.example/a https://second.example/b",
    {
      fetchPage: async (url, signal) => {
        fetched.push(url);
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
        return htmlPage(url, "unexpected");
      },
    },
    controller.signal,
  );

  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending, /중단|aborted/i);
  assert.deepEqual(fetched, ["https://first.example/a"]);
});
