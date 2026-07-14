import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test from "node:test";
import {
  fetchPublicPage,
  requestPublicAddress,
  type PublicPageFetcherDependencies,
  type RawPublicResponse,
  type RequestPublicAddress,
} from "./public-page-fetcher";

const PUBLIC_ADDRESS = "8.8.8.8";

async function* textBody(body: string): AsyncIterable<Uint8Array> {
  yield Buffer.from(body);
}

function textResponse(
  body: string,
  headers: RawPublicResponse["headers"] = { "content-type": "text/html" },
  status = 200,
): RawPublicResponse {
  return { status, headers, body: textBody(body) };
}

function publicLookup(...addresses: Array<{ address: string; family: 4 | 6 }>) {
  return (async () => addresses) as PublicPageFetcherDependencies["lookup"];
}

async function readBody(response: RawPublicResponse): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.body) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function listen(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("제어 서버 주소를 읽을 수 없습니다");
  return address.port;
}

async function close(server: Server): Promise<void> {
  server.close();
  await once(server, "close");
}

test("requestPublicAddress pins the supplied address and preserves the HTTP host", async () => {
  let host = "";
  let acceptEncoding = "";
  let connection = "";
  const server = createServer((request, response) => {
    host = request.headers.host ?? "";
    acceptEncoding = request.headers["accept-encoding"] ?? "";
    connection = request.headers.connection ?? "";
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<p>행사 안내</p>");
  });
  const port = await listen(server);

  try {
    const response = await requestPublicAddress(
      new URL(`http://source.example:${port}/notice?from=test`),
      "127.0.0.1",
      4,
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers["content-type"], "text/html; charset=utf-8");
    assert.equal(await readBody(response), "<p>행사 안내</p>");
    assert.equal(host, `source.example:${port}`);
    assert.equal(acceptEncoding, "identity");
    assert.equal(connection, "close");
  } finally {
    await close(server);
  }
});

test("requestPublicAddress aborts when the body stalls after headers", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.write("partial");
  });
  const port = await listen(server);

  try {
    const response = await requestPublicAddress(
      new URL(`http://source.example:${port}/stalled-body`),
      "127.0.0.1",
      4,
    );
    await assert.rejects(readBody(response), /시간 제한|aborted|premature|reset/i);
  } finally {
    await close(server);
  }
});

test("requestPublicAddress aborts a response delayed beyond five seconds", async () => {
  let delayedResponse: NodeJS.Timeout | undefined;
  const server = createServer((_request, response) => {
    delayedResponse = setTimeout(() => {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("too late");
    }, 5_200);
  });
  const port = await listen(server);

  try {
    await assert.rejects(
      requestPublicAddress(new URL(`http://source.example:${port}/slow`), "127.0.0.1", 4),
      /시간 제한/,
    );
  } finally {
    if (delayedResponse) clearTimeout(delayedResponse);
    await close(server);
  }
});

test("fetchPublicPage returns a small HTML page through validated dependency injection", async () => {
  const requests: Array<{ url: string; address: string; family: 4 | 6 }> = [];
  const requestPublicAddress: RequestPublicAddress = async (url, address, family) => {
    requests.push({ url: url.href, address, family });
    return textResponse("<main>동문 행사</main>", { "content-type": "text/html; charset=utf-8" });
  };

  const page = await fetchPublicPage("https://source.example/events", {
    lookup: publicLookup({ address: PUBLIC_ADDRESS, family: 4 }),
    requestPublicAddress,
  });

  assert.deepEqual(page, {
    requestedUrl: "https://source.example/events",
    finalUrl: "https://source.example/events",
    contentType: "text/html",
    body: "<main>동문 행사</main>",
  });
  assert.deepEqual(requests, [{
    url: "https://source.example/events",
    address: PUBLIC_ADDRESS,
    family: 4,
  }]);
});

test("fetchPublicPage revalidates every redirect destination", async () => {
  const lookups: string[] = [];
  const requests: string[] = [];
  const requestPublicAddress: RequestPublicAddress = async (url) => {
    requests.push(url.hostname);
    if (url.hostname === "source.example") {
      return textResponse("", { location: "https://next.example/notice" }, 302);
    }
    return textResponse("새 공지", { "content-type": "text/plain; charset=utf-8" });
  };
  const lookup = (async (hostname: string) => {
    lookups.push(hostname);
    return [{ address: PUBLIC_ADDRESS, family: 4 }];
  }) as PublicPageFetcherDependencies["lookup"];

  const page = await fetchPublicPage("https://source.example/start", { lookup, requestPublicAddress });

  assert.equal(page.finalUrl, "https://next.example/notice");
  assert.equal(page.contentType, "text/plain");
  assert.equal(page.body, "새 공지");
  assert.deepEqual(lookups, ["source.example", "next.example"]);
  assert.deepEqual(requests, ["source.example", "next.example"]);
});

