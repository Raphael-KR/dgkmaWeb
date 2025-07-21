export interface KakaoAuthResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  refresh_token_expires_in: number;
}

export interface KakaoUserInfo {
  id: number;
  connected_at: string;
  properties: {
    nickname: string;
    profile_image?: string;
    thumbnail_image?: string;
  };
  kakao_account: {
    profile_nickname_needs_agreement: boolean;
    profile_image_needs_agreement: boolean;
    profile: {
      nickname: string;
      thumbnail_image_url?: string;
      profile_image_url?: string;
      is_default_image?: boolean;
    };
    has_email: boolean;
    email_needs_agreement: boolean;
    is_email_valid: boolean;
    is_email_verified: boolean;
    email: string;
  };
}

// Initialize Kakao SDK
export const initKakao = () => {
  if (typeof window !== "undefined" && window.Kakao) {
    const kakaoKey = import.meta.env.VITE_KAKAO_JS_KEY || process.env.VITE_KAKAO_JS_KEY || "your-kakao-js-key";
    if (!window.Kakao.isInitialized()) {
      window.Kakao.init(kakaoKey);
    }
  }
};

// Kakao Login
export const kakaoLogin = (): Promise<{ kakaoId: string; email: string; name: string }> => {
  return new Promise((resolve, reject) => {
    if (!window.Kakao) {
      reject(new Error("Kakao SDK not loaded"));
      return;
    }

    window.Kakao.Auth.login({
      success: (authObj: KakaoAuthResponse) => {
        window.Kakao.API.request({
          url: "/v2/user/me",
          success: (userInfo: KakaoUserInfo) => {
            resolve({
              kakaoId: userInfo.id.toString(),
              email: userInfo.kakao_account.email,
              name: userInfo.properties.nickname,
            });
          },
          fail: (error: any) => {
            reject(new Error("Failed to get user info"));
          },
        });
      },
      fail: (error: any) => {
        reject(new Error("Kakao login failed"));
      },
    });
  });
};

declare global {
  interface Window {
    Kakao: any;
  }
}
