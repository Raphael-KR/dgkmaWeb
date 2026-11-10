import { registerKakaoOAuthStartCases } from "./testing/kakao-oauth-start-cases";
import { registerKakaoMemberSessionCases } from "./testing/kakao-member-session-cases";
import { registerKakaoRegistrationCases } from "./testing/kakao-registration-cases";
import { registerKakaoRegistrationClaimCases } from "./testing/kakao-registration-claim-cases";
import { registerKakaoApprovalCases } from "./testing/kakao-approval-cases";

// 기존 테스트 등록 순서와 하나의 실행 격리 단위를 유지한다.
registerKakaoOAuthStartCases();
registerKakaoMemberSessionCases();
registerKakaoRegistrationCases();
registerKakaoRegistrationClaimCases();
registerKakaoApprovalCases();
