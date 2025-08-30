
// Note: This project uses Supabase as database only, not for client-side authentication
// Authentication is handled through custom Kakao Login system

// Dummy exports to maintain compatibility with existing imports
export const supabase = null;

export async function getCurrentUser() {
  // Using custom auth system, not Supabase auth
  return null;
}

export async function signOut() {
  // Using custom logout system
  return { success: true };
}

export async function signInWithKakao(kakaoData: { kakaoId: string; email: string; name: string }) {
  // This should be handled by the custom auth system
  console.log('Kakao auth data received:', kakaoData);
  return { success: true, data: kakaoData };
}
