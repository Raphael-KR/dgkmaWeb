import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { registerRoutes } from "./routes";

test("source decision review route requires same-origin frozen admin and returns exact DTO", async () => {
  const frozen = { userId: 7, userUid: "77777777-7777-4777-8777-777777777777" }; let reads = 0;
  const review = { schemaVersion: "source-decision-review-v2" as const, decisionSetUid: "55555555-5555-4555-8555-555555555555", batchUid: "44444444-4444-4444-8444-444444444444", manifestSha256: "a".repeat(64), sourceFingerprint: "b".repeat(64), status: "previewed" as const, items: [] };
  const app = express(); app.use((req, _res, next) => { (req as any).session = { userId: Number(req.get("x-test-user-id")) || undefined }; next(); });
  const server = await registerRoutes(app, { getUserForAdmin: async (id) => id ? { isAdmin: true } : undefined, getSourceDecisionAdmin: async (id) => ({ id, userUid: frozen.userUid, isAdmin: true }), sourceDecisionAdminReceipt: frozen, sourceDecisionReviewReader: async () => { reads += 1; return review; } });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const port = (server.address() as AddressInfo).port; const base = `http://127.0.0.1:${port}`; const path = `/api/admin/accounting/source-decisions/${review.decisionSetUid}`;
  try {
    const crossOrigin = await fetch(`${base}${path}`, { headers: { "x-test-user-id": "7", origin: "https://evil.example", "sec-fetch-site": "same-origin" } }); assert.equal(crossOrigin.status, 403); assert.equal(reads, 0);
    const response = await fetch(`${base}${path}`, { headers: { "x-test-user-id": "7", origin: base, "sec-fetch-site": "same-origin" } }); assert.equal(response.status, 200); assert.deepEqual(await response.json(), review); assert.equal(reads, 1);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
