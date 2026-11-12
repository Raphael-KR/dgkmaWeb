import {
  type PendingRegistration,
  type User,
  type PendingRegistrationUserData,
  PENDING_REGISTRATION_CONFLICT_REASONS,
} from "@shared/schema";

export function parsePendingUserData(
  registration: PendingRegistration,
): PendingRegistrationUserData | undefined {
  const raw = registration.userData as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const data = raw as Record<string, unknown>;
  const kakaoId = typeof data.kakaoId === "string" ? data.kakaoId : registration.kakaoId;
  const email = typeof data.email === "string" ? data.email : registration.email;
  const name = typeof data.name === "string" ? data.name : registration.name;
  const phoneNumber = typeof data.phoneNumber === "string" ? data.phoneNumber : "";
  if (
    data.conflictReason !== undefined &&
    (typeof data.conflictReason !== "string" ||
      !PENDING_REGISTRATION_CONFLICT_REASONS.some((reason) => reason === data.conflictReason))
  )
    return undefined;
  const conflictReason = (data.conflictReason ??
    "not_found") as PendingRegistrationUserData["conflictReason"];
  if (!kakaoId || !email || !name || !phoneNumber) return undefined;
  if (
    kakaoId !== registration.kakaoId ||
    email.trim().toLowerCase() !== registration.email.trim().toLowerCase()
  )
    return undefined;

  return {
    kakaoId,
    email,
    name,
    phoneNumber,
    profileImage: typeof data.profileImage === "string" ? data.profileImage : null,
    birthday: typeof data.birthday === "string" ? data.birthday : null,
    birthdayType:
      data.birthdayType === "SOLAR" || data.birthdayType === "LUNAR" ? data.birthdayType : null,
    isLeapMonth: typeof data.isLeapMonth === "boolean" ? data.isLeapMonth : null,
    conflictReason,
  };
}

// 승인 취소 시 기존 회원 정보로 심사 신청을 구성한다.
export function memberRegistrationData(user: User): PendingRegistrationUserData {
  return {
    kakaoId: user.kakaoId ?? "",
    email: user.email,
    name: user.name,
    phoneNumber: user.phoneNumber ?? "",
    profileImage: user.profileImage,
    birthday: user.birthday,
    birthdayType:
      user.birthdayType === "SOLAR" || user.birthdayType === "LUNAR" ? user.birthdayType : null,
    isLeapMonth: user.isLeapMonth,
    conflictReason: "approval_cancelled",
  };
}
