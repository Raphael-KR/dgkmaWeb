import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeSourceUrl,
  extractEventSourceUrls,
  isPublicAddress,
} from "./event-source-policy";

test("extracts, cleans, deduplicates, and limits event source URLs", () => {
  assert.deepEqual(extractEventSourceUrls("내용 https://example.com/a 끝"), [
    "https://example.com/a",
  ]);
  assert.deepEqual(
    extractEventSourceUrls(
      "https://example.com/a, https://example.com/a. https://example.com/b) https://example.com/c https://example.com/d",
    ),
    ["https://example.com/a", "https://example.com/b", "https://example.com/c"],
  );
});

test("accepts only public HTTP and HTTPS URLs with default ports", () => {
  assert.equal(assertSafeSourceUrl("HTTPS://Example.COM/path").href, "https://example.com/path");
  assert.throws(() => assertSafeSourceUrl("file:///etc/passwd"), /지원하지 않는 주소/);
  assert.throws(
    () => assertSafeSourceUrl("https://user:pass@example.com"),
    /인증 정보/,
  );
  assert.throws(() => assertSafeSourceUrl("http://example.com:8080"), /포트/);
  assert.throws(() => assertSafeSourceUrl("https://127.0.0.1/path"), /공개 주소/);
  for (const encodedLoopback of [
    "http://2130706433/",
    "http://0x7f000001/",
    "http://0177.0.0.1/",
    "http://[::ffff:127.0.0.1]/",
  ]) {
    assert.throws(() => assertSafeSourceUrl(encodedLoopback), /공개 주소/, encodedLoopback);
  }
  for (const localHostname of [
    "http://localhost/private",
    "http://api.localhost/private",
    "http://service.internal/private",
    "http://printer/private",
  ]) {
    assert.throws(() => assertSafeSourceUrl(localHostname), /공개 주소/, localHostname);
  }
});

test("classifies public and non-public IPv4 addresses", () => {
  for (const address of [
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.0.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "240.0.0.1",
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }

  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("1.1.1.1"), true);
});

test("classifies public and non-public IPv6 addresses including mapped IPv4", () => {
  for (const address of [
    "::",
    "::1",
    "fc00::1",
    "fd00::1",
    "fe80::1",
    "ff00::1",
    "2001:db8::1",
    "2001::1",
    "2001:2::1",
    "2002:7f00:1::",
    "3fff::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "::ffff:192.168.1.1",
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }

  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  assert.equal(isPublicAddress("2001:4860:4860::8888"), true);
  assert.equal(isPublicAddress("::ffff:8.8.8.8"), true);
  assert.equal(isPublicAddress("not-an-address"), false);
});
