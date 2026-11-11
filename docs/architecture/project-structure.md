# 프로젝트 구조와 변경 경계

React/Vite + Express/Drizzle/PostgreSQL의 **단일 배포 modular monolith**를 유지한다.
기능 소유 위치와 URL·공개 범위의 변경은 구분하며, URL·권한은 확정된 제품 정책을 따른다.
제품 정책은 [제품·개발 계획](../product/planning-proposal.md), 환경은 루트 [replit.md](../../replit.md), DB는 [스키마](../reference/database-schema.md)·[운영 런북](../runbooks/database-operations.md)이 기준이다. 문서 위치는 [목적별 안내](../README.md), DB 실행 파일의 분류는 [스크립트 색인](../reference/database-scripts.md)을 따른다. 코드 폴더와 실행 파일 경로는 유지한다.

## 문서 범위와 적용 상태

이 문서는 PR #29에서 main `997bc7ba891ab6a21bac6889b26db93464704f72`에 통합한 구조·보존 계약을 설명한다. 책임 분리·공통 모듈·CSS, 요청·캐시·첨부 처리와 미사용 경로 정리를 포함한다. 소유 위치는 [책임별 모듈 구성](#책임별-모듈-구성), 작업별 범위·검사 근거는 [이력 색인](../history/README.md)을 따른다.

