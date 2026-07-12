export interface KakaoAuthResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  refresh_token_expires_in: number;
}

// v5 — 카카오 공식 응답 스펙 정합 (https://developers.kakao.com/docs/ko/kakaologin/rest-api#req-user-info)
// ⚠️ Deprecated 필드 제거: properties.nickname/profile_image/thumbnail_image, has_* 계열
// ⚠️ properties는 사용자 정의 custom property 조회용으로만 취급 (프로필 소스 ❌)
export interface KakaoUserInfo {
  id: number;
  connected_at?: string;
  synched_at?: string;
  properties?: Record<string, string>; // custom user properties only — deprecated profile fields 사용 금지
  kakao_account?: {
    profile_needs_agreement?: boolean;
    profile_nickname_needs_agreement?: boolean;
    profile_image_needs_agreement?: boolean;
    profile?: {
      nickname?: string; // v5 저장·fallback·매칭 사용 금지. users.name은 kakao_account.name만 사용.
      thumbnail_image_url?: string;
      profile_image_url?: string;
      is_default_image?: boolean;
      is_default_nickname?: boolean;
    };

    // 본명 (v5 활성 — kakao_account.name 원본값을 users.name에 저장)
    name_needs_agreement?: boolean;
    name?: string;             // 카카오계정 이름. users.name에 원본 저장. profile.nickname은 v5 미사용(users.name fallback 금지).

    email_needs_agreement?: boolean;
    is_email_valid?: boolean;
    is_email_verified?: boolean;
    email?: string;

    birthday_needs_agreement?: boolean;
    birthday?: string;             // "MMDD" (4자리)
    birthday_type?: 'SOLAR' | 'LUNAR';
    is_leap_month?: boolean;

    phone_number_needs_agreement?: boolean;
    phone_number?: string;         // 카카오 응답 원본 문자열. 저장 시 변형 금지.

    // CI (v5.1/v6 심사 통과 후 활성화)
    ci_needs_agreement?: boolean;
    ci?: string;
    ci_authenticated_at?: string;
  };
  for_partner?: {
    uuid?: string;
  };
}

export const kakaoLogin = () => {
  window.location.assign("/api/auth/kakao/start");
};
