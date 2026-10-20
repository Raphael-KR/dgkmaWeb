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

- 구조 이동 당시 약 730 kB의 JS chunk 경고는 아래 경로별 코드 분할에서 해소했다.
- 공유 DTO/검증의 명시적 정의는 향후 서버 변경과 함께 parity를 유지해야 한다.
- `shared/schema.ts`와 기존 shared utility 경로는 호환을 위해 남겨두었다.
- sandbox는 별도 Vite 7 환경이며 앱은 기존 Vite 6 환경을 유지한다.
- 첨부 원본 파일, 정적 자산, migrations, 운영 데이터는 정리/이름 변경하지 않았다.

구조·명령·소유권은 [project-structure.md](project-structure.md)를 참고한다.

## 경로별 코드 분할 검증 (2026-10-20)

동일 작업 사본에서 변경 전후 `npm run build`를 실행했다.
아래 gzip은 빌드 파일을 압축한 크기이며 실제 네트워크 전송량/로딩 시간 측정값은 아니다.
이미지·CSS·API 응답은 JS 수치에 포함하지 않는다.

| 항목 | 변경 전 | 변경 후 |
|---|---:|---:|
| 공개 홈 초기 JS (정적 의존성 포함) | 729.96 kB | 349.84 kB (-52.1%) |
| 초기 JS gzip | 210.97 kB | 111.78 kB (-47.0%) |
| 초기 JS 청크 수 | 1 | 1 |
| 전체 JS 청크 수 | 1 | 48 |
| 지연 로딩 화면 진입점 | 0 | 23 |
| 전체 JS 합계 | 729.96 kB | 743.49 kB |
| 전체 JS 개별 gzip 합계 | 210.97 kB | 242.10 kB |
| 최대 JS 청크 | 729.96 kB | 349.84 kB |
| 500 kB 초과 경고 | 있음 | 없음 |
| CSS | 96.27 kB | 96.30 kB |

초기 다운로드는 줄지만 모든 화면을 방문하면 청크별 압축과 로더 비용 때문에
총량과 요청 수가 늘어난다. 전체 48개를 홈에서 내려받는 것은 아니다.
Vite의 기본 동적 import preload를 유지했으며 임의 vendor 청크 묶음,
사전 회원 화면 preload, 경고 임계값 상향은 추가하지 않았다.

### 구현 경계

- feature public API 안에서 `lazy(() => import(...))`를 선언한다.
  router가 index를 import해도 페이지 본문은 eager graph에 들어가지 않는다.
- 공개 홈은 eager로 유지해 기본 방문 경로에 추가 왕복을 만들지 않는다.
  회원 홈과 관리자·명부·게시판·경조사·검색·프로필 및 공개 보조 화면은 lazy다.
- AuthProvider/useAuth/AuthGate/LoginModal은 eager다. 인증 provider를 Suspense
  바깥에 유지해 화면 전환 중 인증 상태나 query cache를 초기화하지 않는다.
- `AuthGate` 안에 lazy 회원 화면을 두므로 비로그인·권한 없음·인증 확인 중에는
  해당 화면을 렌더링하지 않는다. URL, 역할 판단, callback/onboarding 처리,
  legacy redirect와 compose query는 바꾸지 않았다.
- 경조사 index 본문만 `page.tsx`로 분리하고 원래 폼/목록 UI는 유지했다.
- Suspense는 화면 영역에만 적용한다. 대기 시 `role=status` 한국어 안내,
  import/render 실패 시 `role=alert`와 명시적 새로고침/홈 링크를 제공한다.
  새로고침은 최신 HTML과 React.lazy의 실패 캐시를 함께 갱신한다.
  자동 재시도·자동 새로고침 반복은 없고 원문 오류는 UI에 노출하지 않는다.
  다른 경로로 이동하면 경로 key에 따라 오류 경계가 초기화된다.

### 재현 명령과 검증 범위

```sh
npm run check
npm run check:tests
npm run build
npm run check:chunks
node --import tsx --test client/src/app/routing/router.test.ts \
  client/src/features/events/__tests__/community-events-ui-contract.test.ts
```

- 타입·경계·빌드 통과. manifest 검사에서 초기 정적 의존성 합계 <400 kB,
  모든 JS 청크 <500 kB, 23개 lazy 화면이 초기 graph에서 제외됨을 확인한다.
- 실제 router, lazy entrypoint, AuthGate를 실행하는 SSR 검사에서 페이지 본문과
  인증 응답만 테스트 대역으로 교체했다. 공개 12개 경로, 회원 10개 경로,
  익명/회원 홈, 관리자 허용/거부, 인증 확인 중 미렌더링을 검증한다.
- legacy redirect 대상과 순서·query·replace는 소스 계약으로 검증한다.
- 대기 fallback SSR, 오류 경계 상태 전환, 한국어 복구 UI, 경로별 key,
  수동 reload handler를 검사한다. 실제 브라우저의 청크 네트워크 실패 주입이나
  실제 Kakao 로그인 세션의 회원·관리자 UI 조작을 검증한 것은 아니다.
- 전체 회귀 첫 실행: 394개 중 389 pass, 3 fail, 2 skip.
  실패 3개는 경조사 페이지 이동과 router import 변경으로 기존 소스 계약의
  참조가 달라진 경우였다. 기존 assertion은 유지하고 참조를 수정했으며,
  새 라우팅 검사 포함 집중 9/9 pass. 두 DB skip은 앞 절의 기존 환경 조건과 같다.
- 개발 workflow 재시작 후 5000 포트 정상 제공. 공개 홈 desktop, `/login` mobile,
  `/o/new` mobile의 로그인 안내를 스크린샷으로 확인했다.
  비로그인 `/api/auth/me` 401 외 새 브라우저 오류는 없었다.
- 운영 배포·운영 데이터·외부 provider 쓰기 작업은 수행하지 않았다.
