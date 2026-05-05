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

// Initialize Kakao SDK
export const initKakao = () => {
  if (typeof window !== "undefined" && window.Kakao) {
    // Get JavaScript Key from environment variable
    const kakaoKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY || import.meta.env.VITE_KAKAO_JS_KEY;
    console.log("Kakao key available:", !!kakaoKey, "Key length:", kakaoKey?.length);

    if (!kakaoKey) {
      console.error("VITE_KAKAO_JAVASCRIPT_KEY is not set");
      return;
    }

    if (!window.Kakao.isInitialized()) {
      try {
        window.Kakao.init(kakaoKey);
        console.log("Kakao SDK initialized successfully with key:", kakaoKey.substring(0, 8) + "...");
        console.log("Kakao Auth available:", !!window.Kakao.Auth);
        console.log("Kakao API available:", !!window.Kakao.API);
      } catch (error) {
        console.error("Kakao SDK initialization failed:", error);
      }
    } else {
      console.log("Kakao SDK already initialized");
    }
  } else {
    console.warn("Kakao SDK not available - window.Kakao:", !!window?.Kakao);
  }
};

// Kakao Login using OAuth authorize redirect flow
export const kakaoLogin = () => {
  if (!window.Kakao || !window.Kakao.Auth) {
    console.error("Kakao SDK not loaded");
    return;
  }

  if (!window.Kakao.isInitialized()) {
    console.error("Kakao SDK not initialized");
    return;
  }

  // v5 TEST API 기준 scope 확정
  // name, profile_image, account_email, birthday, phone_number
  // profile_image는 profile_nickname과 분리된 독립 동의항목으로 확인 완료
  // profile_nickname은 수집하지 않음
  // birthday는 선택 동의 항목
  // phone_number는 TEST API에서 필수 동의 가능, PROD 배포 시 추가 기능 신청 필요
  // CI(account_ci)는 현재 권한 없음 — 후속 ⑤·⑥에서 처리
  window.Kakao.Auth.authorize({
    redirectUri: `${window.location.origin}/kakao-callback`,
    scope: 'name,profile_image,account_email,birthday,phone_number',
    state: 'kakao_login',
  });
};

// Check service terms agreement status
export const checkServiceTerms = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (!window.Kakao || !window.Kakao.isInitialized()) {
      reject(new Error("Kakao SDK not available"));
      return;
    }

    window.Kakao.API.request({
      url: "/v1/user/service/terms",
      success: (result: any) => {
        console.log("Service terms status:", result);
        resolve(result);
      },
      fail: (error: any) => {
        console.error("Failed to check service terms:", error);
        reject(error);
      },
    });
  });
};

declare global {
  interface Window {
    Kakao: any;
  }
}
