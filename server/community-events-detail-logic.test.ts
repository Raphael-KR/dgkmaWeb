import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyEventDetailError,
  loadCommunityEventDetail,
  safeExternalHttpUrl,
} from "../client/src/pages/events/event-detail-logic";

test("published obituary source links allow only valid HTTP and HTTPS URLs", () => {
  assert.equal(safeExternalHttpUrl("https://example.com/notice"), "https://example.com/notice");
  assert.equal(safeExternalHttpUrl(" http://example.com/notice "), "http://example.com/notice");
  for (const value of ["javascript:alert(1)", "ftp://example.com/file", "not-a-url", "", undefined]) {
    assert.equal(safeExternalHttpUrl(value), undefined);
  }
});

test("detail loading distinguishes a stable 404 from retryable failures", async () => {
  await assert.rejects(
    () => loadCommunityEventDetail(async () => new Response("{}", { status: 404 }), "7"),
    (error) => classifyEventDetailError(error) === "not-found",
  );
  await assert.rejects(
    () => loadCommunityEventDetail(async () => new Response("{}", { status: 503 }), "7"),
    (error) => classifyEventDetailError(error) === "transient",
  );
});
