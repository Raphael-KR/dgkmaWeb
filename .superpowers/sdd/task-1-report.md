# Task 1 보고서

## 최종 결과

- 상태: DONE
- 기준: `1d26e0e Keep Kakao login data server owned` 이후 리뷰 수정까지 반영했다.
- 작업 범위: 서버 소유 Kakao 로그인, `ClientUser` 허용 목록 직렬화, 양력·음력·윤달 생일 MVP, 공개 동의 안내와 이번 콜백 회귀 수정을 포함한다.
- 생일: `birthday`, `birthdayType`, `isLeapMonth`는 허용된 클라이언트 회원 필드이며, 내 정보 표시와 생일 당일 본인 전용 홈 배너에 사용한다.
- 보존: `KIKcd_B.20250701.txt`, `KIKcd_B.20250701.xlsx`는 수정·stage·커밋하지 않았다.

## 구현

- Kakao authorize scope를 `name,profile_image,account_email,phone_number`로 제한했다.
- authorize 응답, `/api/auth/kakao` 입력과 가입·보류가입·승인 저장 경로에서 액세스 토큰과 생일 관련 필드를 제거했다.
- 프로필 갱신 스키마는 활동 지역과 카카오 알림 설정만 허용하고, 프로필 편집 화면은 활동 지역만 수정하도록 축소했다.
- 로그인, 개인정보 처리방침, 이용약관의 수집 범위와 시행일을 갱신했으며, 프로필 사진과 이름 첫 글자 fallback avatar를 적용했다.

## TDD 및 검증

1. RED: Replit에서 `npx tsx --test server/kakao-oauth-config.test.ts server/kakao-consent-ui-contract.test.ts`를 실행했다. 기존 `birthday` scope와 로그인 안내 누락으로 2개 실패를 확인했다.
2. GREEN: Replit에서 `npx tsx --test server/kakao-oauth-config.test.ts server/kakao-oauth-routes.test.ts server/kakao-consent-ui-contract.test.ts`를 최종 재실행했다. 12개 통과, 0개 실패다.
3. Replit에서 `npm run check`와 `npm run build`를 최종 실행했다. 모두 성공했다.
4. Self-review: staged diff, `git diff --check`, OAuth 응답·저장 경로, 공개 문구 금지어, 시행일, avatar fallback, stage 목록을 점검했다.

## 우려사항

- 빌드는 기존 500 kB 초과 번들 크기 경고와 Browserslist 데이터 갱신 권고를 출력했지만 실패는 없었다.

## 리뷰 반려 수정 (2026-07-12)

### 구현

- `/api/auth/kakao/authorize`가 토큰 교환, 카카오 회원정보 조회, 회원 확인·생성·갱신, 생일 동의 철회 반영, 세션 저장까지 한 요청에서 완료하도록 변경하고 `/api/auth/kakao` PII 왕복 라우트를 제거했다.
- 토큰 교환·회원정보 조회 실패 응답과 로그에서 카카오 원문, 토큰, 키 prefix를 제거했다.
- `toClientUser` 허용 목록을 모든 본인 회원 응답에 적용해 `kakaoId`, `updatedAt` 등 화면 비사용 DB 필드를 제외하고 생일 MVP 필드는 포함했다.
- `birthday` scope와 `korean-lunar-calendar` 기반 한국시간 양력·음력·윤달 판정을 추가했다. 내 정보에 생일 유형을 표시하고 생일 당일 홈에 본인 전용 축하 배너를 표시한다.
- 클라이언트의 카카오 PII payload 타입과 콜백 재전송을 제거했다. 로그인·개인정보 처리방침·약관의 필수/선택 항목, 내부 연결 식별자, 생일 사용 목적, 탈퇴 후 처리 문구를 승인된 설계와 맞췄다.

### TDD 및 검증

1. RED: Replit 격리 복사본에서 집중 테스트를 실행해 새 모듈 부재, 서버 소유 로그인 미구현, 원문 오류 응답, 생일 scope/UI 누락 등 7개 실패를 확인했다.
2. GREEN: `npx tsx --test server/kakao-oauth-config.test.ts server/kakao-oauth-routes.test.ts server/client-user.test.ts server/birthday.test.ts server/kakao-consent-ui-contract.test.ts` 결과 18개 통과, 0개 실패.
3. Replit 격리 복사본에서 `npm test` 결과 123개 통과, 0개 실패.
4. Replit 격리 복사본에서 `npm run check`와 `npm run build`를 실행해 모두 exit 0을 확인했다.
5. Self-review: `git diff --check`, Task 1 파일 목록, 모든 회원 응답의 `toClientUser` 적용, 제거 대상 라우트·PII DTO·원문 오류·키 로그 문자열, 보호 대상 KIK 파일 미추적 상태를 확인했다.

### 우려사항

- 실제 카카오 계정을 사용한 OAuth smoke check는 수행하지 않았다.
- 빌드는 기존 500 kB 초과 번들 크기 경고와 Browserslist 데이터 갱신 권고를 출력했지만 실패는 없었다.

## 최종 리뷰 수정 (2026-07-12)

### 구현

- `login()`의 반환값을 `success`, `requiresApproval`, `failure` 판별 유니온으로 명시했다. 성공은 기존 활동 지역 분기를 따르고, 승인 대기와 실패는 `login()`의 toast 후 콜백에서 모두 `/login`으로 이동한다.
- AuthContext와 프로필 편집·설정 컴포넌트의 사용자 타입을 DB 전체 `User`가 아닌 `ClientUser`로 정합화했다.
- 소스 계약 테스트가 세 로그인 결과의 콜백 분기와 `ClientUser` 사용을 고정해, 실패 또는 승인 대기에서 로딩 화면에 남는 회귀를 막는다.

### 테스트 및 검증

1. RED: 로컬에서 `npx tsx --test server/kakao-consent-ui-contract.test.ts`를 실행해 기존 `User` 타입과 결과 분기 누락으로 1개 실패를 확인했다.
2. GREEN: 같은 소스 계약 테스트는 2개 통과, 0개 실패다.
3. Replit 격리 복사본에서 `npx tsx --test server/kakao-oauth-config.test.ts server/kakao-oauth-routes.test.ts server/client-user.test.ts server/birthday.test.ts server/kakao-consent-ui-contract.test.ts` 결과 19개 통과, 0개 실패다.
4. 같은 Replit 격리 복사본에서 `npm run check`와 `npm run build`를 실행해 모두 exit 0을 확인했다.
5. Self-review: 변경 범위, 판별 유니온의 모든 콜백 분기, `ClientUser` 경계, `git diff --check`, 보호 대상 KIK 파일의 미추적 상태를 확인했다.

### 우려사항

- Replit 기본 워크스페이스에 별도 변경이 있어 격리 복사본에서 검증했다. 해당 복사본의 `npm ci`는 기존 전이 의존성 `shell-quote@1.8.3` 보안 정책 차단(403)으로 실패하여, 원본 워크스페이스의 기존 의존성과 잠금 파일에 고정된 `korean-lunar-calendar@0.4.0`만 사용해 검증했다.
