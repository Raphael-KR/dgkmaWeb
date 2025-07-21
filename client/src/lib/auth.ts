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
    // Get JavaScript Key from environment variable
    const kakaoKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY;
    if (!kakaoKey) {
      console.error("VITE_KAKAO_JAVASCRIPT_KEY is not set");
      return;
    }
    
    if (!window.Kakao.isInitialized()) {
      try {
        window.Kakao.init(kakaoKey);
        console.log("Kakao SDK initialized successfully");
      } catch (error) {
        console.error("Kakao SDK initialization failed:", error);
      }
    }
  } else {
    console.warn("Kakao SDK not available");
  }
};

// Kakao Login with KakaoSync support
export const kakaoLogin = (): Promise<{ kakaoId: string; email: string; name: string }> => {
  return new Promise((resolve, reject) => {
    if (!window.Kakao) {
      reject(new Error("Kakao SDK not loaded"));
      return;
    }

    if (!window.Kakao.isInitialized()) {
      reject(new Error("Kakao SDK not initialized"));
      return;
    }

    // Use KakaoSync simplified registration with service terms
    window.Kakao.Auth.login({
      // Request additional user information for KakaoSync
      scope: 'profile_nickname,profile_image,account_email',
      success: (authObj: KakaoAuthResponse) => {
        console.log("Kakao auth success:", authObj);
        
        // Request user information including terms agreement
        window.Kakao.API.request({
          url: "/v2/user/me",
          success: (userInfo: KakaoUserInfo) => {
            console.log("Kakao user info:", userInfo);
            
            resolve({
              kakaoId: userInfo.id.toString(),
              email: userInfo.kakao_account?.email || `user${userInfo.id}@example.com`,
              name: userInfo.properties?.nickname || userInfo.kakao_account?.profile?.nickname || "카카오 사용자",
            });
          },
          fail: (error: any) => {
            console.error("Failed to get user info:", error);
            reject(new Error("Failed to get user info: " + JSON.stringify(error)));
          },
        });
      },
      fail: (error: any) => {
        console.error("Kakao login failed:", error);
        reject(new Error("Kakao login failed: " + JSON.stringify(error)));
      },
    });
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
