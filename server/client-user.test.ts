import assert from "node:assert/strict";
import test from "node:test";
import { updateProfileSchema, type User } from "@shared/schema";
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

  assert.deepEqual(toClientUser(user), {
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
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
  });
  assert.doesNotMatch(
    JSON.stringify(toClientUser(user)),
    /kakaoId|kakaoSyncEnabled|updatedAt|private-kakao-id/,
  );
});

test("profile updates do not expose the unused Kakao sync setting", () => {
  assert.equal("kakaoSyncEnabled" in updateProfileSchema.shape, false);
  assert.deepEqual(updateProfileSchema.parse({ kakaoSyncEnabled: true }), {});
});
