import assert from "node:assert/strict";
import test from "node:test";
import { KakaoUnlinkError, unlinkKakaoUser } from "./kakao-unlink";

const adminKey = "admin-secret";
const kakaoId = "123456789";

async function expectUnlinkError(
  operation: Promise<void>,
): Promise<KakaoUnlinkError> {
  try {
    await operation;
    assert.fail("KakaoUnlinkError was not thrown");
  } catch (error) {
    assert.ok(error instanceof KakaoUnlinkError);
    return error;
  }
}

test("unlink sends the documented form request and accepts the matching Kakao user id", async () => {
  const kakaoFetch: typeof fetch = async (url, init) => {
    assert.equal(url, "https://kapi.kakao.com/v1/user/unlink");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "KakaoAK admin-secret");
    assert.ok(init?.body instanceof URLSearchParams);
    assert.equal(init.body.get("target_id_type"), "user_id");
    assert.equal(init.body.get("target_id"), "123456789");
    return Response.json({ id: 123456789 });
  };

  await unlinkKakaoUser({ adminKey, kakaoId, kakaoFetch });
});

test("network failures become a safe unlink error", async () => {
  const error = await expectUnlinkError(
    unlinkKakaoUser({
      adminKey,
      kakaoId,
      kakaoFetch: async () => {
        throw new Error("network details that must not escape");
      },
    }),
  );

  assert.equal(error.kind, "network_error");
  assert.equal(error.httpStatus, undefined);
  assert.doesNotMatch(error.message, /admin-secret|123456789|network details/);
});

test("only Kakao HTTP 400 code -101 is classified as already unlinked", async () => {
  const error = await expectUnlinkError(
    unlinkKakaoUser({
      adminKey,
      kakaoId,
      kakaoFetch: async () =>
        Response.json({ code: -101, msg: "Kakao response details" }, { status: 400 }),
    }),
  );

  assert.equal(error.kind, "already_unlinked");
  assert.equal(error.httpStatus, 400);
  assert.doesNotMatch(error.message, /admin-secret|123456789|Kakao response details/);
});

test("other Kakao error responses stop local deletion with a safe error", async () => {
  const error = await expectUnlinkError(
    unlinkKakaoUser({
      adminKey,
      kakaoId,
      kakaoFetch: async () =>
        Response.json({ code: -102, msg: "Kakao response details" }, { status: 400 }),
    }),
  );

  assert.equal(error.kind, "kakao_error");
  assert.equal(error.httpStatus, 400);
  assert.doesNotMatch(error.message, /admin-secret|123456789|Kakao response details/);
});

test("a successful response with a different user id stops local deletion", async () => {
  const error = await expectUnlinkError(
    unlinkKakaoUser({
      adminKey,
      kakaoId,
      kakaoFetch: async () => Response.json({ id: 987654321 }),
    }),
  );

  assert.equal(error.kind, "response_mismatch");
  assert.equal(error.httpStatus, 200);
  assert.doesNotMatch(error.message, /admin-secret|123456789|987654321/);
});

test("a non-JSON response becomes a safe invalid-response error", async () => {
  const error = await expectUnlinkError(
    unlinkKakaoUser({
      adminKey,
      kakaoId,
      kakaoFetch: async () => new Response("not-json", { status: 502 }),
    }),
  );

  assert.equal(error.kind, "invalid_response");
  assert.equal(error.httpStatus, 502);
  assert.doesNotMatch(error.message, /admin-secret|123456789|not-json/);
});

test("a successful JSON response without an id becomes invalid-response", async () => {
  const error = await expectUnlinkError(
    unlinkKakaoUser({
      adminKey,
      kakaoId,
      kakaoFetch: async () => Response.json({ ok: true }),
    }),
  );

  assert.equal(error.kind, "invalid_response");
  assert.equal(error.httpStatus, 200);
  assert.doesNotMatch(error.message, /admin-secret|123456789/);
});
