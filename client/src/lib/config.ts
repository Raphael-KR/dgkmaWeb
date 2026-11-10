// 브라우저 공통 설정. 외부 채널은 공개 환경변수, 표시 버전은 package.json을 참조한다.

// 동문 카카오톡 채널/오픈채팅 링크. 운영에서 VITE_KAKAO_CHANNEL_URL 로 주입.
// 미설정 시 "카톡방 참여" 버튼은 안내 토스트만 노출(가짜 링크 사용 안 함).
export const KAKAO_CHANNEL_URL =
  (import.meta.env.VITE_KAKAO_CHANNEL_URL as string | undefined)?.trim() || "";

// Static JSON import keeps the displayed version aligned with the package.
export { version as APP_VERSION } from "../../../package.json";
