// 브라우저 공통 설정. 외부 채널은 공개 환경변수, 표시 버전은 package.json을 참조한다.

// 공개 카카오 채널 주소. 권리회원 단톡방 초대 주소는 서버 전용 설정으로 분리한다.
// 미설정 시 채널 버튼은 안내 토스트만 표시한다.
export const KAKAO_CHANNEL_URL =
  (import.meta.env.VITE_KAKAO_CHANNEL_URL as string | undefined)?.trim() || "";

// Static JSON import keeps the displayed version aligned with the package.
export { version as APP_VERSION } from "../../../package.json";
