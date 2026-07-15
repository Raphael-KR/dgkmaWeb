# Task 5 구현 보고

## 범위

- `POST /api/admin/sync-alumni/preview`에서 Google Sheets source와 Development DB snapshot을 planner에 전달하고 비식별 report와 fingerprint만 반환한다.
- `POST /api/admin/sync-alumni`는 `{ fingerprint }`를 필수로 받고 source를 다시 읽은 뒤 차단 오류와 fingerprint를 검증한다.
- 실제 insert/update는 PostgreSQL advisory lock을 먼저 얻은 하나의 transaction에서만 수행한다.
- 관리자 화면은 `변경 미리보기`와 `변경 적용`의 두 단계로 동작하며 진행률 polling과 근거 없는 통계·반영 문구를 표시하지 않는다.

## RED

- 로컬 UI/storage 계약: 기존 화면에 preview 요청이 없고 polling 상태가 남아 있으며 storage preview/apply 메서드가 없어 3건 실패, DB fixture 1건 skip을 확인했다.
- Replit route/storage/auth: storage 오류 class·메서드와 preview route가 없어 4건 실패를 확인했다.
- 추가 요청인 가짜 통계 제거는 `1,247`, `856`, `42,800,000` 부재 계약을 먼저 추가해 1건 실패를 확인했다.

## GREEN

- `server/storage.ts`
  - 기존 행별 autocommit insert-only 구현을 제거했다.
  - preview는 source와 DB를 읽어 Task 4 `planAlumniSync` report만 반환하고 DB를 쓰지 않는다.
  - apply는 source 재조회 후 `pg_try_advisory_xact_lock`을 먼저 실행하는 단일 transaction에서 plan을 다시 만들고 insert/update한다.
  - blocked plan, fingerprint 불일치, 동시 apply를 구분해 거부한다.
  - update는 Sheets 관리 필드만 설정해 `isMatched`, `matchedUserId`를 보존하고 `databaseOnly` 삭제는 수행하지 않는다.
- `server/routes.ts`
  - preview와 fingerprint 필수 apply API를 구현했다.
  - stale source와 동시 apply는 `409`, blocked plan은 `422`, 잘못된 body는 `400`으로 응답한다.
  - 응답과 로그에는 오류 원문이나 명부 개인정보를 포함하지 않는다.
  - 기존 관리자 route 수와 anonymous/member auth matrix에 preview endpoint를 포함했다.
- `client/src/pages/admin.tsx`
  - 브라우저에는 비식별 report와 fingerprint만 보관한다.
  - 차단 오류가 없고 insert/update가 있을 때만 적용 버튼을 활성화한다.
  - 적용 성공·실패 후 preview를 폐기하고 성공 시 Sheets 연결 상태와 명부 query를 갱신한다.
  - 진행률 polling, 응답 원문 logging, 실제 근거 없는 반영 문구를 제거했다.
  - 통계 탭의 하드코딩 숫자를 제거하고 `통계 집계 준비 중`으로 바꿨다.

## Development DB fixture

- 실행 전 `REPL_ID=dc5e5541-525b-4ad6-b914-2d2db70cb4a9`, `PGHOST=helium`, `PGDATABASE=heliumdb`, 비운영 환경을 모두 확인한다.
- Google Sheets reader는 fixture snapshot으로 mock했다. 실제 Sheets apply는 실행하지 않았다.
- matched 기존 행, databaseOnly 행, 신규 행과 fixture 전용 실패 trigger를 사용해 다음을 검증했다.
  - preview no-write
  - stale fingerprint, blocked plan, advisory lock 거부
  - insert/update와 매칭 필드 보존
  - databaseOnly 보존
  - 두 번째 변경 실패 시 첫 번째 변경까지 전체 rollback
- `finally`에서 trigger, function, 명부 행, 사용자를 transaction으로 정리했다.
- 새 연결 최종 잔여: alumni 0, users 0, trigger 0, function 0.
- Production DB에는 접근하지 않았다.

## 검증

- 로컬: UI 계약 3/3, storage 정적 계약 1/1, `npm run check`, `git diff --check` 통과.
- Replit Development 환경 최종 focused suite: 32/32 통과.
  - Task 4 planner와 strict source reader 회귀
  - Task 5 route/storage/helium fixture/UI 계약
  - 관리자 route count/auth와 기존 route 보안 회귀
- Replit: `npm run check` 통과.
- Replit: `npm run build` 통과. 기존 Browserslist 갱신 및 500 kB 초과 chunk 경고만 남았다.
- Replit Git 임시 clone: `git diff --check` 통과.
- 첫 최종 묶음 실행은 Replit `main` clone에 삭제 전 `server/google-sheets-old.ts`가 남아 Task 4 캐시 부재 검사 1건이 실패했다. 로컬 branch의 삭제 상태와 맞춘 뒤 전체 명령을 처음부터 재실행해 32/32를 확인했다.

## 커밋

- `ab22b01` Implement atomic alumni sync API
- `87659b5` Add alumni sync preview workflow

## 우려와 남은 확인

- 기존 관리자 전용 `/api/admin/sync-progress` endpoint는 auth matrix 호환을 위해 유지했지만 새 UI는 호출하지 않는다.
- branch를 Replit development workspace에 배포하거나 Production Republish하지 않았으므로 로그인된 관리자 화면의 실제 브라우저 smoke check는 수행하지 않았다.
- 실제 Google Sheets apply와 Production DB 검증은 Task 5 금지 범위에 따라 수행하지 않았다.
