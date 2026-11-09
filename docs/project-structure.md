# 프로젝트 구조와 변경 경계

React/Vite + Express/Drizzle/PostgreSQL의 **단일 배포 modular monolith**를 유지한다.
기능 소유 위치와 URL·공개 범위의 변경은 구분하며, URL·권한은 확정된 제품 정책을 따른다.
제품 정책은 `planning_proposal.md`, 환경은 `replit.md`, DB는 기존
`database-schema.md`/`database-operations.md`가 계속 기준이다.

2026-11-09 main `d7184ca`의 코드에 맞춘 현재 구조다. 과거 이동·점검 결과는 [구조 개편 이력](./structure-validation.md)과 [개발·릴리스 이력](./history/replit-2026-11-09.md)에 보존한다.

## 소유권과 이동표

| 기존 위치 | 현재 소유 위치 | 책임 |
|---|---|---|
| `client/src/App.tsx` | `client/src/app/app.tsx`, `providers.tsx`, `routing/`, `layout/` | 앱 조립, 라우트, 프로바이더, 공통 레이아웃 |
| `pages/login`, `kakao-callback`, `onboarding`, auth 훅/컴포넌트 | `features/auth` | 로그인·콜백·활동지역, 세션 상태와 인증 API |
| `pages/home`, `public-home` | `features/home` | 회원 홈과 `/`·`/about`에서 공유하는 공개 랜딩페이지 |
| `pages/about`, `info`, `pages/heritage` | `features/about` | 소개·임원·역대회장·역사관·회칙·가입·회비·경조사 지원 안내. 기존 heritage 목업은 제거 |
| `pages/boards`, `post-detail` | `features/boards` | 게시글·댓글·첨부 |
| `pages/directory` | `features/directory` | 권한 범위 내 명부 |
| `pages/profile`, profile 컴포넌트 | `features/profile` | 프로필·납부내역·회원상태 |
| `pages/events`, `pages/obituary`, event draft 훅 | `features/events` | 부고·결혼·개원 텍스트 초안·미리보기·게시; 목록·상세는 boards |
| `pages/admin`, `admin-alumni-sync-state` | `features/admin` | 승인·거절·명부 동기화, 게시글·가린 글 관리 연결. 통계는 준비 중 |
| `pages/search` | `features/search` | 게시글·명부 검색 |
| `pages/terms`, `privacy` | `features/legal` | 법적 고지 |
| `server/routes.ts` | `server/modules/*/routes.ts` | 도메인별 HTTP 처리; 기존 파일은 순서대로 등록 |
| `server/storage.ts` | `server/modules/*/storage.ts` | 도메인별 저장 구현; 기존 파일은 단일 facade |
| 인증·가입·탈퇴 지원 코드 | `server/modules/identity` | 회원 계정, OAuth state, 세션, 종료/가입 잠금 |
| 명부 매칭·동기화·가입 심사 | `server/modules/registry` | 명부, 별칭, 대기 신청, 승인·거절 |
| 게시글·카테고리·댓글 | `server/modules/content` | 콘텐츠 라우트/저장 |
| 경조사·부고·파싱·대상자 정책 | `server/modules/events` | 경조사 업무·초안·게시·호출 제한 |
| 납부·회원등급 | `server/modules/dues` | 내부 납부 기록과 권리회원 계산 |
| Kakao/Sheets/공개 URL/Object Storage | `server/integrations` | 외부 통신·응답 검증 |
| 인증 middleware, 로깅·날짜·세션 Secret | `server/middleware`, `server/lib` | 서버 공통 기반 |
| `shared/schema.ts` 테이블·relations·Drizzle 입력 정의 | `server/db/schema/index.ts` | 영속성; 기존 경로는 서버 전용 호환 export |
| 브라우저 DTO·입력 검증 | `shared/contracts` | 독립 JSON 계약, Zod 검증 |
| 생일·카테고리·부고문 정책 | `shared/domain` | 브라우저 안전 순수 정책 |

프런트엔드 경로는 모두 `client/src/` 기준이다. 각 feature의 `index.ts`가 공개 API다.
기능에만 쓰는 API 호출·query·mutation·폼 상태는 그 기능 안에 두고,
여러 기능에서 동일한 의미로 사용하는 UI·훅·유틸리티만 `components`, `hooks`,
`lib`로 승격한다. 파일 하나라는 이유만으로 API/상태 계층을 빈 폴더로 나누지 않는다.

## 의존 방향

