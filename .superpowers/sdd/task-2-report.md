# Task 2 보고서

## 최종 결과

- 상태: DONE
- 기준 HEAD: `0d48bd2 Handle Kakao callback outcomes`
- 커밋: `a61fdae Prevent duplicate alumni registrations`
- 소유 파일: `server/storage.ts`, `server/routes.ts`, `server/member-deduplication.test.ts`, `server/kakao-oauth-routes.test.ts`
- 보존: 사용자 파일 `KIKcd_B.20250701.txt`, `KIKcd_B.20250701.xlsx`와 기존 `.superpowers/sdd/task-1-report.md` 변경을 수정하거나 stage하지 않았다.

## 구현

- `IStorage.getUserByNormalizedPhone(phoneNumber)`를 추가했다. 카카오 `+82 10...`과 국내 `010...` 형식을 비교할 때만 숫자 기반 국내 형식으로 정규화하며 원본 저장값은 바꾸지 않는다.
- 이름은 비교할 때만 공백을 제거하고, PostgreSQL `alumni_database`에서 정규화 이름과 전화번호가 모두 일치하는 유일한 행만 자동가입 대상으로 사용한다.
- `IStorage.claimAlumniRecord(name, phoneNumber, userId)`를 추가했다. 트랜잭션에서 후보를 다시 확인하고 `matched_user_id IS NULL` 조건부 UPDATE를 수행해 한 동문 행을 두 계정이 동시에 점유하지 못하게 했다.
- 신규 가입은 `createUserWithAlumniClaim` 저장소 트랜잭션에서 동문 후보 재확인, 회원 INSERT, `matched_user_id IS NULL` 조건부 점유를 함께 수행한다. 점유 경합 시 예외로 트랜잭션 전체를 롤백해 연결되지 않은 신규 회원 행을 남기지 않는다.
- Kakao 로그인 식별 순서를 기존 Kakao ID, 이메일, 정규화 전화번호, PostgreSQL 동문 명부로 구성했다. 기존 전화번호 회원은 `409`, 이미 연결된 동문 행은 관리자 확인 `202`로 처리하고 새 회원 생성을 호출하지 않는다.
- 로그인 경로의 `googleSheetsService.findAlumniByPhoneAndName` 동적 import와 호출을 제거했다. 동문 원본 테이블, Google Sheets 동기화 서비스와 관리자 동기화 라우트는 유지했다.
- 현재 HEAD에는 브리프가 언급한 기존 `normalizePhoneForComparison` 구현이 없었고 Task 2 외 파일을 수정할 수 없으므로 `server/storage.ts`에 비교 유틸을 정의해 저장소와 라우트가 함께 사용하도록 했다.

## TDD

1. RED: 구현 전 `npx tsx --test server/member-deduplication.test.ts server/kakao-oauth-routes.test.ts`를 실행했다. 로그인 라우트의 Sheets 동적 import, 저장소 메서드 부재, 기존 전화번호·점유 동문·신규 동문 분기 부재로 실패했다. 로컬 OAuth 테스트 프로세스는 DB 환경변수 부재 오류도 함께 출력했다.
2. GREEN: `+82 10...`과 `010...`을 단순 숫자화하면 불일치하는 실패를 추가로 확인한 뒤 국내 형식 정규화를 보정했다.
3. Self-review RED: 회원 INSERT와 명부 점유가 분리된 동시성 틈을 검증하는 테스트를 추가해 2개 실패를 확인하고, 두 작업을 한 저장소 트랜잭션으로 통합했다.
4. 최종 집중 테스트: `npx tsx --test server/member-deduplication.test.ts server/kakao-oauth-routes.test.ts server/community-events-storage-contract.test.ts` 결과 20개 통과, 0개 실패다.

## Replit 검증

- 기본 Replit 워크스페이스에는 Task 1 미커밋 변경이 `server/routes.ts`와 `server/kakao-oauth-routes.test.ts`에 겹쳐 있어 덮어쓰지 않고 `/tmp/dgkma-task2-codex` 격리 복사본을 사용했다.
- 공유 `node_modules`에서 `korean-lunar-calendar@0.4.0`이 사라져 첫 전체 검증의 `npm run check`가 Task 1 파일에서 실패했다. 격리 복사본 안에 잠금 파일 버전의 패키지만 임시 설치하고 공유 워크스페이스는 변경하지 않았다.
- `npm run check`: 통과.
- `npm test`: 131개 통과, 0개 실패.
- `npm run build`: exit 0. 기존 Browserslist 데이터 갱신 안내가 출력됐다.
- 스키마 변경이 없어 `npm run db:push`는 실행하지 않았다.

