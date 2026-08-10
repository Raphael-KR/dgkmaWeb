import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { registerRoutes } from "./routes";
import { shutdownDatabasePool } from "./db";

test("source decision review route requires same-origin frozen admin and returns exact DTO", async () => {
  const frozen = { userId: 7, userUid: "77777777-7777-4777-8777-777777777777" }; let reads = 0;
  const review = { schemaVersion: "source-decision-review-v2" as const, decisionSetUid: "55555555-5555-4555-8555-555555555555", batchUid: "44444444-4444-4444-8444-444444444444", manifestSha256: "a".repeat(64), sourceFingerprint: "b".repeat(64), status: "previewed" as const, items: [] };
  const app = express(); app.use((req, _res, next) => { (req as any).session = { userId: Number(req.get("x-test-user-id")) || undefined }; next(); });
  const server = await registerRoutes(app, { getUserForAdmin: async (id) => id ? { isAdmin: true } : undefined, getSourceDecisionAdmin: async (id) => ({ id, userUid: frozen.userUid, isAdmin: true }), sourceDecisionAdminReceipt: frozen, sourceDecisionReviewReader: async () => { reads += 1; return review; } });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const port = (server.address() as AddressInfo).port; const base = `http://127.0.0.1:${port}`; const path = `/api/admin/accounting/source-decisions/${review.decisionSetUid}`;
  try {
    const crossOrigin = await fetch(`${base}${path}`, { headers: { "x-test-user-id": "7", origin: "https://evil.example", "sec-fetch-site": "same-origin" } }); assert.equal(crossOrigin.status, 403); assert.equal(reads, 0);
    const response = await fetch(`${base}${path}`, { headers: { "x-test-user-id": "7", origin: base, "sec-fetch-site": "same-origin" } }); assert.equal(response.status, 200); assert.deepEqual(await response.json(), review); assert.equal(reads, 1);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await shutdownDatabasePool(); }
});

test("source decision POST requires the same-origin frozen admin and delegates only a strict command", async () => {
  const frozen = { userId: 7, userUid: "77777777-7777-4777-8777-777777777777", authorizationVersion: "8".repeat(64), targetFingerprint: "9".repeat(64) }; let writes = 0;
  const receipt = { schema_version: "dgkma-source-decision-approval-v2" as const, operation_uid: "12345678-1234-4234-8234-123456789abc", primary_decision_set_uid: "55555555-5555-4555-8555-555555555555", primary_batch_uid: "44444444-4444-4444-8444-444444444444", applied_batch_uids: [], approved_decision_set_uids: [], manifest_sha256: "a".repeat(64), source_fingerprint: "b".repeat(64), decision: "reject" as const, replacement_decision_set_uid: null, replacement_manifest_sha256: null, actor_user_id: 7, actor_user_uid: frozen.userUid, authorization_version: frozen.authorizationVersion, target_fingerprint: frozen.targetFingerprint, decided_at: "2026-08-11T00:00:00.000Z", operation_payload_sha256: "c".repeat(64), receipt_sha256: "d".repeat(64) };
  const command = { schemaVersion: "source-decision-command-v1", operationUid: receipt.operation_uid, manifestSha256: receipt.manifest_sha256, sourceFingerprint: receipt.source_fingerprint, decision: "reject", replacementDecisionSetUid: null, replacementManifest: null, replacementItems: null, replacementManifestSha256: null };
  const app = express(); app.use((req, _res, next) => { (req as any).session = { userId: Number(req.get("x-test-user-id")) || undefined }; next(); });
  const server = await registerRoutes(app, { getUserForAdmin: async (id) => id ? { isAdmin: true } : undefined, getSourceDecisionAdmin: async (id) => ({ id, userUid: frozen.userUid, name: "관리자", isAdmin: true }), sourceDecisionAdminReceipt: frozen, sourceDecisionReviewReader: async () => undefined, sourceDecisionExecutor: async (_uid, received, actor) => { writes += 1; assert.deepEqual(received, command); assert.equal(actor.authorizationVersion, frozen.authorizationVersion); return receipt; } });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const port = (server.address() as AddressInfo).port; const base = `http://127.0.0.1:${port}`; const path = `/api/admin/accounting/source-decisions/${receipt.primary_decision_set_uid}/decision`;
  try {
    const crossOrigin = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-test-user-id": "7", origin: "https://evil.example", "sec-fetch-site": "same-origin" }, body: JSON.stringify(command) }); assert.equal(crossOrigin.status, 403); assert.equal(writes, 0);
    const response = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-test-user-id": "7", origin: base, "sec-fetch-site": "same-origin" }, body: JSON.stringify(command) }); assert.equal(response.status, 200); assert.deepEqual(await response.json(), receipt); assert.equal(writes, 1);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