test("fetchPublicPage blocks all DNS answers when any address is private before requesting", async () => {
  let requested = false;

  await assert.rejects(
    fetchPublicPage("https://source.example/private-answer", {
      lookup: publicLookup(
        { address: PUBLIC_ADDRESS, family: 4 },
        { address: "10.0.0.1", family: 4 },
      ),
      requestPublicAddress: async () => {
        requested = true;
        return textResponse("unexpected");
      },
    }),
    /공개 주소/,
  );

  assert.equal(requested, false);
});

test("fetchPublicPage rejects inconsistent DNS family metadata", async () => {
  let requested = false;
  await assert.rejects(
    fetchPublicPage("https://source.example/family", {
      lookup: publicLookup({ address: PUBLIC_ADDRESS, family: 6 }),
      requestPublicAddress: async () => {
        requested = true;
        return textResponse("unexpected");
      },
    }),
    /주소를 확인/,
  );
  assert.equal(requested, false);
});

test("fetchPublicPage strips IPv6 URL brackets before lookup", async () => {
  const lookedUp: string[] = [];
  const page = await fetchPublicPage("https://[2606:4700:4700::1111]/event", {
    lookup: (async (hostname: string) => {
      lookedUp.push(hostname);
      return [{ address: "2606:4700:4700::1111", family: 6 }];
    }) as PublicPageFetcherDependencies["lookup"],
    requestPublicAddress: async () => textResponse("행사", { "content-type": "text/plain" }),
  });

  assert.deepEqual(lookedUp, ["2606:4700:4700::1111"]);
  assert.equal(page.body, "행사");
});

test("fetchPublicPage rejects a redirect to localhost before a second request", async () => {
  let requests = 0;

  await assert.rejects(
    fetchPublicPage("https://source.example/start", {
      lookup: publicLookup({ address: PUBLIC_ADDRESS, family: 4 }),
      requestPublicAddress: async () => {
        requests += 1;
        return textResponse("", { location: "http://127.0.0.1/internal" }, 302);
      },
    }),
    /공개 주소/,
  );

  assert.equal(requests, 1);
});

test("fetchPublicPage rejects a fourth redirect", async () => {
  let requests = 0;
  const requestPublicAddress: RequestPublicAddress = async (url) => {
    requests += 1;
    return textResponse("", { location: new URL(`/redirect-${requests}`, url).href }, 302);
  };

  await assert.rejects(
    fetchPublicPage("https://source.example/start", {
      lookup: publicLookup({ address: PUBLIC_ADDRESS, family: 4 }),
      requestPublicAddress,
    }),
    /리디렉션/,
  );

  assert.equal(requests, 4);
});

test("fetchPublicPage rejects non-text and compressed responses", async () => {
  const lookup = publicLookup({ address: PUBLIC_ADDRESS, family: 4 });

  await assert.rejects(
    fetchPublicPage("https://source.example/file", {
      lookup,
      requestPublicAddress: async () => textResponse("binary", { "content-type": "application/octet-stream" }),
    }),
    /텍스트 형식/,
  );
  await assert.rejects(
    fetchPublicPage("https://source.example/compressed", {
      lookup,
      requestPublicAddress: async () => textResponse("gzip", {
        "content-type": "text/html",
        "content-encoding": "gzip",
      }),
    }),
    /압축/,
  );
});

test("fetchPublicPage aborts a streamed body exceeding 512 KiB", async () => {
  let cancelled = false;
  async function* oversizedBody(): AsyncIterable<Uint8Array> {
    try {
      yield new Uint8Array(512 * 1024 + 1);
    } finally {
      cancelled = true;
    }
  }

  await assert.rejects(
    fetchPublicPage("https://source.example/large", {
      lookup: publicLookup({ address: PUBLIC_ADDRESS, family: 4 }),
      requestPublicAddress: async () => ({
        status: 200,
        headers: { "content-type": "text/plain" },
        body: oversizedBody(),
      }),
    }),
    /512 KiB/,
  );
  assert.equal(cancelled, true);
});

test("fetchPublicPage rejects an oversized content-length before reading", async () => {
  let read = false;
  let cancelled = false;
  const body: AsyncIterable<Uint8Array> = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          read = true;
          return { done: false as const, value: Buffer.from("unexpected") };
        },
        async return() {
          cancelled = true;
          return { done: true as const, value: undefined };
        },
      };
    },
  };

  await assert.rejects(
    fetchPublicPage("https://source.example/declared-large", {
      lookup: publicLookup({ address: PUBLIC_ADDRESS, family: 4 }),
      requestPublicAddress: async () => ({
        status: 200,
        headers: {
          "content-type": "text/plain",
          "content-length": String(512 * 1024 + 1),
        },
        body,
      }),
    }),
    /512 KiB/,
  );

  assert.equal(read, false);
  assert.equal(cancelled, true);
});
