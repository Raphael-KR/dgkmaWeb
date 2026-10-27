# 프로젝트 구조와 변경 경계

React/Vite + Express/Drizzle/PostgreSQL의 **단일 배포 modular monolith**를 유지한다.
기능 이동은 URL, 권한, 캐시 키, 데이터 정의를 바꾸는 작업이 아니다.
제품 정책은 `planning_proposal.md`, 환경은 `replit.md`, DB는 기존
`database-schema.md`/`database-operations.md`가 계속 기준이다.

## 소유권과 이동표

| 기존 위치 | 현재 소유 위치 | 책임 |
|---|---|---|
| `client/src/App.tsx` | `client/src/app/app.tsx`, `providers.tsx`, `routing/`, `layout/` | 앱 조립, 라우트, 프로바이더, 공통 레이아웃 |
| `pages/login`, `kakao-callback`, `onboarding`, auth 훅/컴포넌트 | `features/auth` | 로그인·콜백·활동지역, 세션 상태와 인증 API |
| `pages/home`, `public-home` | `features/home` | 회원/비회원 홈 |
| `pages/about`, `info` | `features/about` | 소개·임원·회칙·가입·회비·경조사 지원 안내 |
| `pages/heritage`, heritage 컴포넌트 | `features/heritage` | 역사 자료 |
| `pages/boards`, `post-detail` | `features/boards` | 게시글·댓글·첨부 |
| `pages/directory` | `features/directory` | 권한 범위 내 명부 |
| `pages/profile`, profile 컴포넌트 | `features/profile` | 프로필·납부내역·회원상태 |
| `pages/events`, `pages/obituary`, event draft 훅 | `features/events` | 등록·목록·상세·초안 조정·레거시 부고 |
| `pages/admin`, `admin-alumni-sync-state` | `features/admin` | 승인·거절·명부 동기화 UI/상태 |
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
`/about/intro`, `/about/executives`, `/about/bylaws`, `/about/bylaws/regulations`,
`/about/join`, `/about/dues`, `/about/condolence`, `/admin`, `/b`, `/directory`,
`/profile`, `/heritage`, `/search`, `/p/:id`, `/post/:id`, `/o/:id`,
`/events`, `/events/:id`를 유지한다.

- `/o/new → /events?type=obituary&compose=1`, `/o → /events?type=obituary` (replace)
- `/about`, `/info`, `/history → /heritage`
- `/executives`, `/officers → /about/executives`; `/bylaws → /about/bylaws`
- 회원의 활동지역 미입력 시 `/onboarding/region` 이동, 관리자 진입 제한을 유지한다.

### API 소유권·등록 순서

| 순서/소유자 | 경로와 계약 |
|---|---|
| identity | GET `/api/auth/callback`, POST `/api/auth/logout`, GET `/api/auth/kakao/start`, POST `/api/auth/kakao/authorize`, POST `/api/users/activity-region`, GET `/api/auth/me`, PATCH/DELETE `/api/users/me` |
| dues 회원상태 | GET `/api/membership/status` |
| content | GET/POST `/api/categories`, GET `/api/posts`, GET `/api/posts/search` **이후** GET `/api/posts/:id`, POST `/api/posts`, GET/POST `/api/posts/:postId/comments`, DELETE `/api/comments/:id` |
| events | `/api/obituary`, `/api/obituaries` 인증 middleware; POST `/api/obituary/parse`, GET/POST `/api/obituaries`, GET `/api/obituaries/:id`; POST `/api/events/parse`에 인증+호출 제한; `/api/events` 인증 middleware |
| events 상세 | GET `/api/events/drafts/latest`, POST `/api/events/drafts`, PATCH/DELETE `/api/events/drafts/:id`, POST `/api/events/:id/preview`, POST `/api/events/:id/publish`, GET `/api/events`, GET `/api/events/:id` |
| registry | GET `/api/alumni` |
| dues 납부 | GET `/api/payments/user/:userId`, POST `/api/payments` 관리자 보호 |
| registry 관리자 | `/api/admin` 관리자 middleware, GET `/pending-registrations`, PATCH `/pending-registrations/:id`, POST `/sync-alumni/preview`, POST `/sync-alumni`, GET `/sync-progress`, GET `/test-google-sheets` (모두 `/api/admin` 접두사) |
| object storage | PUT `/api/uploads/:uploadToken`, POST `/api/uploads/request-url`, GET `/objects/:objectPath(*)` |

기존 응답 코드·오류 본문·허용 필드·관리자/작성자 검증은 도메인별 라우트 테스트가 기준이다.
`ClientUser`, 관리자 pending DTO, 최소 명부 DTO는 원문 사용자·신청·연락처를 대신 노출하지 않는다.
회원 경조사 목록/상세에는 `sourceText`를 포함하지 않는다.

### 캐시와 정적 자산

- auth: `/api/auth/me`는 AuthProvider의 직접 fetch/상태 관리로 유지한다 (Query cache로 전환하지 않음).
- boards: `["/api/categories"]`, `["/api/posts", category 또는 undefined]`,
  `["/api/posts", postId]`, `["/api/posts", postId, "comments"]`
- search: `["/api/posts/search", searchTerm]`, `["/api/alumni", searchTerm]`
- directory: `["/api/alumni"]`
- events: `["/api/events"]`, `["/api/events", id]`,
  `["/api/events/drafts/latest", eventType]`; 게시 후 목록 무효화·초안 cache 제거
- legacy: `["/api/obituaries"]`, `["/api/obituaries", id]`
- profile: `["/api/payments/user", userId]`, `["/api/membership/status"]`
- admin: `["/api/admin/pending-registrations"]`, `["/api/admin/test-google-sheets"]`;
  승인/동기화 뒤 기존 cache invalidation 유지

`attached_assets`, `client/public`, `/objects/*`, SEO 경로를 변경하지 않는다.
Vite 산출물은 `dist/public`, 서버 번들은 `dist/index.js`; `server/vite.ts`의 실행 위치별
정적 파일 처리와 `server/seo.ts`를 유지한다.

### 트랜잭션·외부 호출

동일 신원/전화번호 잠금, 명부 claim, OAuth generation 검증과 로그인 세션 회전을 유지한다.
탈퇴·거절은 외부 Kakao unlink 확인 후 로컬 정리하며, 관련 세션·참조·종료 marker는 기존
트랜잭션 안에 둔다. 명부 동기화는 원본 fingerprint 재검증, advisory lock과 단일 transaction,
DB-only 행 보존을 유지한다. 테스트는 실제 Google Sheets 적용이나 Kakao unlink를 하지 않는다.
Object Storage의 세션 검증, MIME·크기 제한, non-image octet-stream/nosniff를 유지한다.

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
동적으로 계산한 import 문자열, DI의 의미적 의존성, HTTP 권한을 증명하지 않으므로
타입 검사와 라우트 회귀를 함께 실행한다. 스키마·실데이터 변경은 이 작업에 포함하지 않는다.

## 삭제하지 않은 검토 후보

`features/about/info.tsx`, 레거시 `features/events/obituary/create.tsx`/`list.tsx`,
기존 호환 shared export, 미사용 추정 패키지는 사용처를 별도 확인하기 전 보존한다.
`attached_assets`나 sandbox를 정리 대상으로 취급하지 않는다.

검증 결과와 실제 계정 UI의 미확인 범위는 [구조 개편 검증 기록](structure-validation.md)에 기록한다.