- `app → features/*/index.ts → common UI/hooks/lib + shared/contracts/domain`
- feature 간에는 상대 기능의 공개 `index.ts`만 사용한다. common은 feature 구현을 역참조하지 않는다.
- `server/index.ts → routes.ts → modules + integrations + middleware`
- 서버의 도메인별 저장 구현은 같은 DB를 사용한다. 여러 도메인에 걸친 가입·승인·탈퇴는
  한 트랜잭션의 소유자 안에 유지하고, 폴더 경계를 맞추기 위해 분산시키지 않는다.
- `server/lib/route-context.ts`는 기존 테스트 주입 계약을 조립하는 명시적 composition 예외다.
- `shared/contracts`, `shared/domain`은 서버·DB·Node에 의존하지 않는다.
  클라이언트는 타입 전용 import도 `shared/schema`에서 가져오지 않는다.
- 서버에서 `@shared/schema`를 쓰는 기존 호출부는 호환 기간 동안 허용한다.
  새 영속성 코드는 `server/db/schema`를 사용한다. 기존 shared utility 경로도 호환 export다.
- DTO의 JSON 날짜는 문자열이다. 서버 내부 Drizzle 날짜와 브라우저 DTO를 혼용하지 않는다.

## 보존 계약 목록

### 브라우저 경로

`/`, `/login`, `/kakao-callback`, `/onboarding/region`, `/terms`, `/privacy`,
`/about`, `/about/intro`, `/about/executives`, `/about/presidents`, `/about/heritage`,
`/about/bylaws`, `/about/bylaws/regulations`,
`/about/join`, `/about/dues`, `/about/condolence`, `/admin`, `/b`, `/directory`,
`/profile`, `/search`, `/p/:id`, `/post/:id`, `/p/:id/edit`를 제공한다.
통합 정책에 따라 `/b/write/:type`를 추가하고 `/o`, `/events`와 그 하위 경로는 제거한다.

- `/about`은 로그인 여부와 관계없이 기존 공개 홈 랜딩페이지를 직접 표시한다. `/heritage` 화면·라우트는 제거한다.
- `/info → /about`; `/history → /about/intro`
- `/executives`, `/officers → /about/executives`; `/bylaws → /about/bylaws`
- 회원의 활동지역 미입력 시 `/onboarding/region` 이동, 관리자 진입 제한을 유지한다.

### API 소유권·등록 순서

| 순서/소유자 | 경로와 계약 |
|---|---|
| identity | GET `/api/auth/callback`, POST `/api/auth/logout`, GET `/api/auth/kakao/start`, POST `/api/auth/kakao/authorize`, POST `/api/users/activity-region`, GET `/api/auth/me`, PATCH/DELETE `/api/users/me` |
| dues 회원상태 | GET `/api/membership/status` |
| events | 인증된 `/api/posts/notices`: POST `/drafts/:type`, PATCH/DELETE `/:id`, POST `/:id/generate`(호출 제한), POST `/:id/publish`, POST `/:id/edit-preview`, PATCH `/:id/edit`. content보다 먼저 등록 |
| content | 모든 `/api/posts`·`/api/categories`·`/api/comments`에 회원 인증. GET/POST `/api/categories`, GET/POST `/api/posts`, GET `/api/posts/search`·`/api/posts/hidden`을 동적 상세보다 먼저 등록. GET/PATCH/DELETE `/api/posts/:id`, PATCH `/api/posts/:id/visibility`, GET/POST `/api/posts/:postId/comments`, DELETE `/api/comments/:id` |
| registry | GET `/api/alumni` |
| dues 납부 | GET `/api/payments/user/:userId`, POST `/api/payments` 관리자 보호 |
| registry 관리자 | `/api/admin` 관리자 middleware, GET `/pending-registrations`, PATCH `/pending-registrations/:id`, POST `/sync-alumni/preview`, POST `/sync-alumni`, GET `/sync-progress`, GET `/test-google-sheets` (모두 `/api/admin` 접두사) |
| object storage | PUT `/api/uploads/:uploadToken`, POST `/api/uploads/request-url`, GET `/objects/:objectPath(*)` |

권한·제품 계약은 계획서, 실제 경로·응답은 도메인별 라우트 코드와 계약을 함께 확인한다. 테스트의 과거 통과를 현재 실계정 동작 확인으로 대신하지 않는다.
일반 글 수정·삭제는 작성자만, 가리기/다시 표시하기는 관리자만 처리한다. 경조사 정정은 기존 초안 API와 별도 서명 미리보기·확인 흐름이다.
`ClientUser`, 관리자 pending DTO, 최소 명부 DTO는 원문 사용자·신청·연락처를 대신 노출하지 않는다.
회원 경조사 목록/상세에는 `sourceText`를 포함하지 않는다.

### 캐시와 정적 자산

