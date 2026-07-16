# Task 4 완료 보고서

## 결과

- 구현 커밋: `4f76365` (`Implement alumni sync preflight planner`)
- 리뷰 수정 커밋: `5c433d5` (`Address Task 4 review findings`)
- 브랜치: `codex/remaining-plan-hardening`
- 실제 Google Sheets 데이터 동기화와 Development/Production Database 접근은 수행하지 않았다.

## 변경 파일

- `server/alumni-sync-plan.ts`
  - 국내 휴대전화 정규화
  - 필수값, 빈 소스, source/DB 중복, snapshot 오류 차단
  - insert/update/unchanged/sourceOnly/databaseOnly 분류
  - DB-only 행 비삭제
  - 정규화 source 전체의 비식별 SHA-256 fingerprint
- `server/alumni-sync-plan.test.ts`
  - planner와 Google Sheets snapshot의 RED/GREEN focused 테스트 12개
- `server/google-sheets.ts`
  - 필수 헤더와 누락 행을 보존하는 구조화 snapshot
  - 설정/API 오류와 빈 소스를 조용한 빈 배열 성공으로 바꾸지 않는 strict reader
  - 기존 호출부용 배열 wrapper는 blocking issue가 있으면 안전한 예외 발생
  - 원문 명부 캐시 제거
- `shared/alumni-sync.ts`
  - PII 없는 `AlumniSyncReport`와 issue code 공유 계약

## TDD 및 검증

- RED 확인
  - planner 모듈/함수 부재
  - fingerprint 미발급
  - Sheets snapshot 함수와 strict reader 부재 및 원문 캐시 잔존
  - snapshot과 planner의 `MISSING_REQUIRED_VALUE` 이중 집계 (`count: 2`)
  - 정규화 기준 DB 중복의 `conflict` 미집계 (`0 !== 2`)
- GREEN 확인
  - `node_modules/.bin/tsx --test server/alumni-sync-plan.test.ts`
  - 결과: 12 tests, 12 pass, 0 fail
- 타입 검사
  - `npm run check`
  - 결과: exit 0
- 정적 확인
  - `git diff --check` 통과
  - 보고서에 이름, 전화번호, 주소, 메모 원문이 포함되지 않는 테스트 통과
  - planner에 delete 동작이 생성되지 않는 테스트 통과

## 우려 및 다음 작업

- `server/storage.ts`의 기존 즉시 동기화 경로는 Task 5 책임 범위다. Task 5에서 `fetchAlumniSnapshot()`과 planner를 사용해 preview/fingerprint 검증/원자 적용으로 교체해야 한다.
- `fetchAlumniData()`는 Task 5 전환 전 타입 호환 wrapper이며 blocking issue를 빈 배열로 숨기지 않고 `AlumniSourceReadError`를 던진다.
- 이번 검증은 가짜 Sheets client와 순수 데이터만 사용했다. 실제 Sheets 연결, 실제 데이터 apply, Production Database 접근은 의도적으로 제외했다.
- 전체 `npm test`와 build는 Task 4 요청 범위의 focused 테스트 및 `npm run check`와 별개이며 이번 최종 검증에는 포함하지 않았다.

## 리뷰 수정

### 수정 내용

- source와 DB에 duplicate group이 여러 개 있어도 issue count를 각 conflict row 전체 합계로 집계한다.
- `syncAlumniFromGoogleSheets()`가 strict reader 오류를 stats 성공으로 바꾸지 않고 route까지 다시 던진다.
- import되지 않는 `server/google-sheets-old.ts`를 삭제해 저장소에 남은 원문 명부 캐시를 제거했다.
- `server/privacy-logging.test.ts`의 보호 파일 목록을 현재 추적 파일에 맞췄다.
- `server/alumni-sync-plan.test.ts`의 캐시 검사는 `server/google-sheets*.ts` 전체를 검사한다.

### 리뷰 TDD 증거

- 여러 source/DB duplicate group RED: `report.conflict`는 8이지만 두 issue count가 각각 2로 축소됨.
- strict reader 전파 RED: storage가 오류를 삼켜 관리자 동기화 route가 HTTP 200을 반환함.
- repository cache RED: 강화된 정적 테스트가 `google-sheets-old.ts`의 `cachedAlumniData`를 검출함.
- 각 수정 후 해당 focused 테스트를 다시 실행해 GREEN을 확인했다.

### 리뷰 최종 검증

- `DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused node_modules/.bin/tsx --test server/alumni-sync-plan.test.ts server/route-security.test.ts server/privacy-logging.test.ts`
  - 결과: 25 tests, 25 pass, 0 fail
  - localhost port 1의 비실행용 URL은 모듈 초기화에만 사용했으며 DB query는 수행하지 않았다.
- `npm run check`: exit 0
- `git diff --check`: 통과
- runtime source에서 `google-sheets-old.ts` import/reference 없음 확인
- 실제 Google Sheets 호출, 실제 동기화, Development/Production Database 접근 없음

### 남은 범위

- 기존 즉시 동기화는 이제 외부 오류를 성공으로 숨기지 않지만 여전히 행 단위 legacy write 경로다. Task 5에서 snapshot/planner preview와 단일 transaction apply로 교체해야 한다.
