import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAllowedRendererNavigation,
  assertAllowedRendererRequest,
  buildHostResolverRules,
  isJavaScriptRenderingSupported,
  resolveRendererAddresses,
} from "./public-page-renderer";

test("supports JavaScript rendering only for the exact Gipoom obituary host", () => {
  assert.equal(
    isJavaScriptRenderingSupported("https://bugo.gipoom.com/e9597b47c1ec3fcc66e61b0d"),
    true,
  );
  assert.equal(isJavaScriptRenderingSupported("https://gipoom.com/notice"), false);
  assert.equal(isJavaScriptRenderingSupported("https://bugo.gipoom.com.example/notice"), false);
  assert.equal(isJavaScriptRenderingSupported("http://bugo.gipoom.com/notice"), false);
});

test("allows only HTTPS requests to the source and its approved data host", () => {
  const source = new URL("https://bugo.gipoom.com/notice");

  assert.equal(
    assertAllowedRendererRequest("https://bugo.gipoom.com/assets/app.js", source).hostname,
    "bugo.gipoom.com",
  );
  assert.equal(
    assertAllowedRendererRequest("https://api.smartnanumi.com/api/obituary", source).hostname,
    "api.smartnanumi.com",
  );
  assert.throws(() => assertAllowedRendererRequest("https://example.com/pixel", source));
  assert.throws(() => assertAllowedRendererRequest("http://api.smartnanumi.com/data", source));
  assert.throws(() => assertAllowedRendererRequest("https://api.smartnanumi.com:8443/data", source));
});

test("keeps top-level navigation on the original obituary host", () => {
  const source = new URL("https://bugo.gipoom.com/notice");

  assert.equal(
    assertAllowedRendererNavigation("https://bugo.gipoom.com/next", source).hostname,
    "bugo.gipoom.com",
  );
  assert.throws(() => assertAllowedRendererNavigation(
    "https://api.smartnanumi.com/api/obituary",
    source,
  ));
});

test("rejects a renderer host when any DNS answer is non-public", async () => {
  await assert.rejects(
    resolveRendererAddresses(["bugo.gipoom.com"], async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]),
    /공개 주소/,
  );
});

test("pins every renderer host to a validated public IPv4 address", async () => {
  const addresses = await resolveRendererAddresses(
    ["bugo.gipoom.com", "api.smartnanumi.com"],
    async (hostname) => hostname === "bugo.gipoom.com"
      ? [{ address: "93.184.216.34", family: 4 }]
      : [{ address: "1.1.1.1", family: 4 }],
  );

  assert.equal(
    buildHostResolverRules(addresses),
    "MAP bugo.gipoom.com 93.184.216.34, MAP api.smartnanumi.com 1.1.1.1, MAP * ~NOTFOUND, EXCLUDE localhost",
  );
});