## Self-review

- `git diff --check`와 staged diff 검사를 통과했다.
- Kakao authorize 구간에 Google Sheets import·호출이 없고 관리자 동기화 기능은 유지되는지 확인했다.
- 기존 전화번호와 이미 점유된 동문 행에서 회원 생성이 호출되지 않는 테스트, 유일한 미점유 행에서 회원 생성과 조건부 점유가 같은 트랜잭션으로 호출되는 테스트를 확인했다.
- `matched_user_id IS NULL`, 트랜잭션, 후보 유일성 제한이 `claimAlumniRecord` 본문에 함께 있는지 확인했다.
- 커밋에는 Task 2 네 파일만 포함했고 사용자 KIKcd 파일 둘은 미추적 상태로 보존했다.

## 우려사항

- 실제 카카오 계정을 사용한 개발 홈페이지 OAuth smoke check는 수행하지 않았다.

---

## Important 발견사항 수정 (2026-07-12)

### 상태

- 상태: DONE
- 기준 HEAD: `a61fdae Prevent duplicate alumni registrations`
- 수정 파일: `server/storage.ts`, `server/routes.ts`, `server/member-deduplication.test.ts`, `server/kakao-oauth-routes.test.ts`
- 보존: `KIKcd_B.20250701.txt`, `KIKcd_B.20250701.xlsx`, 기존 `.superpowers/sdd/task-1-report.md` dirty 변경은 수정하거나 stage하지 않았다.

### 구현 결과

- JavaScript `normalizePhoneForComparison`과 같은 `+82`/국내 `0` 의미를 갖는 PostgreSQL 비교 표현을 공용화했다. 기존 사용자 조회, `claimAlumniRecord`, `createUserWithAlumniClaim`의 트랜잭션 내부 명부 재조회에 같은 표현을 사용한다.
- `createUserWithAlumniClaim`이 정규화 전화번호의 `hashtextextended` 키로 `pg_advisory_xact_lock`을 먼저 획득한다. 잠금 뒤 같은 트랜잭션에서 기존 사용자를 재검사하고, 중복이 없을 때만 동문 조회와 회원 INSERT를 수행한다.
- 잠금 후 중복 사용자가 발견되면 `PhoneRegistrationConflictError`를 던져 트랜잭션을 롤백한다. Kakao 라우트는 이 오류만 안전한 기존 `409`/관리자 문의 응답으로 변환한다.
- INSERT에는 기존 `insertUser`를 그대로 전달하므로 원본 `phoneNumber` 저장값은 변경하지 않는다.

### 테스트와 검증

- RED: 전용 경합 오류 export가 없어 집중 테스트가 실패하는 것을 확인했다. 로컬 Mac은 DB 환경변수가 없어 저장소 테스트 프로세스가 별도로 실패했다.
- Replit 집중 테스트: `npx tsx --test server/member-deduplication.test.ts server/kakao-oauth-routes.test.ts server/community-events-storage-contract.test.ts` 결과 23개 통과, 0개 실패.
- Replit 개발 PostgreSQL 통합 검증: 명부 `+82 10...` 임시 행에 동일한 `010...` 전화번호 가입 두 건을 동시에 실행했다. 회원 생성 1건, `PhoneRegistrationConflictError` 1건, 명부 연결 1건을 확인했다. `finally` 정리 후 임시 `users`와 `alumni_database` 잔여 건수는 모두 0이었다.
- Replit 전체 테스트: `npm test` 결과 134개 통과, 0개 실패.
- Replit `npm run check`: exit 0.
- Replit `npm run build`: exit 0. 기존 Browserslist 데이터와 500 kB 초과 chunk 안내만 출력됐다.
- 첫 전체 테스트는 공유 `node_modules`의 `korean-lunar-calendar@0.4.0` 부재로 기존 birthday 테스트 로딩이 실패했다. Replit 패키지 방화벽이 전체 재설치를 차단해, 격리 복사본에 잠금 파일 버전 패키지만 추가한 뒤 전체 검증을 새로 통과시켰다. 공유 작업공간은 변경하지 않았다.

### Self-review

- `git diff --check`를 통과했다.
- 잠금, 사용자 재검사, INSERT 순서를 소스와 테스트에서 확인했다.
- 공용 SQL 정규화 표현이 기존 사용자와 두 트랜잭션 명부 조회에 모두 적용되는지 확인했다.
- 라우트는 전용 전화번호 경합 오류만 `409`로 처리하고 다른 오류는 기존 오류 처리기로 전달한다.
- 스키마 변경이 없어 `npm run db:push`는 실행하지 않았다.

