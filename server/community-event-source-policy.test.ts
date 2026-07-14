import assert from "node:assert/strict";
import test from "node:test";
import { communityEventDraftSchema } from "@shared/community-events";
import {
  normalizeCommunityEventSources,
  sanitizeStoredCommunityEventSources,
} from "./community-event-source-policy";

function obituaryDraft(sourceUrl: string, sourceUrls = [sourceUrl]) {
  return communityEventDraftSchema.parse({
    eventType: "obituary",
    sourceText: sourceUrl,
    sourceUrls,
    details: { sourceUrl },
  });
}

test("normalizes approved source URLs and removes fragments", () => {
  const normalized = normalizeCommunityEventSources(
    obituaryDraft("https://example.com/notice#tracking"),
  );

  assert.deepEqual(normalized.sourceUrls, ["https://example.com/notice"]);
  assert.equal(normalized.details.sourceUrl, "https://example.com/notice");
});

test("rejects private, credentialed, and non-default-port source URLs", () => {
  for (const sourceUrl of [
    "http://127.0.0.1/private",
    "https://user:secret@example.com/notice",
    "https://example.com:8443/notice",
  ]) {
    assert.throws(() => normalizeCommunityEventSources(obituaryDraft(sourceUrl)));
  }
});

test("requires the obituary detail link to be one of the approved source URLs", () => {
  assert.throws(() => normalizeCommunityEventSources(obituaryDraft(
    "https://other.example/notice",
    ["https://example.com/notice"],
  )), /출처/);
});

test("sanitizes unsafe links from stored published events", () => {
  const sanitized = sanitizeStoredCommunityEventSources({
    sourceUrls: ["https://example.com/notice#tracking", "http://127.0.0.1/private"],
    details: { sourceUrl: "http://127.0.0.1/private", deceasedName: "故김한의" },
  });

  assert.deepEqual(sanitized.sourceUrls, ["https://example.com/notice"]);
  assert.deepEqual(sanitized.details, { deceasedName: "故김한의" });
});
