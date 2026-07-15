# Task 3 구현 보고서

## 결과

- 기본 경조사 reader adapter가 `readEventSources(input, undefined, signal)`로 호출되도록 수정했다.
- 네 경조사 유형(`obituary`, `wedding`, `opening`, `other`)의 초안 생성, 게시, 유형별 목록 필터를 매개변수 route 테스트로 고정했다.
- 공개된 목록과 상세 응답에서 `sourceText` 및 unsafe `details.sourceUrl`이 제거되는지 확인했다.
- 성공한 부고 링크 분석의 source 정보와 빈 `missingFields`, 불완전한 부고의 필수 누락 필드를 route 테스트로 확인했다.
- Development Database 일회용 fixture로 초안 소유권, 유형별 초안 재사용, 게시 재시도 idempotency를 확인하고 잔여 데이터를 정리했다.

## RED / GREEN

### RED

Replit 임시 복사본에서 다음 회귀 테스트를 먼저 실행했다.

```text
npx tsx --test --test-name-pattern="reader third argument" server/community-events-parse-route.test.ts
```

현재 구현은 reader의 두 번째 인자로 `AbortSignal`을 전달하고 세 번째 인자를 비워 테스트가 실패했다. 실패 메시지는 두 번째 인자의 actual 값이 `AbortSignal`, expected 값이 `undefined`임을 확인했다.

### GREEN

`RouteDependencies.readEventSources`의 기존 `(input, signal?)` 계약을 유지하고, 기본 reader adapter만 두 번째 인자에 `undefined`, 세 번째 인자에 요청 `AbortSignal`을 전달하도록 수정했다. 이후 parse-route 테스트 전체와 최종 focused 검증이 통과했다.

추가 행렬·응답 정제·DB 테스트는 기존의 올바른 storage 및 sanitization 동작을 회귀 계약으로 확장했으며 별도의 production 동작 변경은 필요하지 않았다.

## 변경 파일

- `server/routes.ts`
- `server/community-events-parse-route.test.ts`
- `server/community-events-routes.test.ts`
- `server/community-events-development-db.test.ts`
- `.superpowers/sdd/task-3-report.md`

## 검증

Replit의 `/tmp/dgkma-task3.9nf7Ps` 임시 복사본에서 Development 환경 의존성을 사용했다.

```text
npx tsx --test server/community-events-parse-route.test.ts server/community-events-routes.test.ts server/community-events-development-db.test.ts
```

- 23 tests, 23 pass, 0 fail, 0 skip
- DB 통합 테스트는 쓰기 전에 `current_database() = heliumdb`를 확인했다.
- fixture 정리 후 대상 `users`와 `community_events` 잔여 건수는 모두 0이었다.

```text
npm run check
```

- `tsc` exit 0
- `git diff --check` exit 0

로컬 focused 테스트는 로컬 `node_modules`에 `cheerio`가 없어 모듈 로딩 단계에서 실행할 수 없었다. 프로젝트 지침에 따라 Replit 임시 복사본에서 같은 worktree 파일을 검증했다.

## 커밋

- 구현: `c2361a1` (`Harden community event route regressions`)
- 브랜치: `codex/remaining-plan-hardening`

## 우려 및 범위

- Production Database에는 접근하지 않았다.
- 스키마 변경과 `npm run db:push`는 수행하지 않았다.
- 다른 작업자가 생성한 `server/alumni-sync-plan.ts`, `server/alumni-sync-plan.test.ts`, `shared/alumni-sync.ts`는 Task 3 범위 밖이므로 수정하거나 스테이징하지 않았다.
- 실제 공개 사이트별 파싱 정확도, 모바일 UI, 클립보드, 실제 회원 간 소유권 QA는 설계 문서대로 통합 QA 범위에 남는다.

## 코드 리뷰 수정

`task-3-review.md`의 Important 3건과 Minor 2건을 모두 반영했다.

- `RouteDependencies.readEventSources`를 `(input, signal?)`로 복구했다. 주입 reader는 두 인자로 호출하고, `createDefaultEventSourceReader`만 raw reader를 `(input, undefined, signal)`로 호출한다.
- 기본 adapter 테스트는 raw reader 세 번째 인자의 signal을, route 테스트는 주입 reader 두 번째 인자의 signal과 인자 수 2개를 각각 검증한다.
- DB 테스트는 `REPL_ID=dc5e5541-525b-4ad6-b914-2d2db70cb4a9`, `PGHOST=helium`, `PGDATABASE=heliumdb`, 완전한 `PG*`, 비운영 플래그를 모두 요구한다. `DATABASE_URL`과 `PROD_DATABASE_URL`은 연결에 사용하지 않는다.
- DB 테스트 전용 `Pool`을 명시적 `PG*` 설정으로 만들고 대상 검증 실패를 포함한 모든 경로에서 `pool.end()`를 실행한다. fixture 정리는 `pool.connect()`로 얻은 전용 client 하나에서 `BEGIN`부터 `COMMIT` 또는 `ROLLBACK`까지 수행하며 `client.release()`를 보장한다. application global pool은 종료하지 않는다.
- 네 유형 기대값은 production 상수와 독립된 `obituary`, `wedding`, `opening`, `other` 고정 배열로 두고 production 상수와도 직접 비교한다.
- 공개 목록과 상세에서 unsafe `details.sourceUrl` 제거뿐 아니라 안전하고 `sourceUrls`에 포함된 URL의 canonical 보존도 확인한다.

### 리뷰 RED / GREEN

- RED: 기본 adapter factory가 없어 `typeof createDefaultEventSourceReader`가 `undefined`로 실패했다.
- RED: 기존 구현이 주입 reader를 `(input, undefined, signal)`로 호출해 두 번째 인자가 `AbortSignal`이 아닌 값으로 실패했다.
- GREEN: 기본 adapter와 주입 계약을 분리한 뒤 parse-route 13개가 통과했다.
- GREEN: 강화된 Development DB fixture, 고정 네 유형 행렬, safe URL positive assertion을 포함한 focused 검증이 통과했다.

### 리뷰 재검증

공유 브랜치의 Task 4 커밋 `109ffd0`까지 포함한 현재 HEAD를 Replit 임시 저장소 `/tmp/dgkma-task3-final.ZPXE2i`에 복사하고 Task 3 수정만 덮어써 검증했다.

```text
npx tsx --test server/community-events-parse-route.test.ts server/community-events-routes.test.ts server/community-events-development-db.test.ts
```

- 24 tests, 24 pass, 0 fail, 0 skip
- `npm run check`: `tsc` exit 0
- Replit 임시 저장소 `git diff --check`: exit 0
- `PGHOST` 제거 환경: DB 테스트 skip, URL fallback 연결 없음
- `REPLIT_DEPLOYMENT=1` 환경: DB 테스트 skip, 운영 연결 없음
- 최종 Development DB 직접 집계: `heliumdb`, Task 3 fixture `users=0`, `community_events=0`

### 리뷰 수정 커밋

- `4ee92e8` (`Address Task 3 review findings`)
