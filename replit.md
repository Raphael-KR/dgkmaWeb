# Replit 개발 및 배포 운영

현재 환경·설정·운영 절차의 기준서다. 제품 정책은 [계획서](./planning_proposal.md), DB 구조와 직접 작업은 [스키마](./docs/database-schema.md)·[DB 런북](./docs/database-operations.md)을 따른다. 날짜별 승인·실행·검사 결과는 [개발·릴리스 이력](./docs/history/replit-2026-11-09.md)에 보존한다. 과거 작업의 제외 범위는 해당 작업에만 적용한다.

## 현재 적용 상태

2026-11-09 문서 정리의 소스 기준은 `main d7184ca5238e0cdc3e91515ac0616e3b33332f41`다. 아래 운영 결과는 이미 완료된 릴리스 기록이며 이번 문서 작업에서 운영 환경을 다시 조회하거나 배포한 결과가 아니다.

| 구분 | 마지막 확인 상태 | 근거 |
|---|---|---|
| Git 통합 | PR #28 main 병합 `b276334a14665b3a396d199c7f9a3e0c9055d19c`; 후속 게시·문서 기록 포함 main `d7184ca` | [PR #28](https://github.com/Raphael-KR/dgkmaWeb/pull/28) |
| 로컬·Replit 개발 | 문서 정리 시작 시 main `d7184ca`, 추적 파일 변경 없음. 개발 적용과 운영 게시를 구분한다 | [URL 정정 완료 기록](./docs/history/replit-2026-11-09.md#url-정정-릴리스-완료-결과) |
| 마지막 운영 릴리스 | 2026-11-09 21:53:21 KST 성공 관찰; Replit 게시 커밋 `a75f4d830d40e11b71762bfd36cc249f215bd3b5`, 병합 후보와 같은 tree `1fe18b36f0089fe46eeb2019b241d3cc22880df2` | 같은 완료 기록 |
| 마지막 운영 확인 | 21:54:15 KST 비로그인 HTTP·인증 차단·정적 자산 26건. 실계정 QA는 계속 보류 | 같은 완료 기록 |
| DB 구조 | 개발·운영 모두 posts 통합, content JSONB, is_hidden, source_collection_rules 적용. 구 테이블 2개 제거 | [마지막 catalog와 현행 구조](./docs/database-schema.md#기준-소스와-마지막-db-관찰) |

운영 코드에는 통합 게시판·수집기·경사 보완, 반응형·공통 표시·공개 메뉴, canonical 통일, Tiptap JSONB, 작성자 수정·삭제·관리자 가리기, 경조사 URL 정정이 포함돼 있다. `/`와 `/about` canonical은 `https://dgkma.org/`이며 하위 공개 페이지는 각자의 주소다. 이후 문서만 변경한 커밋을 앱 재게시와 혼동하지 않는다.

실제 URL 교체 확인은 Replit에서 저장소·수집·LLM을 메모리 대역으로 둔 18개 사례다. 실제 회원의 게시글 변경이나 외부 수집·OpenAI 호출을 검증한 결과가 아니다. 범용 수집의 실제 실행 범위와 미확인 경로도 이력의 각 결과를 따른다.

## 환경 구분

| 환경 | 역할 | 홈페이지 | 코드 반영 | 데이터베이스 |
|---|---|---|---|---|
| 로컬 Mac | Git 작업과 코드 편집 | 해당 없음 | GitHub와 pull/push | 운영 DB 작업에 사용하지 않음 |
| Replit 개발 워크스페이스 | 기능 개발과 필요한 정적 검사 | `https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev` | GitHub `main`을 pull | Development Database |
| Replit 프로덕션 배포 | 공개 서비스 | `https://dgkma.org` | Deployments에서 Republish | Production Database |
| 프로덕션 SQL 콘솔 | 운영 데이터·스키마 확인 | 해당 없음 | 해당 없음 | Production Database에 직접 연결 |

- 개발 홈페이지: `https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev`
- 운영 홈페이지: `https://dgkma.org`
- 보조 접근 도메인 `https://dgkma.replit.app`은 공개 홈페이지 주소와 구분하며, 카카오 OAuth callback·redirect 설정에는 사용하지 않습니다.
- Replit SSH는 `/home/runner/workspace` 개발 워크스페이스 접속입니다.
- SSH로 접속한 셸은 autoscale 프로덕션 인스턴스의 셸이 아닙니다.
- SSH 프로세스는 Replit Secret의 `PROD_DATABASE_URL`을 명시적으로 선택할 때 Production Database에 직접 연결할 수 있습니다. 개발 중 반복되는 운영 스키마·데이터 작업을 위해 Secret은 유지하되 기본 연결로 사용하지 않습니다.
- 개발 DB에 적용한 SQL과 seed는 프로덕션 DB에 자동 반영되지 않습니다.
- 개발·운영 DB 직접 연결과 안전한 변경 절차는 [데이터베이스 운영 런북](./docs/database-operations.md)을 따릅니다.
- 현재 DB 구조의 기준은 [docs/database-schema.md](./docs/database-schema.md)입니다.

### 개발 중 확인 원칙

구현은 Replit 개발 워크스페이스를 기본으로 하며 개발 직후 점검은 필요한 정적 검사로 최소화합니다. 코드 반영마다 서버 재시작·브라우저 점검·smoke check를 요구하지 않습니다.

## GitHub 동기화

GitHub의 `main` 브랜치를 공유 소스 기준으로 사용합니다.

작업 전 상태를 확인합니다.

```bash
git status --short --branch
git fetch origin main
```

작업 파일이 없고 로컬이 뒤처진 경우에만 fast-forward pull을 사용합니다.

```bash
git pull --ff-only origin main
```

로컬 변경이 있으면 먼저 변경 범위를 확인해 커밋하거나 별도 브랜치에서 정리합니다. 사용자 자료와 무관한 untracked 파일을 일괄 추가하지 않습니다.

Replit 개발 워크스페이스도 같은 방식으로 GitHub 커밋을 가져옵니다. SSH 접속 명령과 공개 키 등록은 Replit 사용자 설정에서 관리하며 개인키 내용은 저장소나 문서에 기록하지 않습니다.

## 환경변수

환경변수 값은 Replit Secrets에서 관리합니다. 이 문서에는 이름만 기록합니다.

### 필수 서버 설정

- `DATABASE_URL`
- `SESSION_SECRET`
- `KAKAO_DEV_REST_API_KEY`
- `KAKAO_DEV_CLIENT_SECRET`
- `KAKAO_DEV_REDIRECT_URI`
- `KAKAO_PROD_REST_API_KEY`
- `KAKAO_PROD_CLIENT_SECRET`
- `KAKAO_PROD_REDIRECT_URI`
- `KAKAO_DEV_ADMIN_KEY`
- `KAKAO_PROD_ADMIN_KEY`
- `KAKAO_DEV_ADMIN_USER_IDS`
- `KAKAO_PROD_ADMIN_USER_IDS`
- `PRIVATE_OBJECT_DIR`

Replit은 이 프로젝트에 하나의 App Secrets 창을 제공합니다. `REPLIT_DEPLOYMENT="1"`이면 프로덕션 설정을 선택하고, 그 외 모든 값이면 개발 설정을 선택합니다. Secret 값 자체는 이 문서에 기록하지 않습니다.

### 현재 동문 명부 연동

- `ALUMNI_SPREADSHEET_ID`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`

Google Sheets를 동문 명부의 **관리 원본**으로 유지하며, PostgreSQL `alumni_database`는 로그인·가입 심사에 사용하는 **런타임 복제본**입니다. 이 경계는 사용자가 최종 원본 전환을 선언할 때까지 유효합니다. 로그인 요청 자체는 Google Sheets를 조회하지 않으며, 관리자가 명시적으로 실행하는 동문 명부 동기화 기능으로 PostgreSQL 복제본을 갱신합니다. 관련 Secrets와 동기화 기능은 사용자가 PostgreSQL 단독 원본 전환을 명시적으로 선언할 때까지 유지합니다. 행 원문·개인정보·Secret 값은 문서에 기록하지 않습니다.

### 경조사 생성·수집 설정

- `OPENAI_API_KEY`: 서버의 Responses API 호출에 사용한다. 브라우저·`VITE_` 변수에 넣지 않는다.
- `OPENAI_NOTICE_MODEL`: 생략하면 코드 기본값 `gpt-6-luna`를 사용한다. Structured Outputs와 호환되는 모델을 명시할 때만 설정한다.
- `COLLECTOR_CHROMIUM_PATH`: 설치된 Chromium 실행 파일을 별도로 지정할 때 사용한다. 미설정이면 런타임 PATH에서 찾는다.

키 존재·실제 호출 성공·생성 성공은 서로 다른 상태다. 실제 호출과 수집은 해당 범위가 요청된 경우에만 수행한다.

### 선택 운영 설정

- `APP_URL`
- `DEBUG_KAKAO_AUTH`
- `PUBLIC_OBJECT_SEARCH_PATHS`
- `VITE_KAKAO_CHANNEL_URL`

쓰기 권한이 있는 `PROD_DATABASE_URL`은 정식 오픈 전 개발 기간에는 Replit Secrets에 유지합니다. 단, 존재 자체가 운영 변경 승인을 뜻하지 않으며 일반 개발·앱 실행·테스트에서는 Development Database를 기본으로 사용합니다. 운영 작업은 명시적인 명령, 대상 DB와 변경 전후 건수 확인, 가능한 트랜잭션 적용을 거쳐야 합니다. 반복적인 운영 조회에는 가능하면 별도 읽기 전용 역할의 `PROD_DATABASE_READONLY_URL`을 사용합니다. owner URL은 사용자가 반복적인 운영 스키마·데이터 작업 종료 또는 오픈 전 보안 강화를 명시적으로 선언한 뒤 제거합니다.

`DEBUG_KAKAO_AUTH`를 활성화해도 전체 키, 토큰, 인가 코드, 개인 정보를 로그에 남기지 않습니다.

## 카카오 로그인

현재 로그인은 카카오 REST authorize URL을 사용하며 브라우저 SDK 기반 로그인은 사용하지 않습니다.

- 브라우저 로그인 시작: `/api/auth/kakao/start`
- 서버가 선택하는 개발 설정: `KAKAO_DEV_REST_API_KEY`, `KAKAO_DEV_CLIENT_SECRET`, `KAKAO_DEV_REDIRECT_URI`
- 서버가 선택하는 프로덕션 설정: `KAKAO_PROD_REST_API_KEY`, `KAKAO_PROD_CLIENT_SECRET`, `KAKAO_PROD_REDIRECT_URI`
- 개발 callback: `https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev/kakao-callback`
- 프로덕션 callback: `https://dgkma.org/kakao-callback`

브라우저는 Kakao Secret이나 redirect URI를 선택하지 않습니다. 서버만 `REPLIT_DEPLOYMENT` 값에 따라 REST API key, client secret, redirect URI를 선택하며, 선택된 callback은 해당 환경의 Kakao 설정과 문자열까지 정확히 같아야 합니다.


서버의 authorization request와 token exchange는 `REPLIT_DEPLOYMENT`로 선택한 동일한 환경 config의 REST API key와 redirect URI를 사용해야 합니다.

카카오 어드민 키는 서버의 회원 탈퇴 및 가입 거절의 카카오 연결 해제에서만 `/v1/user/unlink` 호출에 사용합니다. `KAKAO_DEV_ADMIN_KEY`와 `KAKAO_PROD_ADMIN_KEY`도 `REPLIT_DEPLOYMENT="1"` 규칙으로 선택하며, 브라우저·`VITE_` 변수·로그·오류 메시지·저장소 파일에 노출하지 않습니다.

관리자 계정 복구용 `KAKAO_DEV_ADMIN_USER_IDS`와 `KAKAO_PROD_ADMIN_USER_IDS`에는 각 환경에서 카카오가 인증한 숫자형 회원번호를 쉼표로 구분해 저장합니다. 로그인 callback의 카카오 회원번호가 현재 환경의 allowlist와 정확히 일치하면 서버가 해당 회원의 `isAdmin=true`를 복구합니다. 값이 없으면 아무도 자동 승격하지 않고, 잘못된 형식은 값 원문을 노출하지 않은 채 실패합니다. allowlist에 없다는 이유로 기존 관리자 권한을 자동 회수하지는 않습니다.

## 경조사 런타임과 수집 경계

- 서버 실행은 프로젝트 루트 `/home/runner/workspace` 기준이다. `.replit`의 Node·Python·Chromium 구성과 lockfile을 함께 사용한다. Python 3.10+와 `Asia/Seoul` 시간대 자료, `server/modules/events/writer/`의 Python 파일이 필요하다. Mac 스킬 경로는 출처 기록이며 런타임 의존이 아니다.
- 텍스트·정정 해석은 서버 Responses API Structured Outputs를 사용하고 `store: false`를 지정한다. 기본 모델은 코드의 `gpt-6-luna`다. 정적 자료로 충분한 경로는 불필요한 LLM 호출을 하지 않는다.
- 수집은 PostgreSQL 저장 규칙·공개 API → HTML/메타데이터/JSON-LD/초기 상태 → 연결 JavaScript → Playwright Fetch/XHR 관찰·렌더링 → iframe/Shadow DOM/펼침/탭/지연 로딩 → 필요한 이미지 OCR 순서다. 유형별 본문·구조화 사실을 확보하면 후속 단계를 생략한다.
- `playwright-core 1.65.0`, `tesseract.js 7.0.0`, 한국어·영어 자료 각 `1.0.0`을 사용한다. 브라우저는 별도 프로세스·일회성 컨텍스트에서 Chromium sandbox를 켜고 실행하며 Secrets·DB·회원 세션을 전달하지 않는다. 별도 Linux namespace·컨테이너 관리 계층이나 VM 수준 격리는 없다.
- 앱의 공개 요청 중계가 URL·DNS·리다이렉트·하위 요청을 검사하고 주소를 고정한다. 쿠키·Authorization·로그인·CAPTCHA 우회를 사용하지 않는다. API 직접 재조회·규칙 저장은 실제 페이지와 대응하는 인증 없는 GET으로 한정한다.
- 전체 55초, 브라우저/OCR 35초, 요청 90회·총 32MiB, 개별 데이터 512KiB·자산 8MiB, JSON 관찰 12개, 프레임 6개·상호작용 8회·OCR 3개, 동시 브라우저 2개로 제한한다. Node/renderer heap 설정은 전체 OS 메모리 제한을 뜻하지 않는다.
- 규칙 정본은 PostgreSQL JSONB이며 앱 서버만 읽고 쓴다. 구조가 맞지 않으면 재탐색하고 필드별 출처와 사용자 정정 우선순위를 유지한다. 본문·개인정보·페이지 ID 실값·쿠키·토큰은 규칙에 저장하지 않는다.
- 운영 Chromium/OCR 가용성을 실제 실행으로 확인한 기록은 없다. 과거 개발 Preed 한 링크의 API 발견·저장·재사용 성공은 다른 사이트·경사·OCR의 성공 근거가 아니다. 상세는 [수집 기록](./docs/history/replit-2026-11-09.md#개발-수집-적용-결과-2026-11-09)과 [경사 확인 범위](./docs/history/replit-2026-11-09.md#적용-결과와-확인-범위)를 따른다.

## 본문 편집기와 업데이트 기준

- 기존 Tiptap core/react/pm/starter-kit/markdown/bubble-menu `3.33.0`과 같은 버전의 무료 `@tiptap/static-renderer`를 사용한다. [StarterKit](https://tiptap.dev/docs/editor/extensions/functionality/starterkit), [MarkdownManager](https://tiptap.dev/docs/editor/markdown/api/markdown-manager), [Static Renderer](https://tiptap.dev/docs/editor/api/utilities/static-renderer)의 공개 API를 재사용한다. 공식 패키지와 단축키는 수정하지 않는다.
- 서비스 정의는 H1~H4 범위·기존 안전 링크 설정·JSON 입력 제한·일반 텍스트 추출, HTML 소스/Markdown 붙여넣기 연결, 선택 도구 UI와 Markdown 손실 안내다. StarterKit의 기본 코드·밑줄·인용·구분선·목록·실행 취소/다시 실행을 사용하고 별도 키 조합·사용자 정의 노드/마크는 추가하지 않는다.
- `StarterKit.configure({ trailingNode: false })`로 자동 끝 문단 삽입만 끈다. 공식 기본 플러그인은 본문을 바꾸지 않는 포커스 전환 트랜잭션에서도 끝 문단을 추가할 수 있어, JSON을 열거나 Markdown 보기로 전환하는 동작의 원본 보존 계약과 맞지 않는다. 공식 설정을 사용하며 기본 명령·단축키는 유지한다. 업데이트 시에도 비편집 동작의 문서 변경 여부를 확인한다.
- 업데이트 시 패키지 버전을 함께 맞추고 JSON 노드/마크·기본 속성, `getSchema`·`nodeFromJSON/check`·Markdown parse/serialize·React 정적 표시, 기본 단축키·선택 도구 포커스, HTML 스키마 처리·링크 제한과 Markdown 왕복 손실 판정을 확인한다. Markdown 기능은 공식 Beta 계약이므로 미지원 문서를 조용히 축소하지 않는다.
- Markdown 보기·복사는 JSON을 보존한다. 왕복이 같은 문서일 때만 바로 수정할 수 있고, 다르면 읽기 전용 변환본과 손실 안내를 제공한다. `변환본으로 편집`을 선택해도 실제 입력 변경 전까지 원본을 유지한다. 새 Markdown 입력에서 실패하면 마지막 유효 JSON을 보존하고 게시를 막아 수정 내용을 모르게 잃지 않게 한다.
- 지원 밖 Markdown 표·작업 목록·이미지·임의 HTML 구문은 조용히 삭제하지 않고 입력 오류로 알린다. 밑줄은 공식 Underline 토크나이저와 `<u>` 직렬화를 사용한다. HTML 붙여넣기는 공통 스키마로 처리하며 본문 내 이미지 대신 기존 첨부 기능을 유지한다. 빈 문단·목록 속성 등 Markdown 왕복으로 달라지는 구조는 위 손실 판정 대상이다.

## 데이터베이스 운영

직접 접속·대상 선택·백업·변경·catalog 확인은 [DB 런북](./docs/database-operations.md)을 따른다. 문서·앱 코드 변경만으로 DB에 접속하거나 운영 스키마를 적용하지 않는다. `server/db.ts`의 개발 PG* 우선순위와 Drizzle CLI의 `DATABASE_URL` 선택은 서로 다르다.

### 정식 오픈 전 데이터 정책

사용자가 데이터 보존을 선언하기 전까지 양쪽 DB의 애플리케이션 레코드는 개발 목적의 초기화가 가능한 테스트 데이터다. 개별 작업의 보존 요청을 우선한다. 초기화 전 대상·FK 의존 관계·유지할 데이터를 정하고, 가능한 트랜잭션과 새 연결의 건수 확인을 사용한다.

스키마·테이블 삭제, Secrets 삭제, Git 이력 변경, Object Storage 파일 삭제는 이 사전 승인에 포함되지 않는다. 사용자 보존 선언이 있으면 초기화를 멈추고 정책부터 갱신한다. 상세 대상은 [초기화 절차](./docs/database-operations.md#정식-오픈-전-초기화)를 따른다.

### 스키마 변경

`session`은 `connect-pg-simple`·앱 시작 DDL이 관리하고 `drizzle.config.ts`의 `tablesFilter: ["!session"]`로 제외한다. `npm run db:push`는 정적 검사가 아니며 승인된 개발 스키마 작업에서 대상과 diff를 검토한 경우에만 사용한다. 운영은 승인된 SQL·변환 도구로 대상을 명시한다. 완료된 과거 SQL을 매 배포 전에 반복하지 않는다.

## 개발 직후 정적 점검

개발 직후 점검은 변경 범위에 필요한 정적 검사로 최소화한다. Replit에서 타입·의존 경계 변경에는 `npm run check`, JavaScript/TypeScript에는 필요한 파일 범위의 ESLint를 사용한다. 테스트 타입을 바꾼 경우에만 `npm run check:tests`를 추가하며 같은 소스의 통과 결과를 반복하지 않는다.

문서 변경은 내용·상대 링크·기준 간 정합성과 `git diff --check`, 파일 내용만 읽는 기존 문서 계약으로 확인한다.

```bash
node --import tsx --test server/tests/final-recheck-documentation-contract.test.ts
```

전체 테스트·빌드·DB 시험·서버 재시작·브라우저·smoke check를 자동 추가하지 않는다. 빌드는 배포 산출물 작업에 필요한 경우에만 수행한다. ESLint는 공식 JS/TS 권장 규칙과 React Hooks 규칙을 사용하며 [설정](./eslint.config.mjs)·lockfile이 현재 버전의 기준이다. 도입 버전과 한정 예외의 근거는 [ESLint 이력](./docs/history/replit-2026-11-09.md#eslint-도입-2026-11-09)에 보존한다.

## 배포

운영 배포가 명시적으로 승인된 작업에만 적용한다. 개발 DB 변경이나 과거 릴리스 승인을 새 운영 작업의 자동 승인으로 해석하지 않는다. 실계정 QA는 계속 보류하며 별도 요청된 경우에만 실행한다.

1. 배포할 GitHub main·로컬·Replit 후보와 작업 트리를 확인하고 기존 변경을 보존한다.
2. 같은 소스의 필요한 정적 검사 결과를 확인하고 Replit에서 릴리스 빌드를 만든다.
3. DB 변경이 있는 경우에만 [DB 런북의 운영 변경 절차](./docs/database-operations.md#운영-변경)를 따른다. additive 변경과 비호환 본문 변환은 같은 순서로 취급하지 않는다. 백업·preview·코드 호환·적용 순서가 준비된 승인 범위만 실행한다.
4. Replit 커넥터 `publish_app` 또는 승인된 Publishing 조작으로 Republish한다. 웹 DB 검토가 요구되면 승인 범위의 생성 SQL을 검토하며 다른 경로로 우회하지 않는다.
5. 새 후보의 상태 전환과 성공을 확인한다. 기존 deployment ID나 과거 success만으로 새 릴리스 성공을 판단하지 않는다.
6. 비로그인 공개 페이지 HTTP·canonical과 회원 API의 401, 후보 자산 해시를 확인한다. `/api/categories` 비로그인 응답으로 카테고리 seed 내용을 확인할 수는 없다.
7. commit·push·PR·merge·개발 반영·Republish·운영 smoke를 구분해 기록한다. Replit 게시 커밋을 보존하고 문서 전용 후속 기록은 다시 배포하지 않는다.

실패 시 확인된 상태와 원인을 보고한다. 백업 보존은 원복 준비이며 자동 롤백 승인이 아니다. 운영 Secret을 출력하거나 Mac으로 복제하지 않는다.

## 장애 확인 순서

후보 커밋·빌드 결과 → 선택한 DB → Secret 존재 여부 → 게시 상태·해당 HTTP 오류 → 환경별 callback 순서로 필요한 범위만 확인한다. 이미 통과한 전체 검사를 근거 없이 다시 실행하지 않는다. 값·토큰·개인정보는 오류 보고에 포함하지 않는다.

## 과거 적용 기록

| 범위 | 보존 위치 |
|---|---|
| PR #22 게시판 통합·수집·경사·최초 서식 | [릴리스 완료](./docs/history/replit-2026-11-09.md#릴리스-완료-결과) |
| PR #23~25 반응형·공통 표시·공개 메뉴 | [반응형](./docs/history/replit-2026-11-09.md#반응형-릴리스-완료-결과), [공통 표시](./docs/history/replit-2026-11-09.md#공통-표시-릴리스-완료-결과), [공개 메뉴](./docs/history/replit-2026-11-09.md#공개-메뉴-릴리스-완료-결과) |
| PR #26 Tiptap JSONB·canonical | [릴리스 완료](./docs/history/replit-2026-11-09.md#본문-jsonb-릴리스-완료-결과) |
| PR #27 게시글 수정·삭제·가리기 | [릴리스 완료](./docs/history/replit-2026-11-09.md#게시글-관리-릴리스-완료-결과) |
| PR #28 URL 정정·ESLint | [릴리스 완료](./docs/history/replit-2026-11-09.md#url-정정-릴리스-완료-결과) |
| 단계별 DB snapshot·변환·catalog | [DB 작업 이력](./docs/history/database-operations-2026-11-09.md), [구조 이력](./docs/history/database-schema-2026-11-09.md) |

문서 구조를 정리한 범위와 정적 확인 결과는 [문서 정리 기록](./docs/history/documentation-cleanup-2026-11-09.md)에 둔다.
