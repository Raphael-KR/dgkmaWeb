import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import {
  consumePostgresEventParseQuota,
  createEventParseLimiter,
  createInMemoryEventParseQuota,
  type ConsumeEventParseQuota,
} from "./event-parse-limiter";
import { pool } from "./db";

async function listen(app: express.Express) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function sessionUser(app: express.Express) {
  app.use((req, _res, next) => {
    (req as any).session = { userId: 7 };
    next();
  });
}

test("shared quota state limits requests across limiter instances", async () => {
  const sharedQuota = createInMemoryEventParseQuota();
  const app = express();
  sessionUser(app);
  app.get("/a", createEventParseLimiter({ max: 3, consumeQuota: sharedQuota }), (_req, res) => res.sendStatus(204));
  app.get("/b", createEventParseLimiter({ max: 3, consumeQuota: sharedQuota }), (_req, res) => res.sendStatus(204));
  const server = await listen(app);

  try {
    assert.equal((await fetch(`${server.url}/a`)).status, 204);
    assert.equal((await fetch(`${server.url}/b`)).status, 204);
    assert.equal((await fetch(`${server.url}/a`)).status, 204);
    assert.equal((await fetch(`${server.url}/b`)).status, 429);
  } finally {
    await server.close();
  }
});

test("limits concurrent parsing work per user and releases capacity", async () => {
  const consumeQuota: ConsumeEventParseQuota = async () => true;
  const app = express();
  sessionUser(app);
  const heldResponses: express.Response[] = [];
  app.get(
    "/hold",
    createEventParseLimiter({
      consumeQuota,
      maxConcurrentPerUser: 2,
      maxConcurrentGlobal: 8,
    }),
    (_req, res) => heldResponses.push(res),
  );
  const server = await listen(app);

  try {
    const first = fetch(`${server.url}/hold`);
    const second = fetch(`${server.url}/hold`);
    while (heldResponses.length < 2) await new Promise((resolve) => setTimeout(resolve, 1));

    assert.equal((await fetch(`${server.url}/hold`)).status, 429);
    heldResponses.shift()?.sendStatus(204);
    assert.equal((await first).status, 204);

    const fourth = fetch(`${server.url}/hold`);
    while (heldResponses.length < 2) await new Promise((resolve) => setTimeout(resolve, 1));
    heldResponses.splice(0).forEach((response) => response.sendStatus(204));
    assert.equal((await second).status, 204);
    assert.equal((await fourth).status, 204);
  } finally {
    heldResponses.splice(0).forEach((response) => response.sendStatus(204));
    await server.close();
  }
});

test("PostgreSQL quota atomically limits requests across callers", async () => {
  const email = `event-parse-${randomUUID()}@example.test`;
  const inserted = await pool.query<{ id: number }>(`
    INSERT INTO users (email, name) VALUES ($1, '파싱 제한 테스트') RETURNING id
  `, [email]);
  const userId = inserted.rows[0]!.id;

  try {
    const results = await Promise.all(Array.from({ length: 12 }, () => (
      consumePostgresEventParseQuota(userId, 60_000, 10)
    )));
    assert.equal(results.filter(Boolean).length, 10);
    assert.equal(results.filter((allowed) => !allowed).length, 2);
  } finally {
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  }
});
