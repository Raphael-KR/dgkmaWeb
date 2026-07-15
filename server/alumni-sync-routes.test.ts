import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import type { AlumniSyncReport } from "@shared/alumni-sync";
import { registerRoutes, type RouteDependencies } from "./routes";
import {
  AlumniSyncBlockedError,
  AlumniSyncFingerprintMismatchError,
  AlumniSyncInProgressError,
} from "./storage";

const report: AlumniSyncReport = {
  sourceTotal: 2,
  databaseTotal: 3,
  insert: 1,
  update: 1,
  unchanged: 0,
  conflict: 0,
  invalid: 0,
  sourceOnly: 1,
  databaseOnly: 2,
  blocked: false,
  sourceFingerprint: `sha256:${"a".repeat(64)}`,
  issues: [],
};

async function startServer(alumniSyncStorage: NonNullable<RouteDependencies["alumniSyncStorage"]>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { userId: 1 };
    next();
  });
  const server = await registerRoutes(app, {
    getUserForAdmin: async () => ({ isAdmin: true }),
    alumniSyncStorage,
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

test("preview returns only the report and its non-identifying fingerprint", async () => {
  let previewCalls = 0;
  const server = await startServer({
    previewAlumniSync: async () => {
      previewCalls++;
      return report;
    },
    applyAlumniSync: async () => report,
  });

  try {
    const response = await fetch(`${server.baseUrl}/api/admin/sync-alumni/preview`, {
      method: "POST",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      report,
      fingerprint: report.sourceFingerprint,
    });
    assert.equal(previewCalls, 1);
  } finally {
    await server.close();
  }
});

test("apply requires a fingerprint and forwards only that fingerprint", async () => {
  const received: string[] = [];
  const server = await startServer({
    previewAlumniSync: async () => report,
    applyAlumniSync: async (fingerprint) => {
      received.push(fingerprint);
      return report;
    },
  });

  try {
    const missing = await fetch(`${server.baseUrl}/api/admin/sync-alumni`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(missing.status, 400);
    assert.deepEqual(await missing.json(), { message: "유효한 미리보기가 필요합니다" });
    assert.deepEqual(received, []);

    const applied = await fetch(`${server.baseUrl}/api/admin/sync-alumni`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fingerprint: report.sourceFingerprint }),
    });
    assert.equal(applied.status, 200);
    assert.deepEqual(await applied.json(), { report });
    assert.deepEqual(received, [report.sourceFingerprint]);
  } finally {
    await server.close();
  }
});

test("apply maps stale, blocked, and concurrent plans to fixed PII-free responses", async () => {
  const cases = [
    {
      error: new AlumniSyncFingerprintMismatchError(),
      status: 409,
      message: "명부가 변경되었습니다. 다시 미리보기 해주세요",
    },
    {
      error: new AlumniSyncBlockedError(),
      status: 422,
      message: "차단 오류를 해결한 뒤 다시 미리보기 해주세요",
    },
    {
      error: new AlumniSyncInProgressError(),
      status: 409,
      message: "다른 명부 동기화가 진행 중입니다",
    },
  ];

  for (const item of cases) {
    const server = await startServer({
      previewAlumniSync: async () => report,
      applyAlumniSync: async () => { throw item.error; },
    });
    try {
      const response = await fetch(`${server.baseUrl}/api/admin/sync-alumni`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fingerprint: report.sourceFingerprint }),
      });
      assert.equal(response.status, item.status);
      assert.deepEqual(await response.json(), { message: item.message });
    } finally {
      await server.close();
    }
  }
});

test("unexpected sync failures do not expose source errors in response or logs", async (t) => {
  const sourceError = "private alumni name 010-1234-5678 secret memo";
  const logs: string[] = [];
  t.mock.method(console, "error", (...values: unknown[]) => {
    logs.push(values.map(String).join(" "));
  });
  const server = await startServer({
    previewAlumniSync: async () => { throw new Error(sourceError); },
    applyAlumniSync: async () => { throw new Error(sourceError); },
  });

  try {
    for (const path of ["/api/admin/sync-alumni/preview", "/api/admin/sync-alumni"]) {
      const response = await fetch(`${server.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: path.endsWith("preview")
          ? undefined
          : JSON.stringify({ fingerprint: report.sourceFingerprint }),
      });
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), {
        message: "동기화에 실패했습니다. 잠시 후 다시 시도해주세요",
      });
    }
    assert.doesNotMatch(logs.join("\n"), new RegExp(sourceError));
  } finally {
    await server.close();
  }
});
