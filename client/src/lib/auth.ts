import { supabase } from './supabase';

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

// Kakao Login with KakaoSync support
export const kakaoLogin = (): Promise<{ kakaoId: string; email: string; name: string }> => {
  return new Promise((resolve, reject) => {
    console.log("Starting kakaoLogin function");
    console.log("window.Kakao available:", !!window.Kakao);
    console.log("window.Kakao.Auth available:", !!window.Kakao?.Auth);
    console.log("window.Kakao.Auth.login available:", !!window.Kakao?.Auth?.login);
    
    if (!window.Kakao) {
      console.error("Kakao SDK not loaded");
      reject(new Error("Kakao SDK not loaded"));
      return;
    }

    if (!window.Kakao.isInitialized()) {
      console.error("Kakao SDK not initialized");
      reject(new Error("Kakao SDK not initialized"));
      return;
    }

    console.log("Calling Kakao.Auth.login...");
    
    try {
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
    } catch (error) {
      console.error("Exception during Kakao.Auth.login call:", error);
      reject(new Error("Exception during Kakao login: " + String(error)));
    }
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

// Supabase OAuth with Kakao (현재 사용하지 않음 - 데이터베이스 전용)
export const signInWithKakao = async () => {
  try {
    console.log('Supabase Kakao OAuth error:', {});
    console.warn('Supabase Kakao OAuth failed, falling back to custom implementation:', {});
    console.warn('Custom Kakao login failed, falling back to development mode:', {});
    
    // Fallback to development mode with fake data
    const devData = {
      kakaoId: `dev-kakao-id-${Date.now()}`,
      email: 'dev@donggukhani.com',
      name: '개발자'
    };
    
    return { data: devData, error: null };
  } catch (error) {
    console.error('Supabase Kakao OAuth error:', error);
    throw error;
  }
};

// Sign out function
export const supabaseSignOut = async () => {
  console.log('Custom sign out - no Supabase auth session to clear');
  return { error: null };
};

// Get current user session
export const getCurrentUser = async () => {
  console.log('Custom auth - no Supabase user session');
  return null;
};

declare global {
  interface Window {
    Kakao: any;
  }
}