- auth: `/api/auth/me`는 AuthProvider의 직접 fetch/상태 관리로 유지한다 (Query cache로 전환하지 않음).
- boards: `["/api/categories"]`, `["/api/posts", category 또는 undefined, "hidden" 또는 "visible"]`,
  `["/api/posts", postId]`, `["/api/posts", postId, "comments"]`
- search: `["/api/posts/search", searchTerm]`, `["/api/alumni", searchTerm]`
- directory: `["/api/alumni"]`
- events: 작성자 초안은 직렬 요청과 revision으로 관리; 게시 후 `/api/posts` 목록 무효화 및 입력 초기화
- profile: `["/api/payments/user", userId]`, `["/api/membership/status"]`
- admin: `["/api/admin/pending-registrations"]`, `["/api/admin/test-google-sheets"]`;
  승인/동기화 뒤 기존 cache invalidation 유지

`attached_assets`, `client/public` 파일은 보존한다. `/objects/*`는 회원 전용·no-store이고 게시글 SEO는 내용을 포함하지 않는 공통 메타데이터다.
Vite 산출물은 `dist/public`, 서버 번들은 `dist/index.js`; `server/vite.ts`의 실행 위치별
정적 파일 처리와 `server/seo.ts`를 유지한다.

### 트랜잭션·외부 호출

동일 신원/전화번호 잠금, 명부 claim, OAuth generation 검증과 로그인 세션 회전을 유지한다.
탈퇴·거절은 외부 Kakao unlink 확인 후 로컬 정리하며, 관련 세션·참조·종료 marker는 기존
트랜잭션 안에 둔다. 명부 동기화는 원본 fingerprint 재검증, advisory lock과 단일 transaction,
DB-only 행 보존을 유지한다. 테스트는 실제 Google Sheets 적용이나 Kakao unlink를 하지 않는다.
Object Storage의 세션 검증, MIME·크기 제한, non-image octet-stream/nosniff를 유지한다.

## 본문·공통 표시

본문 JSON 계약은 `shared/contracts/post-document.ts`, 공식 스키마·변환은 `shared/editor/post-document.ts`, 편집 UI·표시는 `client/src/components/post-body-editor.tsx`·`post-body.tsx`가 담당한다. 저장·권한·첨부는 feature와 서버 모듈에 둔다. 경조사 사실 JSON과 본문 JSON을 합치지 않는다. 사이트 이름·canonical은 `shared/site.ts`, 메뉴는 `client/src/app/layout/nav-items.ts`의 공통 정의를 사용한다.

## 파일명·테스트 규칙과 명령

- 신규 파일은 `kebab-case.ts(x)`. 기존 생성 UI와 `ObjectUploader.tsx`,
  `queryClient.ts` 같은 공용 호환 파일은 일괄 이름 변경하지 않는다.
- 순수 로직/서버 테스트는 구현 옆 `*.test.ts`; UI source-contract 테스트는 기능의
  `__tests__`; 전역 보안·문서·배포 계약은 `server/tests`.
- `scripts/run-tests.mjs`는 client/src, server, shared를 재귀 탐색한다.
  `artifacts/mockup-sandbox`는 별도 package/lock/toolchain을 유지하며 루트 앱 테스트·타입·빌드에 섞지 않는다.
- `npm test -- --test-name-pattern='패턴'`: 집중 실행.
- `node scripts/run-tests.mjs --list`: 탐색 목록.
- `npm run check`: 앱 타입 + 브라우저/공통/feature 경계와 runtime cycle 검사.
- `npm run check:tests`: 테스트까지 포함한 strict 타입 검사.
- `npm test`, `npm run build`: 전체 회귀·배포 번들 검증.

경계 검사는 정적 import/export와 literal dynamic import를 대상으로 한다.
동적으로 계산한 import 문자열, DI의 의미적 의존성, HTTP 권한을 증명하지 않는다.
개발 직후에는 필요한 정적 검사만 수행한다. 별도로 요청된 라우트 실행 점검과 구분하며 스키마·실데이터 변경은 이 작업에 포함하지 않는다.

## 보존 파일과 제거된 경로

기존 호환 shared export와 미사용 추정 패키지는 사용처를 별도 확인하기 전 보존한다.
레거시 `features/events/obituary/create.tsx`·`list.tsx`와 옛 `/o`·`/events`는 게시글 통합에서 제거됐다. 현재 보존 대상으로 나열하지 않는다.
`features/heritage/info.tsx`를 포함한 기존 heritage 화면은 2026-11-09 공개 메뉴 통합 범위에서 제거했다.
`attached_assets`나 sandbox를 정리 대상으로 취급하지 않는다.

구조 개편 당시 결과는 [구조 개편 검증 기록](structure-validation.md), 후속 변경의 실제 확인 범위는 [릴리스 이력](./history/replit-2026-11-09.md)을 따른다.
