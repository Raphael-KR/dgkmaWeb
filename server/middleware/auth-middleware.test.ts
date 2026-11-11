import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { createRequireAdmin, createVerifiedSessionGuard } from "./auth";

function requestWithUserId(userId: number): Request {
  return { session: { userId } } as unknown as Request;
}

function responseDouble() {
  const state: { status?: number } = {};
  const response = {
    status(code: number) {
      state.status = code;
      return response;
    },
    json() {
      return response;
    },
    clearCookie() {
      return response;
    },
  } as unknown as Response;
  return { response, state };
}

test("requireAdmin returns 401 for a missing session user", async () => {
  const middleware = createRequireAdmin(async () => undefined);
  const { response, state } = responseDouble();

  await middleware(requestWithUserId(7), response, (() => {}) as NextFunction);

  assert.equal(state.status, 401);
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

for (const verified of [true, false, null]) {
  test(`session approval guard handles approval=${verified}`, async () => {
    const request = requestWithUserId(7);
    let destroyed = false;
    request.session.destroy = (done) => {
      destroyed = true;
      done(undefined);
      return request.session;
    };
    const { response, state } = responseDouble();
    let nextCalls = 0;
    await createVerifiedSessionGuard(async () => ({ isVerified: verified }))(
      request,
      response,
      () => {
        nextCalls += 1;
      },
    );
    assert.equal(nextCalls, verified ? 1 : 0);
    assert.equal(destroyed, !verified);
    assert.equal(state.status, verified ? undefined : 401);
    assert.equal(request.session.userId, verified ? 7 : undefined);
  });
}

test("session approval guard leaves anonymous public access untouched", async () => {
  const request = { session: {} } as Request;
  const { response } = responseDouble();
  let nextCalls = 0;
  await createVerifiedSessionGuard(async () => {
    throw new Error("anonymous request must not query members");
  })(request, response, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 1);
});
