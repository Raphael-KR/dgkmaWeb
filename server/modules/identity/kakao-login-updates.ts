import type { User } from "@shared/schema";
import type { KakaoLoginProfile } from "./kakao-profile";

export type KakaoMemberLogin = KakaoLoginProfile & { startedAt: Date; grantAdmin: boolean };

export function kakaoLoginUpdates(user: User, login: KakaoMemberLogin) {
  const updates: Partial<
    Pick<
      User,
      | "name"
      | "email"
      | "phoneNumber"
      | "profileImage"
      | "birthday"
      | "birthdayType"
      | "isLeapMonth"
      | "kakaoSyncEnabled"
      | "isAdmin"
    >
  > = {};
  if (user.name !== login.name) updates.name = login.name;
  if (user.email !== login.email) updates.email = login.email;
  if (user.phoneNumber !== login.phoneNumber) updates.phoneNumber = login.phoneNumber;
  if (!user.kakaoSyncEnabled) updates.kakaoSyncEnabled = true;
  if (login.grantAdmin && !user.isAdmin) updates.isAdmin = true;

  const photo = login.photoNeedsAgreement ? null : (login.profileImage ?? user.profileImage);
  if (user.profileImage !== photo) updates.profileImage = photo;

  // 날짜·역법·윤달은 한 생일이다. 불완전한 응답에 예전 생일의 역법을 섞지 않는다.
  const keepsKnownCalendar = login.birthdayType !== null || user.birthdayType === null;
  const keepsKnownLeapMonth = login.isLeapMonth !== null || user.isLeapMonth === null;
  if (
    login.birthdayNeedsAgreement ||
    (login.birthday && keepsKnownCalendar && keepsKnownLeapMonth)
  ) {
    if (user.birthday !== login.birthday) updates.birthday = login.birthday;
    if (user.birthdayType !== login.birthdayType) updates.birthdayType = login.birthdayType;
    if (user.isLeapMonth !== login.isLeapMonth) updates.isLeapMonth = login.isLeapMonth;
  }
  return updates;
}
