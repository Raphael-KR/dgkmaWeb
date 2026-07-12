import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const loginPath = new URL("../client/src/pages/login.tsx", import.meta.url);
const privacyPath = new URL("../client/src/pages/privacy.tsx", import.meta.url);
const termsPath = new URL("../client/src/pages/terms.tsx", import.meta.url);
const profilePath = new URL("../client/src/pages/profile.tsx", import.meta.url);

test("public consent guidance matches the Kakao data contract", async () => {
  const [login, privacy, terms, profile] = await Promise.all([
    readFile(loginPath, "utf8"),
    readFile(privacyPath, "utf8"),
    readFile(termsPath, "utf8"),
    readFile(profilePath, "utf8"),
  ]);

  assert.match(login, /필수/);
  assert.match(login, /이름/);
  assert.match(login, /이메일/);
  assert.match(login, /전화번호/);
  assert.match(login, /선택/);
  assert.match(login, /프로필 사진/);
  assert.doesNotMatch(login, /카카오싱크/);
  assert.doesNotMatch(privacy, /CI\(연계정보\)|생일 축하 쿠폰/);
  assert.doesNotMatch(terms, /근무지 정보/);
  assert.match(profile, /profileImage/);
});
