# 구조 개편 검증 기록

검증일: 2026-10-20. 대상은 Replit 개발 작업 사본이다.
운영 배포, 운영 DB 조회/변경, 실제 Sheets 적용·Kakao unlink는 하지 않았다.

## 기준선과 완료 결과

| 검사 | 이동 전 | 이동 후 |
|---|---|---|
| 전체 테스트 | 381개: 379 pass, 0 fail, 2 skip | 391개: 389 pass, 0 fail, 2 skip |
| 테스트 파일 발견 | server 직하 64개 | client/server/shared 재귀 67개; 기존 64개 이름 모두 존재, 중복 없음 |
| 앱 타입 | 기존 설정 사용 | `npm run check` 통과 |
| 테스트 strict 타입 | 기존 exclude로 미검사 | `npm run check:tests` 통과 |
| 경계·runtime cycle | 별도 자동 검사 없음 | `npm run check:boundaries` 200개 앱 소스 통과 |
| 빌드 | 기존 산출 경로 유지 | `npm run build` 통과 (`dist/public`, `dist/index.js`) |
| 공백 오류 | — | `git diff --check` 통과 |

중간 검사에서 새 parity 테스트가 Drizzle text 배열의 실제 coercion과 브라우저 검증의 차이를
발견했다. 서버 입력 정책은 바꾸지 않고 브라우저 검증을 기존 동작에 맞춘 후
집중 parity 6/6과 최종 전체 회귀를 통과했다.
기존 테스트를 타입 검사에 포함하면서 드러난 DNS overload mock, 세션 mock 반환값,
nullable fixture, 매개변수 추론 오류는 assertion을 삭제하거나 strict를 끄지 않고 수정했다.

테이블·relations 선언 블록은 원본과 byte-identical임을 비교했다.
생성 insert schema도 기존 정의를 보존하며, 별도 parity 테스트로 공유 검증을 대조한다.
물리 스키마·runtime DDL·migration SQL의 변경은 없으므로 catalog 변경 작업은 수행하지 않았다.
DB 기준서에는 소스 정의의 새 위치만 반영했다.

서버 저장 메서드 55개는 AST 정규화 비교에서 원래 본문을 유지했다.
라우트 핸들러의 외부 모듈 import 경로/transport 추출 외 입력·분기·응답을 유지했다.
단일 저장 receiver와 override dispatch는 추가 회귀 테스트로 검증했다.

## 기능별 검증 범위

| 기능 | 실행한 증거 |
|---|---|
| 로그인·온보딩·로그아웃 | Kakao 라우트, state, 세션 회전, pending 상태의 비회원성, profile/activity-region 회귀 |
| 권한·관리자 | auth middleware, route-security, 관리자 pending/거절/결제/동기화 회귀 |
| 게시판·첨부·댓글 | 카테고리 정책, content 라우트, 업로드 보안/경로 계약 회귀 |
| 경조사·초안·편집·게시 | draft hook/coordinator, 폼 정규화, UI 계약, parse/preview/publish, 소유권과 원문 비노출 회귀 |
| 명부 | 매칭·별칭·범위·동기화 계획·경쟁 조건 회귀 |
| 회비 | 관리자 생성, membership status, 납부 기록과 KST 기준 회귀 |
| 삭제·승인·경쟁 | 개발 DB를 사용하는 기존 fixture 테스트와 rollback/cleanup 경로 포함 |
| 공개 페이지·SEO·정적 파일 | 홈/법적 고지/모바일 source 계약, 배포 경로 회귀, Vite/esbuild 빌드 |

DB 테스트는 기존 `PG*` 우선순위와 `heliumdb` 확인·자체 fixture 정리를 유지했다.
이번 전체 실행에서 건너뛴 항목은 아래 두 개이며, 기준선에서도 동일했다.

- `development PostgreSQL preserves event draft ownership, reuse, and publish idempotency`
- `development helium fixture proves preview, guarded apply, rollback, and cleanup`

두 테스트는 원래 지정된 Replit ID와 명시적 PG* 개발 대상을 모두 요구한다.
작업 사본에서 이 조건을 우회하거나 운영 연결로 대체하지 않았다.
이 skip은 해당 DB 통합 시나리오를 이번 환경에서 실행했다는 뜻이 아니다.

## 개발 smoke

코드 이동 완료 후 `Start application`을 재시작했다.
로그는 local/replit DB 연결과 port 5000 제공을 확인했으며 시작 오류는 없었다.
파일 이동 도중 예전 `/src/pages/home.tsx` HMR 경고가 한 번 있었으나,
재시작 후 새 브라우저의 페이지 로딩에서 해당 오류는 재현되지 않았다.

- 1280×720 홈 스크린샷: 공개 헤더·로고·카카오 로그인·인사말 정상 표시.
- 390×844 `/events` 스크린샷: 회원 전용 로그인 안내 정상 표시.
- 위 새 브라우저 로그의 `/api/auth/me` 401은 비로그인 상태의 기대 응답이다.
- `/`, 소개·임원·회칙·가입·회비·경조사 지원, 약관·개인정보 페이지 HTTP 200.
- `/events`, `/directory`, `/profile`, `/admin`, `/o`, `/o/new` HTML HTTP 200.
  이는 SPA shell 제공 확인이지 인증된 화면/리디렉션 조작 검증은 아니다.
- `/api/auth/me`, `/api/events`, `/api/alumni`, `/api/membership/status`,
  `/api/payments/user/1`, `/api/admin/pending-registrations`: 모두 비로그인 401.
- `/api/categories`, `/api/posts`: 200; 존재하지 않는 `/api/does-not-exist`: 404.

로그인 우회나 테스트 전용 인증 경로를 추가하지 않았다.
실제 Kakao 계정의 동의·온보딩, 로그인 후 UI 조작, 실제 첨부 저장,
관리자 승인·거절·명부 동기화 화면과 실제 외부 호출은 이 스크린샷으로 검증하지 못했다.
관련 실제 계정 QA는 기존 `walkthrough.md` 미완료 항목으로 유지한다.
운영 smoke나 실제 회원 UI 검증을 완료했다고 표시하지 않는다.

## 잔여 위험과 보존 사항

- 약 730 kB의 JS chunk 크기 경고는 남지만 빌드는 성공한다. 코드 분할은 별도 최적화 범위다.
- 공유 DTO/검증의 명시적 정의는 향후 서버 변경과 함께 parity를 유지해야 한다.
- `shared/schema.ts`와 기존 shared utility 경로는 호환을 위해 남겨두었다.
- sandbox는 별도 Vite 7 환경이며 앱은 기존 Vite 6 환경을 유지한다.
- 첨부 원본 파일, 정적 자산, migrations, 운영 데이터는 정리/이름 변경하지 않았다.

구조·명령·소유권은 [project-structure.md](project-structure.md)를 참고한다.