### 남은 우려

- 실제 카카오 계정을 사용한 개발 홈페이지 OAuth smoke check는 수행하지 않았다.

---

## Important 2차 수정 (2026-07-12)

### 상태와 범위

- 상태: DONE
- 기준 HEAD: `0c032f6 Serialize alumni registration by phone`
- 수정 파일: `server/storage.ts`, `server/routes.ts`, `server/member-deduplication.test.ts`, `server/member-registration-concurrency.test.ts`, `server/kakao-oauth-routes.test.ts`
- 보존: `KIKcd_B.20250701.txt`, `KIKcd_B.20250701.xlsx`, 기존 `.superpowers/sdd/task-1-report.md` dirty 변경은 수정하거나 stage하지 않았다.

### 구현 결과

- `withPhoneRegistrationLock`을 공통 트랜잭션 경계로 추가했다. 모든 회원 생성 경로가 정규화 전화번호 advisory xact lock, 같은 트랜잭션의 기존 사용자 재검사, INSERT 순서를 공유한다.
- 일반 `createUser`, 동문 명부 점유를 포함한 `createUserWithAlumniClaim`, 관리자 pending 승인 회원 생성에 공통 경계를 적용했다. INSERT에는 입력받은 원본 전화번호를 그대로 저장한다.
- pending 승인은 대상 행을 `FOR UPDATE`로 잠근 뒤 회원 생성과 상태 변경을 하나의 트랜잭션에서 수행한다. 중복 전화번호이면 `PhoneRegistrationConflictError`로 전체 롤백되어 회원과 승인 상태가 모두 바뀌지 않는다.
- 관리자 승인 라우트에서 별도 `createUser` 호출을 제거했다. 전화번호 경합은 안전한 `409`와 승인 상태 미변경 안내로 반환한다.

### 테스트와 검증

- RED: 기존 구현으로 Replit 개발 DB 동시 생성 테스트를 실행했을 때 두 요청이 모두 성공했고, 관리자 승인 라우트가 별도 `storage.createUser`를 호출하는 계약 테스트도 실패했다.
- Replit 집중 테스트: `npx tsx --test server/member-deduplication.test.ts server/member-registration-concurrency.test.ts server/kakao-oauth-routes.test.ts server/community-events-storage-contract.test.ts` 결과 27개 통과, 0개 실패다.
- 실제 PostgreSQL 통합 테스트는 `current_database() = 'heliumdb'`를 먼저 확인한다. 고유 가상 전화번호와 이메일로 두 트랜잭션을 동시에 실행해 회원 1건 성공, `PhoneRegistrationConflictError` 1건, 최종 회원 1건을 확인했다.
- 같은 통합 테스트에서 중복 회원이 있는 pending 승인을 시도해 오류 후 상태가 `pending`으로 유지되는 것을 확인했다. `finally`에서 관련 `alumni_database`, `pending_registrations`, `users`를 정리하고 세 테이블 잔여 0건을 assert했다.
- `REPLIT_DEPLOYMENT=1 npx tsx --test server/member-registration-concurrency.test.ts`: 운영 차단 skip 1건을 확인했다.
- Replit 전체 테스트: `npm test` 결과 138개 통과, 0개 실패다.
- Replit `npm run check`: exit 0.
- Replit `npm run build`: exit 0. 기존 Browserslist 데이터 갱신 안내와 500 kB 초과 chunk 안내만 출력됐다.
- 스키마 변경이 없어 `npm run db:push`는 실행하지 않았다.

### Self-review

- `users` INSERT 세 곳이 모두 공통 전화번호 잠금 경계를 통과하는지 확인했다.
- pending 상태 UPDATE가 회원 INSERT 뒤 같은 트랜잭션 안에서 실행되고, 경합 오류가 라우트의 전용 `409` 처리 외에는 삼켜지지 않는지 확인했다.
- 실제 통합 테스트가 운영 환경에서 DB 모듈을 import하기 전에 skip하며, 개발 DB 이름 불일치 시 쓰기를 시작하기 전에 거부하는지 확인했다.
- `git diff --check`를 통과했고 Task 1 report와 KIKcd 파일은 변경하거나 stage하지 않았다.

### 남은 우려

- 실제 카카오 계정과 브라우저를 사용한 개발 홈페이지 OAuth smoke check는 수행하지 않았다.
