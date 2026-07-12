# Task 3 보고서: 환경별 카카오 연결 해제 모듈

## 구현 결과

- `REPLIT_DEPLOYMENT="1"`일 때만 프로덕션 어드민 키를 선택하고, 그 외에는 개발 어드민 키를 선택한다.
- 카카오 연결 해제는 서버에서만 form-urlencoded `POST /v1/user/unlink` 요청으로 수행한다.
- 성공 응답의 사용자 ID가 요청한 카카오 회원번호와 일치할 때만 성공한다.
- HTTP 400의 카카오 오류 코드 `-101`만 `already_unlinked`로 분류한다. 호출자는 이 종류만 정상 탈퇴와 동일하게 로컬 삭제를 계속할 수 있다.
- 네트워크, 일반 카카오 오류, 잘못된 응답, 응답 ID 불일치는 각각 안전한 `KakaoUnlinkError`로 구분한다. 오류에는 종류와 HTTP 상태만 보관하며 키, 카카오 회원번호, 원본 카카오 응답을 보관하거나 메시지에 포함하지 않는다.

## 검증

- 로컬 RED: 신규 모듈 부재로 지정 집중 테스트가 예상대로 실패했다.
- 로컬 GREEN: `npx tsx --test server/kakao-admin-config.test.ts server/kakao-unlink.test.ts`에서 8개 테스트가 통과했다.
- Replit 개발 워크스페이스에는 Task 1 관련 미커밋 변경이 있어, 해당 변경을 보존하면서 신규 모듈 파일만 임시 전송했다. Node 20에서 집중 테스트 8개, `npm run check`, `npm run build`가 모두 통과했고 임시 파일을 제거했다.

## 범위와 주의사항

- 이 작업은 연결 해제 모듈과 환경 설정만 제공한다. 실제 회원 탈퇴 API의 로컬 데이터 삭제 및 `already_unlinked` 처리 연결은 후속 Task 5 범위다.
- 어드민 키 값은 이 보고서와 저장소에 기록하지 않는다.
