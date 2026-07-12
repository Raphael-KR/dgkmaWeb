import type { ClientUser, User } from "@shared/schema";

export function toClientUser(user: User): ClientUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    graduationYear: user.graduationYear,
    isVerified: user.isVerified,
    isAdmin: user.isAdmin,
    kakaoSyncEnabled: user.kakaoSyncEnabled,
    profileImage: user.profileImage,
    phoneNumber: user.phoneNumber,
    birthday: user.birthday,
    birthdayType: user.birthdayType,
    isLeapMonth: user.isLeapMonth,
    activityRegion: user.activityRegion,
    createdAt: user.createdAt,
  };
}
