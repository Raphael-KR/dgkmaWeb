# 잔여 개발 보강 구현 계획

**Goal:** 통합 QA 전에 개발 인증, 경조사 파싱, 관리자 권한과 명부 동기화의 자동화 가능한 보안·무결성 공백을 제거한다.

**Architecture:** 인증 우회는 삭제하고 테스트는 주입 경계만 사용한다. 경조사 reader 의존성은 signal을 명시적으로 받는 adapter로 고정한다. 명부 동기화는 순수 preflight planner와 PostgreSQL transaction executor를 분리해 dry-run과 apply가 같은 계획을 사용하게 한다.

**Global Constraints:** 운영 DB와 실제 Google Sheets 데이터는 변경하지 않는다. `KIKcd_B.20250701.*` 파일은 수정·추적하지 않는다. 사용자 검증은 통합 QA로 누적한다. Replit에서 전체 테스트·타입 검사·빌드를 통과해야 한다.

### Task 1: 기준선 문서 계약 복구

**Files:** `planning_proposal.md`, `server/final-recheck-documentation-contract.test.ts`

1. 현재 문서 계약 테스트의 실패를 재현한다.
2. 계획서 기준일과 `community_events` 17개 컬럼 확인 문구를 실제 상태에 맞춘다.
3. 집중 문서 테스트를 통과시킨다.

### Task 2: 개발 디버그 로그인 제거와 관리자 오류 경계

**Files:** `server/routes.ts`, `client/src/hooks/use-auth.tsx`, `server/route-security.test.ts`, `server/privacy-logging.test.ts`, 관련 관리자 route 테스트

1. `/api/debug/login`과 `debug_login=true`가 더 이상 존재하지 않는 실패 테스트를 추가한다.
2. 모든 관리자 endpoint의 `401/403` 행렬과 결제 생성 storage 미호출을 실행 테스트로 추가한다.
3. sync·Sheets 연결 오류 응답에 원문 예외가 포함되지 않는 테스트를 추가한다.
4. 디버그 로그인 코드와 클라이언트 우회를 제거하고 안전한 오류 응답을 구현한다.
5. 집중 테스트와 타입 검사를 통과시킨다.

### Task 3: 경조사 중단 신호와 응답 회귀 보강

**Files:** `server/routes.ts`, `server/community-events-parse-route.test.ts`, `server/community-events-routes.test.ts`, 새 Development Database 통합 테스트

1. 기본 reader가 `AbortSignal`을 세 번째 인자로 받는 회귀 테스트를 실패시킨다.
2. route dependency adapter로 signal 전달을 고정한다.
3. 네 유형 초안·게시·목록 필터 행렬과 successful obituary source/missing fields를 매개변수 테스트로 추가한다.
4. published 목록·상세에서 `sourceText`와 unsafe `details.sourceUrl`이 제거되는 route 테스트를 추가한다.
5. 일회용 DB fixture로 초안 소유권·재사용·publish idempotency를 검증하고 정리한다.

### Task 4: 명부 동기화 preflight와 dry-run

**Files:** 새 `server/alumni-sync-plan.ts`, 새 `server/alumni-sync-plan.test.ts`, `server/google-sheets.ts`, `shared/schema.ts` 또는 별도 공유 계약

1. 전화번호 정규화, 중복·필수값 오류, insert/update/unchanged/databaseOnly 분류의 실패 테스트를 작성한다.
2. 개인정보 없는 `AlumniSyncReport`와 source fingerprint를 생성하는 순수 planner를 구현한다.
3. Google Sheets 서비스가 빈 소스·잘못된 헤더·누락 행을 성공으로 바꾸지 않고 구조화된 snapshot을 반환하게 한다.
4. 원문 명부 캐시를 제거하고 테스트를 통과시킨다.

### Task 5: 원자 적용과 관리자 미리보기 UI

**Files:** `server/storage.ts`, `server/routes.ts`, `client/src/pages/admin.tsx`, 관련 route/storage/UI 계약 테스트

1. dry-run은 DB를 변경하지 않고 apply는 fingerprint 불일치·차단 오류·동시 실행을 거부하는 실패 테스트를 작성한다.
2. advisory lock과 하나의 DB transaction에서 insert/update를 실행하고 매칭 필드는 보존한다.
3. `/api/admin/sync-alumni/preview`와 fingerprint 필수 apply 계약을 구현한다.
4. 관리자 화면을 `변경 미리보기` 후 `변경 적용`의 두 단계로 바꾸고 가짜 통계 숫자를 제거한다.
5. 오류 응답과 로그에 개인정보가 없는지 검사한다.

### Task 6: 전체 검증과 문서화

**Files:** `planning_proposal.md`, `walkthrough.md`, `CHANGELOG.md`, `docs/database-operations.md` 필요 범위

1. Replit에서 집중 테스트와 전체 `npm test`, `npm run check`, `npm run build`, `git diff --check`를 실행한다.
2. Development Database fixture가 모두 정리됐는지 확인한다.
3. 구현 완료와 통합 QA 잔여 항목을 기준 문서에 반영한다.
4. 코드 리뷰를 거쳐 커밋·푸시하고 Replit `main`을 정렬한다.