환경별 마지막 적용 상태는 [replit.md](../../replit.md#현재-적용-상태), Git 통합·배포·smoke는 [정리 릴리스 기록](../history/cleanup-release-2026-11-10.md)에서 구분한다. 과거 이동·점검 결과는 [구조 개편 이력](../history/structure-validation-2026-10-20.md)에 보존한다.

2026-11-10 PR #30으로 관리자 기초 통계의 계약을 `shared/contracts/admin-statistics.ts`, 읽기 집계와 권한 보호 라우트를 `server/modules/statistics`, 조회 상태·기간 선택·결과 표시를 `features/admin`에 추가해 main과 Replit 운영에 반영했다. 정적 검사, Git·운영 적용과 미확인 실행 범위는 [통계 수행 기록](../history/admin-statistics-2026-11-10.md)을 따른다.

후속 역사관 구현은 `shared/heritage/`의 공개 JSON·타입·메뉴와 `features/about/heritage/`의 공통 페이지·기록 표시·사진첩으로 분리했다. PR #31로 main에 통합하고 2026-11-11 Replit 운영에 반영했다. 아래 경로·소유 위치는 이 커밋된 소스를 포함한다. [콘텐츠 기준](../reference/heritage-content.md)과 [개발 기록](../history/heritage-2026-11-10.md)·[릴리스 기록](../history/heritage-release-2026-11-11.md)을 따른다.

2026-11-11 공개홈 메뉴 개편의 범위도 아래에 반영한다. 공개 메뉴 세 개와 동문회 하위 여섯 메뉴, 중복 소개 페이지·`/history` 별칭 삭제를 PR #32로 main에 통합하고 `2.0.0`으로 운영에 반영했다. 개발 결과는 [공개홈 메뉴 개발 범위](../../replit.md#공개홈-메뉴-개편-개발-범위), Git·운영 적용은 [2.0.0 릴리스 기록](../history/release-2.0.0-2026-11-11.md)을 따른다.

2026-11-11 필수 검사만 유지하는 후속 정리의 기준을 아래 검사 절에 반영했다. 로컬·Replit 개발 사본 대상이며 Git·운영 반영 여부와 실제 확인 결과는 [추가 축소 기록](../history/essential-checks-2026-11-11.md)을 따른다.

## 코드 소유권

| 소유 위치 | 책임 |
|---|---|
| `client/src/app/app.tsx`, `providers.tsx`, `routing/`, `layout/` | 앱 조립, 라우트, 프로바이더, 공통 레이아웃 |
| `features/auth` | 로그인·콜백·활동지역, 세션 상태와 인증 API |
| `features/home` | 회원 홈과 `/`·`/about`에서 공유하는 공개 랜딩페이지 |
| `features/about` | 공개 안내와 역사관 6개 메뉴. `heritage/`에서 공통 페이지·자료 연결·사진 확대를 재사용하며 현 임원도 같은 공개 자료를 읽음. 소개·조직 설명은 `features/home`의 공개 랜딩페이지에서 제공 |
| `features/boards` | 게시글·댓글·첨부 |
| `features/directory` | 권한 범위 내 명부 |
| `features/profile` | 프로필·납부내역·회원상태 |
| `features/events` | 부고·결혼·개원 텍스트 초안·미리보기·게시; 목록·상세는 boards |
| `features/admin` | 승인·거절·명부 동기화, 게시글·가린 글 관리 연결, 관리자 기초 통계 |
| `features/search` | 게시글·명부 검색 |
| `features/legal` | 법적 고지 |
| `server/modules/*/routes.ts` | 도메인별 HTTP 처리; 기존 파일은 순서대로 등록 |
| `server/modules/*/storage.ts` | 도메인별 저장 구현; 기존 파일은 단일 facade |
| `server/modules/identity` | 회원 계정, OAuth state, 세션, 종료/가입 잠금 |
| `server/modules/registry` | 명부, 별칭, 대기 신청, 승인·거절 |
| `server/modules/content` | 콘텐츠 라우트/저장 |
| `server/modules/events` | 경조사 업무·초안·게시·호출 제한 |
| `server/modules/dues` | 내부 납부 기록과 권리회원 계산 |
| `server/modules/statistics` | 관리자 전용 기존 데이터 읽기 집계. 회원·명부·게시글 원문 및 회비 판정은 가져오지 않음 |
| `server/integrations` | 외부 통신·응답 검증 |
| `server/middleware`, `server/lib` | 서버 공통 기반 |
| `server/db/schema/index.ts` | 영속성; 기존 경로는 서버 전용 호환 export |
| `shared/contracts` | 독립 JSON 계약, Zod 검증 |
| `shared/domain` | 브라우저 안전 순수 정책 |
| `shared/heritage` | 공개 JSON·자료 타입·날짜 표시·연도별 묶음·공통 메뉴. DB·회원 자료와 분리 |

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
- `server/lib/route-context.ts`는 인증·명부의 실제 테스트 주입 계약을 조립하는 명시적 composition 예외다. 경조사 상위 주입 옵션은 두지 않고 기본 수집기·회원별 호출 제한기(60초당 10회)·60초 수집 제한을 조립한다. `RouteContext`의 `readSources`·`eventParseLimiter`·`eventParseTimeoutMs`와 경조사 수정 라우트의 직접 주입 계약은 유지한다. 기본 수집기 factory는 `readEventSources(input, undefined, signal, noticeType)`를 호출하며 루트 라우트 파일에서 재내보내지 않는다. 수집기 자체의 fetch/provider 등 실제 주입 계약은 별개로 유지한다.
- `shared/contracts`, `shared/domain`은 서버·DB·Node에 의존하지 않는다.
  클라이언트는 타입 전용 import도 `shared/schema`에서 가져오지 않는다.
- 서버에서 `@shared/schema`를 쓰는 기존 호출부는 호환 기간 동안 허용한다.
  새 영속성 코드는 `server/db/schema`를 사용한다. 기존 shared utility 경로도 호환 export다.
- DTO의 JSON 날짜는 문자열이다. 서버 내부 Drizzle 날짜와 브라우저 DTO를 혼용하지 않는다.

## 보존 계약 목록

### 브라우저 경로

`/`, `/login`, `/kakao-callback`, `/onboarding/region`, `/terms`, `/privacy`,
`/about`, `/about/executives`, `/about/presidents`, `/about/heritage`,
`/about/heritage/officers`, `/about/heritage/awards`, `/about/heritage/donations`, `/about/heritage/albums`,
`/about/bylaws`, `/about/bylaws/regulations`,
`/about/join`, `/about/dues`, `/about/condolence`, `/admin`, `/b`, `/directory`,
`/profile`, `/search`, `/p/:id`, `/post/:id`, `/p/:id/edit`를 제공한다.
통합 정책에 따라 `/b/write/:type`를 추가하고 `/o`, `/events`와 그 하위 경로는 제거한다.

- `/about`은 로그인 여부와 관계없이 기존 공개 홈 랜딩페이지를 직접 표시한다. `/heritage` 화면·라우트는 제거한다.
- 공개 메뉴는 `동문회(/about) · 역사관(/about/heritage) · 공지(/b)`다. 동문회 하위는 임원명단·회칙·규정·회원가입·회비·경조사이며 PC·태블릿·모바일 모두 `app/layout/nav-items.ts`를 사용한다. 공지의 회원 인증과 회원 메뉴는 유지한다.
- `/about/intro` 페이지와 `/history` 별칭은 삭제하고 리다이렉트 없이 기존 미등록 경로 처리를 따른다. 기존 내부 링크는 각각 `/about`과 `/about/heritage`로 바꾸며 두 경로는 공개 메타데이터·사이트맵에서 제외한다.
- 역사관 하위 메뉴는 공통 정의를 사용하고 기존 `/about/presidents`를 포함한다. 사진첩의 `year`는 최근 5년·연도·전체 목록을 선택하고 `album`은 상세 앨범을 선택한다. canonical은 각 메뉴 경로를 사용한다.
- `/info → /about`
- `/executives`, `/officers → /about/executives`; `/bylaws → /about/bylaws`
- 회원의 활동지역 미입력 시 `/onboarding/region` 이동, 관리자 진입 제한을 유지한다.

### API 소유권·등록 순서

| 순서/소유자 | 경로와 계약 |
|---|---|
| identity | POST `/api/auth/logout`, GET `/api/auth/kakao/start`, POST `/api/auth/kakao/authorize`, POST `/api/users/activity-region`, GET `/api/auth/me`, PATCH/DELETE `/api/users/me` |
| dues 회원상태 | GET `/api/membership/status` |
| events | 인증된 `/api/posts/notices`: POST `/drafts/:type`, PATCH/DELETE `/:id`, POST `/:id/generate`(호출 제한), POST `/:id/publish`, POST `/:id/edit-preview`, PATCH `/:id/edit`. content보다 먼저 등록 |
| content | 모든 `/api/posts`·`/api/categories`·`/api/comments`에 회원 인증. GET/POST `/api/categories`, GET/POST `/api/posts`, GET `/api/posts/search`·`/api/posts/hidden`을 동적 상세보다 먼저 등록. GET/PATCH/DELETE `/api/posts/:id`, PATCH `/api/posts/:id/visibility`, GET/POST `/api/posts/:postId/comments`, DELETE `/api/comments/:id` |
| registry | GET `/api/alumni` |
| dues 납부 | GET `/api/payments/user/:userId`, POST `/api/payments` 관리자 보호 |
| statistics | GET `/api/admin/statistics?from=YYYY-MM-DD&to=YYYY-MM-DD`, 공통 관리자 guard를 라우트에 직접 적용. 현재 현황과 한국시간 기간별 게시글 건수만 반환, HTTP `no-store` |
| registry 관리자 | `/api/admin` 관리자 middleware, GET `/pending-registrations`, PATCH `/pending-registrations/:id`, POST `/sync-alumni/preview`, POST `/sync-alumni`, GET `/test-google-sheets` (모두 `/api/admin` 접두사) |
| object storage | PUT `/api/uploads/:uploadToken`, POST `/api/uploads/request-url`, GET `/objects/:objectPath(*)` |

권한·제품 계약은 계획서, 실제 경로·응답은 도메인별 라우트 코드와 계약을 함께 확인한다. 테스트의 과거 통과를 현재 실계정 동작 확인으로 대신하지 않는다.
일반 글 수정·삭제는 작성자만, 가리기/다시 표시하기는 관리자만 처리한다. 경조사 정정은 기존 초안 API와 별도 서명 미리보기·확인 흐름이다.
`ClientUser`, 관리자 pending DTO, 최소 명부 DTO는 원문 사용자·신청·연락처를 대신 노출하지 않는다.
명부 응답의 `DirectoryAlumni`·`DirectoryResult`는 `shared/contracts/directory.ts`에서 정의하고 서버·명부·검색 화면이 함께 사용한다. 이름·기수 검색과 회원별 열람 범위는 서버가 판단한다.
회원 경조사 목록/상세에는 `sourceText`를 포함하지 않는다.

### 캐시와 정적 자산

- HTTP 실패 처리는 `client/src/lib/queryClient.ts`의 공통 요청을 사용한다. 조회 실패는 공통 `QueryError`로 안내하며 로딩·빈 결과·정보 부족·권한 부족과 구분한다. query key는 유지하고 아래 변경 후 갱신 범위를 적용한다.
- auth: `/api/auth/me`는 AuthProvider의 직접 fetch/상태 관리로 유지한다 (Query cache로 전환하지 않음).
- boards: `["/api/categories"]`, `["/api/posts", category 또는 undefined, "hidden" 또는 "visible"]`,
  `["/api/posts", postId]`, `["/api/posts", postId, "comments"]`
- search: `["/api/posts/search", searchTerm]`, `["/api/alumni", searchTerm]`
- directory: `["/api/alumni"]`
- events: 작성자 초안은 직렬 요청과 revision으로 관리; 게시 후 공통 `refreshPosts()`로 목록·상세·검색 무효화 및 입력 초기화. 일반 글 게시·관리도 같은 갱신 경로를 사용한다.
- profile: `["/api/payments/user", userId]`, `["/api/membership/status"]`; 활동 지역 변경 성공 시 `["/api/alumni"]`로 시작하는 명부 목록·검색 캐시를 제거해 새 열람 범위로 조회한다.
- admin: `["/api/admin/pending-registrations"]`, `["/api/admin/test-google-sheets"]`, `["/api/admin/statistics", from, to]`. 통계는 탭 진입·기간 변경·수동 새로고침에 조회하고 조회 시각을 표시한다. 승인/거절·명부 동기화와 공통 게시글 갱신 후 통계 캐시도 무효화한다. Sheets 연결 조회는 동문 데이터 탭에서만 활성화하며 기존 동기화 미리보기 상태는 탭 이동 후에도 유지한다.
- 로그아웃: 서버 세션 종료 성공 뒤 회원 상태·조회 캐시를 비운다. 실패 시 오류를 표시하고 재시도할 수 있게 한다.
- 인가 흐름은 `/api/auth/kakao/start` → `/kakao-callback` → `/api/auth/kakao/authorize`다. 활동지역 저장은 `activityRegion`만 사용한다. 실제 소비자가 없는 callback 별칭·입력 별칭은 유지하지 않는다.

`attached_assets`, `client/public` 파일은 보존한다. `/objects/*`는 회원 전용·no-store이고 게시글 SEO는 내용을 포함하지 않는 공통 메타데이터다.
Vite 산출물은 `dist/public`, 서버 번들은 `dist/index.js`; `server/vite.ts`의 실행 위치별
정적 파일 처리와 `server/seo.ts`를 유지한다.

### 트랜잭션·외부 호출

동일 신원/전화번호 잠금, 명부 claim, OAuth generation 검증과 로그인 세션 회전을 유지한다.
OAuth state 만료 기간은 `KAKAO_OAUTH_STATE_TTL_MS` 한 곳에 정의하고 실제 SQL과 검사 대역이 공유한다. 실제 발급 시각은 기존 DB 시각을 사용한다.
탈퇴·거절은 외부 Kakao unlink 확인 후 로컬 정리하며, 관련 세션·참조·종료 marker는 기존
트랜잭션 안에 둔다. 명부 동기화는 원본 fingerprint 재검증, advisory lock과 단일 transaction,
DB-only 행 보존을 유지한다. 테스트는 실제 Google Sheets 적용이나 Kakao unlink를 하지 않는다.
Object Storage의 세션 검증, MIME·크기 제한, non-image octet-stream/nosniff를 유지한다.
첨부 오류는 처리 단계·오류 종류·확인 가능한 HTTP 상태만 공통 로그 함수에 남긴다. 원시 SDK 오류/응답·파일 경로·인증정보는 기록하지 않으며 로그 실패가 원래 오류 처리를 덮지 않게 한다.

## 본문·공통 표시

본문 JSON 계약은 `shared/contracts/post-document.ts`, 공식 스키마·변환은 `shared/editor/post-document.ts`, 편집 UI·표시는 `client/src/components/post-body-editor.tsx`·`post-body.tsx`가 담당한다. 저장·권한·첨부는 feature와 서버 모듈에 둔다. 경조사 사실 JSON과 본문 JSON을 합치지 않는다. 사이트 이름·canonical은 `shared/site.ts`, 공개 페이지 SEO·사이트맵 목록은 `shared/public-pages.ts`, 메뉴는 `client/src/app/layout/nav-items.ts`의 공통 정의를 사용한다.

회원 탐색은 `AppHeader`·`BottomNavigation`, 공개 서랍은 `PublicLayout`이 담당한다. 열기 경로 없는 회원 사이드 메뉴와 전용 상태·항목은 유지하지 않는다. 관리자 진입은 회원 홈에서 제공한다. 공개 문서의 `tp-prose`와 게시글의 `post-body`는 자체 CSS이며, 사용하는 클래스가 없는 루트 Typography 플러그인은 제거한다. sandbox의 별도 구성은 이 정리에 포함하지 않는다.

회원 헤더의 최근 글 버튼은 홈의 `recent-posts-section` 이동을 제공한다. 접근성 이름·툴팁·목록 아이콘을 이 역할에 맞추고, 미읽음 상태가 없는 고정 알림 점은 표시하지 않는다. 알림 조회·발송 기능은 이 버튼의 계약에 포함하지 않는다.

`client/src/lib/analytics.ts`는 운영 배포 계층이 제공하는 `window.umami`에 기존 이벤트를 전달한다. 개발에서는 SDK가 없을 수 있어 optional 호출을 유지한다. 앱 내부의 loader 부재와 기능 미사용을 구분하며, 외부 주입 근거는 [Replit 운영 기준](../../replit.md#운영-분석-스크립트)을 따른다.

<a id="개발-사본의-미커밋-변경"></a>

## 책임별 모듈 구성

아래는 통합된 코드의 소유 위치와 보존 계약이다. 앞선 작업 기록이 참조하는 기존 절 앵커는 유지한다.

| 위치 | 책임과 보존 계약 |
|---|---|
| `server/modules/identity/` | `routes.ts` 등록, `kakao-authorization.ts` OAuth 상태·진행, `kakao-profile.ts` provider 응답, `kakao-login.ts` 회원 매칭·가입 대기, `kakao-login-session.ts` 회원 동기화·세션 확정, `profile-routes.ts` 본인 정보·탈퇴, `session.ts` 세션 지원. state 소비·세션 저장·unlink 순서를 유지한다 |
| `server/modules/registry/` | 명부 조회·연결, 열람 범위, 가입 심사, Sheets preview/apply를 각각 소유한다. 트랜잭션·잠금과 storage facade의 단일 receiver를 유지한다. 동기화 결과는 preview/apply 응답으로 제공하며 별도 진행상황 API는 두지 않는다 |
| `features/admin/` | 승인·명부 동기화의 요청 훅과 표시 패널. 훅은 탭 밖의 페이지 수명을 유지한다 |
| `features/boards/` | 목록·작성·수정·상세 화면, 댓글과 관리 요청 훅·표시 컴포넌트. `use-create-post.ts`가 초안 초기화·업로드 묶음·게시 요청 수명을 관리한다. 작성자 수정·삭제와 관리자 가리기를 구분한다 |
| `components/post-editor/` | 공식 Tiptap·JSON 동기화, Markdown 원본 보존, 링크·서식 도구, 클립보드 변환. 공개 진입점은 `post-body-editor.tsx`다 |
| `features/events/` | `notice-composer.tsx` 화면, `use-notice-composer.ts` 초안 수명·직렬 요청·자동 저장. revision·최신 ref·이탈 저장 순서를 유지한다 |
| `server/modules/events/` | `notice-extraction-contract.ts`는 AI 추출 지침·요청 JSON Schema·응답 형태, `notice-extraction.ts`는 요청·응답 해석과 정적 추출을 소유한다. `routes.ts`의 초안·생성·게시와 `notice-edit.ts`의 서명 미리보기·수정 순서, URL 우선순위·회원 판정·제한시간을 유지한다 |
| `integrations/public-sources/` | 저장 규칙 → HTML·스크립트 → 익명 API 재호출 → 브라우저 순서. 요청별 예산·관찰·진단 상태를 공유하고 URL 검사·격리·개인정보 경계를 유지한다 |
| `features/legal/` | 약관·개인정보 원문과 각 페이지 SEO를 소유한다. `legal-page.tsx`는 제목·개정일·본문을 받아 기존 PublicLayout·Card·뒤로가기 동작과 스타일을 공유한다 |
| `scripts/lib/browser-cdp.mjs` | 오래된 탭 복구 검사의 CDP 연결·명령·평가·대기. 모바일 비교 도구 폐기에 따라 복구 도구가 사용하는 인수만 유지한다 |

### 공통 계약과 구현 위치

| 영역 | 정본·소비 위치와 보존할 계약 |
|---|---|
| 사이트·표시 | `shared/site.ts`는 이름·canonical, `shared/public-pages.ts`는 공개 페이지 SEO·사이트맵, `shared/association.ts`는 공식 연락처·계좌, `app/layout/nav-items.ts`는 메뉴를 관리한다 |
| 입력·응답 | `shared/contracts/`의 DTO·Zod 검증을 서버와 클라이언트가 공유한다. 일반 글 제목·첨부는 `post-input.ts`, 댓글 검증·타입도 같은 계약 계층이 정본이다. DB 스키마의 재내보내기는 컬럼 변경이 아니다 |
| 이전 글 편집 | 현재 글을 서버에서 읽어 제목 유지·기존 첨부 유지/감소를 구분한다. 경로 문법·열람 권한·작성자·revision 검사는 항상 적용한다. 입력 한도와 수집 결과 한도는 의미가 달라 합치지 않는다 |
| 업로드 | `use-upload.ts`는 파일 입력 → 앱 URL 발급 → PUT을 담당한다. URL 응답은 `uploadURL`·`objectPath`, PUT 성공은 본문 없는 HTTP 200이다. 파일명·크기·MIME·서명·만료·회원 및 첨부 권한은 서버가 확인한다 |
| 인증·가입 | `resolveSessionSecret()`은 호출 시 환경을 읽고 세션·신원 해시가 공유한다. 신원 종류 구분·이메일 정규화·HMAC을 유지한다. 기존/신규 회원의 세션 확정과 충돌의 가입 심사, 승인과 unlink를 포함한 거절 경로를 구분한다 |
| 경조사 | 회원 판정·필수 사실·필드별 출처·정적 문안·서명 미리보기는 각 책임 모듈에 둔다. `readGipoomNotice`는 공개 자료 검증과 작성기 선택을 담당한다. 공통 사실 JSON과 개별 파서의 내부 반환형을 혼동하지 않는다 |
| 스타일 | 공통 UI와 `client/src/index.css`, 편집·표시의 `post-content.css`를 재사용한다. 공개 테마 클래스는 `tp-bg-brand`·`tp-text-body`·`tp-text-accent`처럼 역할로 이름을 정하고 CSS 선언과 소비자를 함께 관리한다. Tailwind 기본 유틸리티를 중복 CSS로 만들지 않는다. 화면 고유 콘텐츠·공개 규정 원문·provider 규격·공식 UI를 값이 같다는 이유만으로 합치지 않는다 |
| 정적 보호 검사 | 브라우저의 서버/DB 참조·개인정보 로그와 DB 운영/보존 설정만 확인한다. UI 문구·CSS·함수 이름/나열 순서·소스 선언 모양을 고정하는 검사는 제거한다. 실행형 검사가 보호하는 동작을 정규식으로 중복 확인하지 않는다 |

세부 입력·게시 정책은 [제품 기준](../product/planning-proposal.md), 본문 확장·변환은 [편집기 기준](../reference/post-editor.md), 업로드·수집 실행 경계는 [위협 모델](threat-model.md)을 따른다. 개별 미사용 필드·분기를 제거한 이유와 당시 확인 범위는 [정리 이력](../history/README.md#코드공통화와-미사용-정리)에 보존한다.

## 파일명·테스트 규칙과 명령

- 프로젝트의 JS/TS/TSX·CSS 서식은 고정 버전 Prettier와 루트 설정을 사용한다. 문자열·SQL·추출 프롬프트 안의 코드는 자동 재작성하지 않는다. `format`은 명시적 정리, `format:check`는 파일만 읽는 검사다. 코드 릴리스 후보에는 [릴리스 전 정리와 검증](../../replit.md#릴리스-전-정리와-검증)에 따라 변경 범위의 서식 검사를 포함한다. 일상 개발에 전체 포맷·빌드를 강제하거나 Git hook을 자동 설치하지 않는다.
- 로그인 복귀 경로의 저장 키와 소비는 `features/auth/lib/return-path.ts`에서 공유한다. 기존 상대 경로 판정·기본 홈·저장 항목 제거 순서와 저장소 오류 시 흐름을 유지한다.
- 큰 OAuth 라우트 검사는 `identity/testing/`의 공통 대역과 주제별 등록 함수로 나누고 기존 `.test.ts` 진입점에서 원래 순서대로 등록한다. 인증·세션·권한·개인정보 계약과 실행 격리 단위를 유지한다. 검사 수나 중복 assertion 자체를 고정하지 않는다.
- 신규 파일은 `kebab-case.ts(x)`. 기존 생성 UI와 `queryClient.ts` 같은 공용 호환 파일은 일괄 이름 변경하지 않는다.
- 순수 로직/서버 테스트는 구현 옆 `*.test.ts`, 클라이언트 동작은 기능의 `__tests__`, 전역 보안·저장소 facade 계약은 `server/tests`에 둔다. UI source-contract 파일은 제거했다. `security-source-contract.test.ts`는 Drizzle session 제외와 결제 익명 보존 설정만 읽고 앱/DB를 실행하지 않는다.
- `scripts/run-tests.mjs`는 client/src, server, shared를 재귀 탐색한다.
  `artifacts/mockup-sandbox`는 별도 package/lock/toolchain을 유지하며 루트 앱 테스트·타입·빌드에 섞지 않는다.
- 검사별 명령·목적·실행 조건·환경·부수 효과와 결과 재사용은 [검사 카탈로그](../runbooks/feature-checks.md)를 따른다. 공통 필수 검사에 영향받는 선택 검사를 더하며 파일 탐색 목록을 전체 실행 지시로 사용하지 않는다.

경계 검사는 정적 import/export와 literal dynamic import를 대상으로 한다.
동적으로 계산한 import 문자열, DI의 의미적 의존성, HTTP 권한을 증명하지 않는다.
개발 직후에는 필요한 정적 검사만 수행한다. 릴리스 후보에는 코드·문서와 [불필요·중복·과잉 검사](../../replit.md#불필요중복과잉-검사-정리)를 정리한 뒤 카탈로그의 적용 조건으로 검사를 선택한다. 결과는 최종 소스·검사 기준과 연결하고 실행 권한은 [릴리스 규칙](../../replit.md#릴리스-전-정리와-검증)을 따른다. 스키마·실데이터 변경은 정적 검사에 포함하지 않는다.

## 보존 파일과 제거된 경로

| 대상 | 현재 유지 근거 |
|---|---|
| `shared/schema.ts`·`birthday.ts`·`category-policy.ts`·`alumni-sync.ts` | 기존 import 소비자가 있는 호환 export. 서버용 스키마는 브라우저에서 가져오지 않음 |
| 단일 storage facade receiver | 도메인 메서드의 내부 `this` 호출과 실제 메서드 교체 계약 |
| OCR 언어 자료·Tiptap bubble-menu/pm·`@types/pg` | worker 동적 로딩·공식 확장의 peer 관계·서버 타입 소비 |
| `attached_assets/`·`client/public/` | 공통 로고·공개 홈 등 실제 사용 자산. 별도 요청 없이 정리하지 않음 |
| `artifacts/mockup-sandbox` | 목업 0개여도 사용 중인 Replit 설계 미리보기 서비스. 별도 package/lock/toolchain·실행 구성 유지 |
| 작성기 원본·DB SQL/migration·ADR·릴리스 기록 | 출처·변환·결정·운영 결과의 근거. 새 실행 지시와 구분 |

레거시 부고·경조사 전용 화면과 `/o`·`/events`, 회원 전용 heritage 목업은 통합 정책에 따라 제거됐다. 옛 경로 호환을 다시 추가하지 않는다. 사용하지 않는 UI·의존성·내부 필드의 개별 삭제 목록은 [정리 이력](../history/README.md#코드공통화와-미사용-정리)에서 확인한다.

구조 개편 당시 이동과 검사 결과는 [2026-10-20 기록](../history/structure-validation-2026-10-20.md), 이후 실제 배포 범위는 [릴리스 기록](../history/replit-2026-11-09.md)을 따른다.
