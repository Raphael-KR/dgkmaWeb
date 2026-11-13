# 검사 카탈로그

검사별 목적·선택 조건·명령·환경·부수 효과와 결과 재사용 기준의 정본이다. 릴리스 단계·실행 권한은 [replit.md](../../replit.md#최종-후보-검사), 개발 직후 정적 검사 범위는 [개발 안내](development.md)를 따른다. 이 목록은 전체 실행 순서나 QA 대기표가 아니다.

## 선택 방법

1. 마지막 실제 배포와 후보의 변경을 비교하고 공용 계약·소비자·동적 주입까지 영향 범위를 확인한다. 개발 작업은 해당 변경 범위를 사용한다.
2. 공통 필수 검사에서 적용 항목을 정하고, 영향받은 동작을 보호하는 선택 검사를 더한다. 선택 조건이 맞으면 필요한 검사다. 관련 없는 파일까지 같은 묶음이라는 이유로 실행하지 않는다.
3. 공통 인증·저장 계약·의존성 등 영향이 넓거나 좁힐 근거가 부족하면 관련 영역에서 일반 회귀 전체로 확대한다. 실패한 검사를 피하려고 범위를 축소하지 않는다.
4. 실행 전 선택한 파일의 import·fixture·환경 접근을 읽고 실제 부수 효과와 승인을 확인한다. DB·외부 API·브라우저·실계정 검사는 일반 테스트 선택만으로 승인되지 않는다. 기존 합성 자료 사용과 신규 합성 자료·시험 DB 생성도 구분한다.
5. 선택 이유와 실행/재사용 결과, 관련 있지만 확인하지 못한 경로를 기존 작업·릴리스 기록에 남긴다. 카탈로그의 파일 수를 통과 조건으로 사용하지 않는다.

기존 테스트의 현재 목록은 `node scripts/run-tests.mjs --list`로 파일만 읽어 확인한다. 검사 추가·삭제나 명령·적용 조건 변경 시 해당 카탈로그 항목을 함께 갱신한다. 기존 검사가 없는 기능은 인접 검사의 성공으로 검증됐다고 보고하지 않는다.

## 공통 필수 검사

코드가 실제 배포되는 후보에 적용한다. 변경 파일이 없는 항목은 해당 없음의 근거를 남긴다. 앱 산출물이 바뀌지 않는 문서·스킬 변경에는 문서 확인과 관련 스킬 형식 검사만 선택하며 앱 테스트·빌드를 추가하지 않는다. 개발 도구만 바뀌면 그 도구의 정적 검사를 선택한다.

별도 표기가 없으면 Replit 개발 워크스페이스 루트에서 설치된 lockfile의 도구를 사용한다. `--fix`·`--write`·의존성 설치는 읽기 전용 검사 명령에 포함하지 않는다.

| 검사 | 목적·실행 조건 | 명령 | 환경·부수 효과 |
|---|---|---|---|
| 문서·변경 정합성 | 모든 후보의 설명·링크·정책·현재/이력 구분, 삭제 후 참조 확인 | 변경 문서와 참조 파일을 읽어 대조하고 `git diff --check`. staged 변경은 `git diff --cached --check`도 확인 | 로컬/Replit 파일 읽기. 공백 명령 자체는 링크·내용을 검사하지 않음 |
| Lint | 변경·영향받는 JS/TS의 코드 오류·Hooks 규칙 | `./node_modules/.bin/eslint <선택한 파일...>`; 공통 lint 설정·관련 도구 의존성의 전체 영향은 `npm run lint` | Replit. 파일 읽기, 앱·DB 실행 없음 |
| 서식 | 변경 JS/TS/TSX·CSS의 공통 서식 | `./node_modules/.bin/prettier --check <선택한 파일...>`; 서식 설정의 전체 영향은 `npm run format:check` | Replit. 파일 읽기. 삭제 파일·원본·생성물은 대상에서 제외 |
| 앱 타입·의존 경계 | 앱 후보의 타입 오류, 브라우저/shared의 서버·DB 유입과 앱/sandbox 혼입 | `npm run check` | Replit. 타입 검사 캐시를 쓸 수 있음. 앱·DB 실행 없음. `check:boundaries`가 포함됨 |
| 배포 빌드 | 실제 배포 코드·버전·자산의 번들 생성 가능 여부 | `npm run build` | Replit의 배포와 호환되는 런타임·설정. `dist` 생성/덮어쓰기와 빌드 플러그인 실행. 서버 시작·배포·DB 작업은 하지 않음 |

## 변경 영향별 선택 검사

### 정적 검사와 별도 도구

| 검사 | 목적·실행 조건 | 명령 | 환경·부수 효과 |
|---|---|---|---|
| 테스트 타입 | 테스트·보조 파일·공용 계약 변경이 테스트의 타입에 영향을 줄 때 | `npm run check:tests` | Replit. 테스트와 import를 타입 분석하며 테스트 본문·DB는 실행하지 않음 |
| 의존 경계 단독 | import 경계나 검사기 자체만 바뀌어 앱 타입 검사를 함께 실행할 이유가 없을 때 | `npm run check:boundaries` | Replit. 파일 읽기. 같은 후보에서 `check`가 통과했으면 반복하지 않음 |
| 개인정보 로그 | 보호 대상 서버 경로·로그 처리·검사기 변경 | `node --import tsx --test server/tests/privacy-logging.test.ts` | Replit. 소스·AST만 읽음. 실제 요청·로그 전송은 확인하지 않음 |
| DB 설정·결제 보존 소스 | Drizzle session 제외, 탈퇴 시 결제 익명화·보존 처리 변경 | `node --import tsx --test server/tests/security-source-contract.test.ts` | Replit. 파일만 읽음. 실제 DB 적용·결제 행 보존의 증거는 아님 |
| 역사관 공개 자료 | 연혁·회장·임원·수상·기부·공개 문서 JSON과 연결 파일 변경 | `node scripts/check-heritage-content.mjs` | Replit. 날짜·ID·자료/파일 참조 읽기. 비공개 앨범 존재·브라우저·DB·외부 서비스는 확인하지 않음 |
| 회원 사진첩 목록 | 사진첩 목록 계약·이관할 최종 목록 변경 | `node --import tsx scripts/check-heritage-catalog.ts <catalog.json>` | Replit. 지정 파일의 구조·참조만 확인. Storage·회원 API·DB 호출 없음. 공개 기록의 앨범 참조도 해당 목록과 대조 |
| 릴리스 스킬 형식 | 프로젝트 릴리스 스킬 변경 | `python3 /Users/raphael/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/dgkma-release` | 해당 공식 검사기가 설치된 로컬 Mac. 파일 읽기. Replit 앱 런타임 의존이 아니며 선택 기준·링크는 별도로 읽어 검토 |
| 설계 미리보기 타입 | `artifacts/mockup-sandbox` 코드·설정 변경 | `npm --prefix artifacts/mockup-sandbox run typecheck` | Replit의 별도 sandbox 의존성. 파일 읽기; 루트 앱 타입 검사가 대신하지 않음 |
| 설계 미리보기 빌드 | sandbox 배포 산출물·Vite 설정 변경 | `npm --prefix artifacts/mockup-sandbox run build` | Replit. sandbox 빌드 산출물 생성/덮어쓰기. 루트 앱 릴리스마다 실행하지 않음 |

### 기존 기능 테스트

아래는 선택할 파일과 보호 목적이다. **명령은 `node --import tsx --test <선택한 파일...>`**, 환경은 Replit 개발 워크스페이스다. 링크의 저장소 상대 경로를 명령에 넣는다. 하나의 행에서도 변경과 관련된 파일만 선택한다.

모든 행은 실행형 검사다. 메모리 대역·순수 함수도 정적 검사로 보고하지 않는다. HTTP 표기는 임시 loopback 서버와 메모리 대역을 뜻하며 실제 회원/provider를 호출하는 QA가 아니다. DB 병행 파일은 아래 별도 opt-in 없이는 DB 사례를 skip한다. `npm test -- --test-name-pattern=...`은 모든 발견 파일을 먼저 로드하므로 파일 격리 명령으로 쓰지 않는다.

| 파일 | 목적·선택 조건 | 추가 부수 효과·한계 |
|---|---|---|
| [router](../../client/src/app/routing/router.test.ts) | 공개/회원/관리자 접근 분기·lazy route·오류 fallback 변경 | React 렌더링·파일 탐색. 실제 브라우저 클릭·CSS 확인 없음 |
| [관리자 동기화 상태](../../client/src/features/admin/__tests__/admin-alumni-sync-state.test.ts) | preview·apply 상태 전이와 오래된 응답 처리 변경 | 메모리 reducer |
| [본문 인라인 문법](../../shared/editor/post-inline-marks.test.ts) | 승인된 Markdown 밑줄·기울임·굵게 해석과 JSON/본문 표시 계약 변경 | 기존 사용자 제시 예문 네 개 재사용, 공식 변환·정적 렌더링. 브라우저 키 입력·클립보드는 확인하지 않음 |
| [카테고리 정책](../../client/src/features/boards/__tests__/category-policy.test.ts) | 작성 가능 분류·카테고리 판정 변경 | 순수 정책 함수 |
| [권한 HTTP](../../server/tests/route-security.test.ts), [관리자 예외](../../server/middleware/auth-middleware.test.ts) | endpoint 인증·회원 승인 상태 재확인·관리자 접근과 사용자 조회 예외 변경 | HTTP/미들웨어 대역. DB·실계정 접근 없음 |
| [OAuth 설정](../../server/integrations/kakao/kakao-oauth-config.test.ts), [admin key 설정](../../server/integrations/kakao/kakao-admin-config.test.ts), [관리자 allowlist](../../server/integrations/kakao/kakao-admin-allowlist.test.ts) | 개발/운영 설정 선택·잘못된 키/ID 구성 처리 변경 | 제공된 환경값 대역. 실제 Secret 가용성 확인 아님 |
| [Kakao 전송](../../server/integrations/kakao/kakao-client.test.ts), [연결 해제](../../server/integrations/kakao/kakao-unlink.test.ts) | 토큰·사용자 요청 또는 unlink 계약 변경 | fetch 대역. 실제 카카오 호출 없음 |
| [OAuth 흐름](../../server/modules/identity/kakao-oauth-routes.test.ts) | state·세션 저장·신규/기존 회원·충돌·관리자 승인 흐름 변경 | HTTP, `identity/testing/` 보조·메모리 대역. 실제 로그인 없음 |
| [OAuth state](../../server/modules/identity/kakao-oauth-state.test.ts) | state 해시·만료·단일 소비 계약 변경 | 해시 함수와 DB 사례가 한 파일에 있음 |
| [회원 프로필](../../server/modules/identity/member-profile-routes.test.ts), [회원 DTO](../../server/modules/identity/client-user.test.ts) | 세션 회원 선택·활동 지역·보호 필드·날짜 직렬화 변경 | HTTP·입력 대역 |
| [탈퇴 요청](../../server/modules/identity/account-deletion-routes.test.ts) | 본인 확인·탈퇴 확인문·unlink 실패·세션 종료 변경 | HTTP·카카오/저장소 대역 |
| [가입 대기 DTO](../../client/src/features/admin/__tests__/admin-pending-registration-contract.test.ts), [가입 거절](../../server/modules/registry/admin-pending-rejection-routes.test.ts) | 관리자 응답 개인정보 범위·거부 보존·재심사·승인 취소·거부 신청 삭제/unlink 변경 | 클라이언트 폴더의 DTO 검사도 서버 HTTP 실행형 |
| [명부 일치](../../server/modules/registry/alumni-match.test.ts), [동기화 계획](../../server/modules/registry/alumni-sync-plan.test.ts) | 명부 후보 선택·중복/충돌·preview 계산 변경 | 메모리 명부 대역 |
| [동기화 API](../../server/modules/registry/alumni-sync-routes.test.ts), [Sheets 오류](../../server/integrations/google-sheets.test.ts) | fingerprint·오래된 preview·원본 오류 처리 변경 | HTTP 또는 Sheets 대역. 실제 Sheets 읽기/쓰기 없음 |
| [회비 API](../../server/modules/dues/admin-payment-routes.test.ts), [회원 등급](../../server/modules/dues/membership-status.test.ts) | 관리자 결제 입력·완료 상태/연도 집계·응답 공개 범위 변경 | HTTP/저장소 대역. 현재 회비 판정을 검사하며 정책 변경 승인은 아님 |
| [전화번호](../../server/lib/phone-normalization.test.ts), [한국 날짜](../../server/lib/korea-date.test.ts), [생일](../../server/tests/birthday.test.ts) | 신원 연결 정규화·KST 연도 경계·양력/음력 생일 계산 변경 | 로컬 함수·달력 라이브러리 |
| [출처 정책](../../server/modules/events/event-source-policy.test.ts), [출처 읽기](../../server/modules/events/event-source-reader.test.ts), [부고 해석](../../server/modules/events/obituary-parser.test.ts) | URL 허용·본문 확보/실패·사용자 텍스트 보존·관계/이름 추출 변경 | 수집 대역·텍스트 파서. 실제 공개 링크·브라우저·OCR 확인 없음 |
| [URL 정정·저장](../../server/modules/events/notice-edit.test.ts) | 부고·결혼·개원 URL 교체와 미리보기/저장 문안 변경 | 임시 esbuild 번들·파일 생성/정리, 프로세스 환경 대역, 실제 정적 작성기 실행. DB·수집·LLM은 대역 |
| [분석 요청 제한](../../server/modules/events/event-parse-limiter.test.ts) | quota 인수·429·동시 작업/해제·원자적 횟수 제한 변경 | HTTP와 DB 사례 병행 |
| [공개 요청](../../server/integrations/public-sources/public-page-fetcher.test.ts) | 공개 주소/DNS 고정·redirect·시간/크기/응답 제한 변경 | 제어된 loopback HTTP·DNS/전송 대역. 실제 외부 사이트 없음 |
| [공개 본문](../../server/integrations/public-sources/public-page-text.test.ts), [Gipoom 공개 응답](../../server/integrations/public-sources/gipoom-public-api.test.ts) | HTML/구조화 본문·provider 응답 추출 변경 | 제공된 응답 대역. 다른 사이트·API 발견·규칙 저장/재사용·OCR의 실제 성공을 증명하지 않음 |
| [저장소 facade](../../server/tests/module-composition.test.ts), [공유 계약](../../shared/contracts/parity.test.ts) | 도메인 메서드 연결·서버 호환 export·입력/직렬화 타입 변경 | 모듈을 로드해 실행. 실제 DB 쿼리 없음 |
| [개발 DB 대상 보호](../../server/tests/development-db-target.test.ts) | DB 시험 opt-in·개발 host/DB 선택 로직 변경 | 환경/연결 대역. 실제 DB 시험과 구분 |
| [탈퇴 저장](../../server/modules/identity/account-deletion-storage.test.ts), [탈퇴/로그인 경쟁](../../server/modules/identity/kakao-termination-race.test.ts) | 관련 데이터 정리·진행 중 로그인과 탈퇴 경쟁 변경 | 실제 Development DB 쓰기. 아래 DB 조건 필요 |
| [명부 동기화 저장](../../server/modules/registry/alumni-sync-storage.test.ts) | 원자적 동기화·변경 없음 처리·연결 보존 변경 | 실제 Development DB, fixture 및 임시 trigger/function 생성·정리 |
| [회원 등록 경쟁](../../server/modules/registry/member-registration-concurrency.test.ts), [대기 등록 경쟁](../../server/modules/registry/pending-registration-concurrency.test.ts), [승인 경쟁](../../server/modules/registry/pending-registration-approval-race.test.ts) | 동일 신원·명부 claim·대기/승인 경쟁 처리 변경 | 실제 Development DB 쓰기·fixture 정리 |

### 전체 회귀·DB·브라우저·운영 확인

| 검사 | 목적·실행 조건 | 명령 | 환경·부수 효과 |
|---|---|---|---|
| 일반 회귀 전체 | 공통 변경의 영향이 넓거나 특정 파일로 좁힐 근거가 부족할 때 | `npm test`; 일반 실행에서 `RUN_DEVELOPMENT_DB_TESTS`가 설정되지 않았는지 값 노출 없이 확인 | Replit. 위 메모리·HTTP·임시 번들·작성기 실행. DB skip은 DB 통과가 아님. 같은 실행에 포함된 파일은 다시 실행하지 않음 |
| 실제 DB 회귀 | 영향받는 트랜잭션·동시성·보존을 실제 DB에서 확인해야 하고 실행 범위가 승인됐을 때 | 선택 파일에 `RUN_DEVELOPMENT_DB_TESTS=1 node --import tsx --test --test-concurrency=1 <DB 검사 파일...>`; 전체 DB 영역이 영향받으면 `npm run test:development-db` | [DB 런북](database-operations.md#별도로-요청된-격리-개발-db-검사)의 Development `heliumdb`·PG*·opt-in 확인. DML, 일부 임시 DDL, fixture 생성·정리. 운영 연결·새 시험 DB를 자동 생성하지 않음 |
| 오래된 탭 복구 | lazy import·정적 자산 제공·cache/404·시작 오류 복구 변경을 브라우저로 확인해야 할 때 | `npm run test:route-recovery-browser` | Replit Chromium, `CHROMIUM_PATH` 사용 가능. Vite 두 빌드가 `dist/public`을 덮어쓰며 임시 서버·프로필·파일을 생성/정리. 릴리스 빌드 전에 수행하고 검사 전용 빌드를 배포하지 않음 |
| 운영 smoke | 승인된 Republish 성공 후 새 deployment의 공개 HTTP·canonical·회원 인증 차단·후보 자산 일치 확인 | 확정한 공개 대상에 `curl -sS -o /dev/null -w '%{http_code}\n' "$release_url"`; HTML 메타데이터와 후보/운영 자산 해시도 대조 | 프로덕션 비로그인 GET, 서버 접근 로그 발생. `shared/public-pages.ts`와 변경 범위로 대상을 선정. 상태 코드만으로 본문·자산 검증을 끝내지 않음 |

실제 공개 링크 수집·API 발견/규칙 재사용·OCR·OpenAI·Sheets·카카오 연결은 위 대역 테스트와 별개다. 필요할 때 대상·명령·데이터·비용·쓰기 범위를 정해 해당 작업의 승인을 따른다. 실계정 QA는 계속 보류한다. `db:push`, 마이그레이션, 서버 재시작과 Republish는 검사 카탈로그 선택으로 실행할 작업이 아니다.

## 결과 재사용 기준

- **입력 일치:** 검사한 소스·검사 파일·직접/간접 의존 파일·설정·관련 자산과 실행에 쓰인 의존성·도구 버전이 현재 대상과 같아야 한다. 의존성은 lockfile로 대조하고 후보 SHA/tree 또는 파일 해시와 실제 명령/범위를 기록한다. 같은 브랜치·버전 번호라는 이유만으로 재사용하지 않는다. SHA가 바뀌어도 해당 검사 입력과 조건의 일치를 입증하면 재사용할 수 있다.
- **환경 일치:** 관련 런타임 버전·OS·빌드 옵션·환경 선택이 같아야 한다. Secret 값은 기록하지 않는다. 값/선택 변경이 결과에 영향을 줄 수 있으면 해당 검사를 다시 수행한다. Mac 검사는 Replit 런타임 검증을 대신하지 않는다.
- **대상별 제한:** 빌드는 앱 버전·빌드 설정·전체 입력과 산출물 해시까지 일치해야 한다. 플랫폼이 배포 과정에서 요구하는 빌드를 임의로 생략하지 않는다. 브라우저 복구는 검사한 두 빌드·브라우저 조건을 연결한다. DB 검사는 대상·스키마·fixture/관련 상태가 달라지면 재사용하지 않는다. 새 deployment의 운영 smoke는 이전 배포 결과로 대체하지 않는다.
- **범위와 결과:** 실제 통과한 범위만 재사용하고 원래 환경·일시·로그 및 현재 일치 근거를 연결한다. 상위 `check`의 경계 검사나 일반 회귀에 포함된 선택 파일을 다시 실행하지 않는다. 일부 사례 skip·실패·미실행을 통과로 바꾸거나 좁은 검사를 전체 기능 확인으로 확대하지 않는다.

코드·기준·설정·환경이 바뀌면 영향받는 검사만 다시 수행한다. 무관한 문서 변경이나 같은 tree의 병합 메타데이터 때문에 앱 검사를 반복하지 않는다. 이번 변경 밖에서 실행한 이력도 위 조건을 충족할 때만 사용한다.

## 결과 기록

별도 대장을 만들지 않고 기존 작업/릴리스 기록에 선택 검사·목적·선택/미선택 이유·실제 파일/명령·후보/입력 식별자·도구/설정·환경·실행일·결과·재사용 출처·남은 공백을 적는다. 통과·경고·실패·미실행·해당 없음을 구분한다. 적용되는 검사를 승인 부족으로 못 했다면 미실행이며, 관련 없는 검사는 해당 없음이다.

필수 차단의 실패·미실행은 그 검사가 보호하는 배포 범위에 적용한다. 단순 형식/부가정보 경고를 기능 실패로 바꾸지 않는다. 검사 수량이나 과거 통과 건수를 현재 후보의 성공 근거로 쓰지 않는다. 현재 카탈로그는 미래 검사를 모두 예약하거나 새로운 자동 CI를 만드는 규칙이 아니다.

## 과거 수행 기록

2026-11-09까지 누적된 원문 기록과 통합 전 체크리스트는 [과거 walkthrough](../history/walkthrough-2026-11-09.md)에 보존한다. 그 문서의 `/events`, `/o`, 기타 유형, 상세 폼, 공개 게시글 API, 전체 회귀·실계정 QA 절차는 당시 구현의 기록이며 현재 작업 지시가 아니다.

- [키·모델 실제 호출과 당시 부고 수집 실패](../history/walkthrough-2026-11-09.md#실제-모델과-부고-작성-점검-2026-11-09)
- [이후 범용 API 발견·규칙 재사용](../history/replit-2026-11-09.md#개발-수집-적용-결과-2026-11-09)
- [결혼·개원 보완의 정적 확인 범위](../history/replit-2026-11-09.md#적용-결과와-확인-범위)
- [최신 URL 정정 릴리스](../history/replit-2026-11-09.md#url-정정-릴리스-완료-결과)
- [DB 전환·보존 결과](../history/database-operations-2026-11-09.md), [구조 개편 이력](../history/structure-validation-2026-10-20.md)
