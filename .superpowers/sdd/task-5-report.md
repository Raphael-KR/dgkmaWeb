# Task 5 보고서: 본인 탈퇴 API와 확인 화면

## 구현 결과

- `DELETE /api/users/me`는 로그인 세션의 `userId`만 탈퇴 대상으로 사용하고, 요청 본문의 `confirmation`이 정확히 `탈퇴`일 때만 진행한다.
- 카카오 ID가 있으면 환경별 어드민 키로 연결 해제를 먼저 수행한다. 정상 응답 또는 `already_unlinked`일 때만 로컬 회원 삭제를 진행하며, 다른 `KakaoUnlinkError`와 설정 오류에서는 로컬 삭제를 차단한다.
- 카카오 ID가 없는 회원은 외부 연결 해제를 건너뛰고 로컬 삭제를 허용한다.
- 로컬 삭제가 끝난 뒤 세션을 destroy하고 `connect.sid` 쿠키를 제거한다. 응답과 로그에는 카카오 원문, 키, 회원번호, DB 오류 내용을 노출하지 않는다.
- 설정 모달의 `회원 탈퇴` 진입점은 설정을 닫고 별도 `AlertDialog`를 연다. 사용자가 `탈퇴`를 정확히 입력해야 파괴적 버튼이 활성화된다.
- 실패 시 안전한 서버 메시지를 toast로 표시하고 대화상자를 유지한다. 성공 시 `ClientUser` 상태를 `null`로 만들고 React Query 캐시 전체를 비운 뒤 홈으로 이동한다.

## TDD 및 보완 테스트

- RED: 구현 전에 집중 테스트를 실행해 API가 모두 404를 반환하고 탈퇴 대화상자 파일이 없어 실패하는 것을 확인했다.
- GREEN: 로컬 집중 테스트에서 본인 세션 고정, exact 확인문구, unlink 실패 시 삭제 차단, `already_unlinked`, 카카오 ID 없음, 설정 오류, 로컬 삭제 실패, 세션 destroy와 쿠키 제거를 포함한 22개 테스트가 통과했다.
- Task 3 리뷰 minor를 함께 보완해 운영 어드민 키 누락 시 `KAKAO_PROD_ADMIN_KEY`만 보고하는 테스트와 비 JSON·ID 누락 응답의 `invalid_response` 테스트를 추가했다.

## Replit 검증

- 공유 Replit workspace는 기존 미커밋 변경이 `server/routes.ts`, `profile.tsx`, UI 계약 테스트와 겹쳐 직접 수정하지 않았다.
- 현재 로컬 `HEAD`와 Task 5 지정 파일만 `/tmp/dgkma-task5-codex`에 구성해 검증했다. 공유 workspace와 Development Database의 기존 데이터는 변경하지 않았다.
- Replit 집중 테스트: 22개 통과, 0개 실패.
- Replit `npm test`: 160개 통과, 0개 실패. Development Database를 사용하는 기존 통합 테스트도 통과했다.
- Replit `npm run check`: exit 0.
- Replit `npm run build`: exit 0. 기존 500 kB 초과 chunk 안내만 출력됐다.
- `npm ci`는 Replit 패키지 방화벽이 기존 `shell-quote@1.8.3`을 차단해 실패했다. 격리 복사본에 공유 workspace의 설치 의존성을 복사하고 잠금 파일에 있는 `korean-lunar-calendar@0.4.0`만 격리 위치에 보충해 검증했다.
- 로컬 `npm run check`는 로컬 `node_modules`에 `korean-lunar-calendar`가 없어 실패했으며, 기준 환경인 Replit check로 대체 확인했다.

## Self-review

- 요청 body의 사용자 ID가 무시되고 모든 조회·삭제가 세션 사용자로 고정되는지 확인했다.
- 외부 연결 해제 성공 또는 `already_unlinked` 외에는 `deleteUserAccount`가 호출되지 않는지 확인했다.
- 로컬 삭제 실패 전에는 세션 destroy와 쿠키 제거가 실행되지 않는지 확인했다.
- 설정 모달과 탈퇴 AlertDialog의 open 상태가 동시에 true가 되지 않고, 실패 시 액션의 기본 닫힘이 방지되는지 확인했다.
- 성공 후 사용자 상태와 캐시가 모두 정리되고, 오류 원문·비밀·개인정보가 응답이나 로그에 포함되지 않는지 확인했다.
- `git diff --check`를 통과했고 사용자 소유 `task-1-report.md`와 `KIKcd_*` 파일을 수정·stage하지 않았다.

## 최종 리뷰 목록 및 우려

- Task 4 리뷰 minor인 트랜잭션 중간 실패 rollback과 비대상 관계 보존의 명시적 테스트 공백은 이번 범위를 넓히지 않고 최종 리뷰 항목으로 남긴다. Task 4의 실제 Development Database 통합 테스트는 통과했다.
- 공유 Replit 개발 앱에는 이번 변경을 적용하지 않았으므로 브라우저 smoke check와 실제 카카오 어드민 키를 이용한 end-to-end 탈퇴는 수행하지 않았다. 배포·Republish도 이번 Task 범위가 아니다.
- Replit 패키지 방화벽의 `shell-quote@1.8.3` 차단은 저장소 기존 의존성 문제로 별도 정리가 필요하다.
