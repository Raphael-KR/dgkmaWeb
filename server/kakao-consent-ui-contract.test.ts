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
  assert.match(login, /카카오톡 채널 추가 상태 및 내역/);
  assert.match(login, /동문회 공지 및 경조사 알림/);
  assert.match(login, /활동 지역은 카카오 제공항목이 아니며, 로그인 후 별도로 입력/);
  assert.doesNotMatch(login, /카카오싱크/);
  assert.doesNotMatch(privacy, /CI\(연계정보\)|생일 축하 쿠폰/);
  assert.match(privacy, /내부 연결 식별자/);
  assert.match(privacy, /카카오톡 채널 추가 상태 및 내역/);
  assert.match(privacy, /동문회 공지 및 경조사 알림/);
  assert.doesNotMatch(terms, /근무지 정보/);
  assert.doesNotMatch(terms, /카카오싱크|간편 가입/);
  assert.match(terms, /카카오톡 채널 추가 상태 및 내역/);
  assert.match(terms, /동문회 공지 및 경조사 알림/);
  assert.match(profile, /profileImage/);
  assert.match(profile, /birthdayType/);
  assert.match(home, /isBirthdayToday/);
  assert.doesNotMatch(callback, /phoneNumber|profileImage|birthdayType|isLeapMonth/);
});

test("privacy policy discloses essential overseas processing for Replit and Neon", async () => {
  const privacy = await source("pages/privacy.tsx");

  assert.match(privacy, /제5조의2 \(개인정보의 국외 이전\)/);
  assert.match(privacy, /Replit, Inc\./);
  assert.match(privacy, /privacy@replit\.com/);
  assert.match(privacy, /Neon, LLC/);
  assert.match(privacy, /privacy@neon\.tech/);
  assert.match(privacy, /미국/);
  assert.match(privacy, /암호화된 네트워크/);
  assert.match(privacy, /개인정보 보호법 제28조의8 제1항 제3호/);
  assert.match(privacy, /국외 이전을 거부/);
  assert.match(privacy, /제8조에 기재된 이메일/);
  assert.match(privacy, /회원 가입 및 서비스 이용이 제한/);
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
  assert.doesNotMatch(settings, /ClientUser|kakaoSyncEnabled/);
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
  assert.match(deletion, /회원 개인정보를 삭제/);
  assert.match(deletion, /미발행 초안/);
  assert.match(deletion, /게시글/);
  assert.match(deletion, /댓글/);
  assert.match(deletion, /발행된 경조사/);
  assert.match(deletion, /결제 기록/);
  assert.match(deletion, /익명으로 보존/);

  assert.match(auth, /setUser: \(user: ClientUser \| null\) => void/);
});

test("public copy does not claim an unimplemented Kakao notification service", async () => {
  const [settings, login, privacy, terms] = await Promise.all([
    source("components/profile/settings-dialog.tsx"),
    source("pages/login.tsx"),
    source("pages/privacy.tsx"),
    source("pages/terms.tsx"),
  ]);

  assert.doesNotMatch(settings, /카카오 알림 연동|switch-kakao-sync|kakaoSyncEnabled/);
  assert.doesNotMatch(settings, /동문회 소식·경조사 안내를 카카오로/);
  assert.doesNotMatch(await source("hooks/use-auth.tsx"), /카카오톡으로 결과/);
  for (const publicCopy of [login, privacy, terms]) {
    assert.doesNotMatch(publicCopy, /카카오톡 자동 발송|친구톡 자동 발송|문자 메시지를 대체/);
  }
  assert.doesNotMatch(terms, /카카오톡을 통한 알림 서비스|동문회 소식 및 행사 알림|회비 납부 안내/);
  assert.match(terms, /카카오 계정을 통한 로그인/);
  assert.match(terms, /카카오 로그인 서비스/);
});
