// 앱 전역 설정값. 환경변수(VITE_ 접두)로 주입하고, 미설정 시 안전한 기본 동작으로 처리한다.

// 동문 카카오톡 채널/오픈채팅 링크. 운영에서 VITE_KAKAO_CHANNEL_URL 로 주입.
// 미설정 시 "카톡방 참여" 버튼은 안내 토스트만 노출(가짜 링크 사용 안 함).
export const KAKAO_CHANNEL_URL =
  (import.meta.env.VITE_KAKAO_CHANNEL_URL as string | undefined)?.trim() || "";
