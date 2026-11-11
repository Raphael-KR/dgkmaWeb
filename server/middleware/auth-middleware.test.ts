import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { createRequireAdmin } from "./auth";

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
