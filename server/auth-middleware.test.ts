import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { createRequireAdmin, requireAuthenticated } from "./auth-middleware";

function requestWithUserId(userId?: number): Request {
  return { session: userId === undefined ? {} : { userId } } as unknown as Request;
}

function responseDouble() {
  const state: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      state.status = code;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      return response;
    },
  } as unknown as Response;
  return { response, state };
}

test("requireAuthenticated returns 401 without a session user", () => {
  const { response, state } = responseDouble();
  let nextCalls = 0;

  requireAuthenticated(
    requestWithUserId(),
    response,
    (() => {
      nextCalls += 1;
    }) as NextFunction,
  );

  assert.equal(state.status, 401);
  assert.equal(nextCalls, 0);
});

test("requireAuthenticated calls next with a session user", () => {
  const { response, state } = responseDouble();
  let nextCalls = 0;

  requireAuthenticated(
    requestWithUserId(7),
    response,
    (() => {
      nextCalls += 1;
    }) as NextFunction,
  );

  assert.equal(state.status, undefined);
  assert.equal(nextCalls, 1);
});

test("requireAdmin returns 401 without a session user", async () => {
  let lookupCalls = 0;
  const middleware = createRequireAdmin(async () => {
    lookupCalls += 1;
    return undefined;
  });
  const { response, state } = responseDouble();

  await middleware(requestWithUserId(), response, (() => {}) as NextFunction);

  assert.equal(state.status, 401);
  assert.equal(lookupCalls, 0);
});

test("requireAdmin returns 401 for a missing session user", async () => {
  const middleware = createRequireAdmin(async () => undefined);
  const { response, state } = responseDouble();

  await middleware(requestWithUserId(7), response, (() => {}) as NextFunction);

  assert.equal(state.status, 401);
});

test("requireAdmin returns 403 for a non-admin user", async () => {
  const middleware = createRequireAdmin(async () => ({ isAdmin: false }));
  const { response, state } = responseDouble();

  await middleware(requestWithUserId(7), response, (() => {}) as NextFunction);

  assert.equal(state.status, 403);
});

test("requireAdmin calls next for an admin user", async () => {
  const middleware = createRequireAdmin(async () => ({ isAdmin: true }));
  const { response, state } = responseDouble();
  let nextCalls = 0;

  await middleware(
    requestWithUserId(7),
    response,
    (() => {
      nextCalls += 1;
    }) as NextFunction,
  );

  assert.equal(nextCalls, 1);
  assert.equal(state.status, undefined);
});

test("requireAdmin returns 500 without logging the original error", async () => {
  const originalError = console.error;
  const calls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };

  try {
    const secretError = new Error("private alumni value");
    const middleware = createRequireAdmin(async () => {
      throw secretError;
    });
    const { response, state } = responseDouble();

    await middleware(requestWithUserId(7), response, (() => {}) as NextFunction);

    assert.equal(state.status, 500);
    assert.equal(calls.flat().includes(secretError), false);
    assert.equal(JSON.stringify(calls).includes(secretError.message), false);
  } finally {
    console.error = originalError;
  }
});
