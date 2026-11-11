import assert from "node:assert/strict";
import test from "node:test";
import { updateProfileSchema, type User } from "@shared/schema";
import { toClientUser } from "./client-user";

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

test("profile updates reject an invalid activity region", () => {
  assert.equal(updateProfileSchema.safeParse({ activityRegion: "서울" }).success, false);
});
