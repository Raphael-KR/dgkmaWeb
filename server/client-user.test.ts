import assert from "node:assert/strict";
import test from "node:test";
import {
  updateProfileSchema,
  type ClientUser,
  type User,
} from "@shared/schema";
import { toClientUser } from "./client-user";

test("toClientUser returns only fields required by the signed-in member UI", () => {
  const user: User = {
    id: 7,
    kakaoId: "private-kakao-id",
    email: "member@example.com",
    name: "홍길동",
    graduationYear: 2004,
    isVerified: true,
    isAdmin: false,
    kakaoSyncEnabled: true,
    profileImage: "https://cdn.example.com/profile.jpg",
    phoneNumber: "+82 10-1234-5678",
    birthday: "0101",
    birthdayType: "SOLAR",
    isLeapMonth: false,
    activityRegion: "서울특별시",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-02T00:00:00.000Z"),
  };

  const clientUser: ClientUser = toClientUser(user);
  assert.deepEqual(clientUser, {
    id: 7,
    email: "member@example.com",
    name: "홍길동",
    graduationYear: 2004,
    isVerified: true,
    isAdmin: false,
    profileImage: "https://cdn.example.com/profile.jpg",
    phoneNumber: "+82 10-1234-5678",
    birthday: "0101",
    birthdayType: "SOLAR",
    isLeapMonth: false,
    activityRegion: "서울특별시",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  assert.doesNotMatch(
    JSON.stringify(toClientUser(user)),
    /kakaoId|kakaoSyncEnabled|updatedAt|private-kakao-id/,
  );
  assert.deepEqual(Object.keys(clientUser).sort(), [
    "activityRegion",
    "birthday",
    "birthdayType",
    "createdAt",
    "email",
    "graduationYear",
    "id",
    "isAdmin",
    "isLeapMonth",
    "isVerified",
    "name",
    "phoneNumber",
    "profileImage",
  ]);
});

test("toClientUser keeps a missing creation time as JSON null", () => {
  const user: User = {
    id: 8,
    kakaoId: null,
    email: "legacy@example.com",
    name: "레거시 회원",
    graduationYear: null,
    isVerified: false,
    isAdmin: false,
    kakaoSyncEnabled: false,
    profileImage: null,
    phoneNumber: null,
    birthday: null,
    birthdayType: null,
    isLeapMonth: null,
    activityRegion: null,
    createdAt: null,
    updatedAt: null,
  };

  assert.equal(toClientUser(user).createdAt, null);
});

test("profile updates strip every protected user field", () => {
  assert.deepEqual(
    updateProfileSchema.parse({
      id: 99,
      kakaoId: "attacker-kakao-id",
      email: "attacker@example.com",
      name: "공격자",
      graduationYear: 1999,
      isVerified: false,
      isAdmin: true,
      kakaoSyncEnabled: true,
      profileImage: "https://attacker.example.com/profile.jpg",
      phoneNumber: "010-0000-0000",
      birthday: "0101",
      birthdayType: "SOLAR",
      isLeapMonth: false,
      activityRegion: "서울특별시",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-02T00:00:00.000Z"),
    }),
    { activityRegion: "서울특별시" },
  );
});

test("profile updates accept a valid activity region", () => {
  assert.deepEqual(
    updateProfileSchema.parse({ activityRegion: "부산광역시" }),
    { activityRegion: "부산광역시" },
  );
});

test("profile updates reject an invalid activity region", () => {
  assert.equal(
    updateProfileSchema.safeParse({ activityRegion: "서울" }).success,
    false,
  );
});
