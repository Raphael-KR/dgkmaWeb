import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(`../client/src/${path}`, import.meta.url), "utf8");

test("public Kakao consent copy and birthday UI match the approved contract", async () => {
  const [login, privacy, terms, profile, home, callback] = await Promise.all([
    source("pages/login.tsx"),
    source("pages/privacy.tsx"),
    source("pages/terms.tsx"),
    source("pages/profile.tsx"),
    source("pages/home.tsx"),
    source("pages/kakao-callback.tsx"),
  ]);

  assert.match(login, /필수/);
  assert.match(login, /이름/);
  assert.match(login, /이메일/);
  assert.match(login, /전화번호/);
  assert.match(login, /선택/);
  assert.match(login, /프로필 사진/);
  assert.match(login, /생일/);
  assert.doesNotMatch(login, /카카오싱크/);
  assert.doesNotMatch(privacy, /CI\(연계정보\)|생일 축하 쿠폰/);
  assert.match(privacy, /내부 연결 식별자/);
  assert.doesNotMatch(terms, /근무지 정보/);
  assert.match(profile, /profileImage/);
  assert.match(profile, /birthdayType/);
  assert.match(home, /isBirthdayToday/);
  assert.doesNotMatch(callback, /phoneNumber|profileImage|birthdayType|isLeapMonth/);
});

test("Kakao callback handles every explicit login result without remaining on the loading screen", async () => {
  const [auth, callback, profileEdit, settings] = await Promise.all([
    source("hooks/use-auth.tsx"),
    source("pages/kakao-callback.tsx"),
    source("components/profile/profile-edit-dialog.tsx"),
    source("components/profile/settings-dialog.tsx"),
  ]);

  assert.match(auth, /import type \{ ClientUser \} from "@shared\/schema"/);
  assert.doesNotMatch(auth, /import type \{ User \} from "@shared\/schema"/);
  assert.match(auth, /export type LoginResult =/);
  assert.match(auth, /status: "success"; user: ClientUser/);
  assert.match(auth, /status: "requiresApproval"/);
  assert.match(auth, /status: "failure"/);

  assert.match(callback, /result\.status === "success"/);
  assert.match(callback, /result\.status === "requiresApproval"/);
  assert.match(callback, /result\.status === "failure"/);
  assert.match(callback, /setLocation\("\/login"\)/);

  assert.match(profileEdit, /import \{ REGION_OPTIONS, type ClientUser \} from "@shared\/schema"/);
  assert.doesNotMatch(profileEdit, /type User/);
  assert.match(settings, /import type \{ ClientUser \} from "@shared\/schema"/);
  assert.doesNotMatch(settings, /type User/);
});

test("member withdrawal uses a separate destructive confirmation dialog and clears client auth state", async () => {
  const [settings, deletion, profile, auth] = await Promise.all([
    source("components/profile/settings-dialog.tsx"),
    source("components/profile/delete-account-dialog.tsx"),
    source("pages/profile.tsx"),
    source("hooks/use-auth.tsx"),
  ]);

  assert.match(settings, /회원 탈퇴/);
  assert.match(settings, /onDeleteAccount/);
  assert.match(profile, /setSettingsOpen\(false\)/);
  assert.match(profile, /setDeleteAccountOpen\(true\)/);
  assert.match(profile, /<DeleteAccountDialog/);

  assert.match(deletion, /AlertDialog/);
  assert.match(deletion, /confirmation === "탈퇴"/);
  assert.match(deletion, /DELETE/);
  assert.match(deletion, /\/api\/users\/me/);
  assert.match(deletion, /variant="destructive"/);
  assert.match(deletion, /disabled=\{!isConfirmed/);
  assert.match(deletion, /setUser\(null\)/);
  assert.match(deletion, /queryClient\.clear\(\)/);
  assert.match(deletion, /setLocation\("\/"\)/);
  assert.match(deletion, /variant: "destructive"/);

  assert.match(auth, /setUser: \(user: ClientUser \| null\) => void/);
});
