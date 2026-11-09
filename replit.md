# Replit 개발 및 배포 운영

이 문서는 dgkmaWeb의 현재 GitHub, Replit 개발 워크스페이스, 프로덕션 배포, 데이터베이스 운영 방법을 설명합니다. 제품 비전, 현재 상태와 개발 우선순위는 [제품·개발 통합 계획서](./planning_proposal.md)를 참고합니다.

2026-11-09 확정한 [게시글 통합 정책](./planning_proposal.md#게시글과-경조사-통합)의 코드와 스키마를 개발·운영 환경에 적용했습니다. 최신 후보는 PR #22로 main에 병합했고, 13:25 KST 새 코드 Republish·운영 DB 전환·비로그인 HTTP 확인을 마쳤습니다. 실제 적용과 확인 범위는 [릴리스 완료 결과](#릴리스-완료-결과)를 따릅니다. `posts`·`categories`와 JSON을 사용하며 모든 게시글을 회원 전용으로 처리합니다. 경조사 작성은 홈페이지 서버의 OpenAI API와 정적 코드로 처리하도록 결정했으며, 호출 구현은 Responses API Structured Outputs이며 기본 모델은 `gpt-6-luna`입니다. 서버 Secret `OPENAI_API_KEY`가 필요하고 `OPENAI_NOTICE_MODEL`로 호환 모델을 지정할 수 있습니다. 2026-11-09 03:51 KST 키 반영 후 개발 서버를 재시작했습니다. 같은 날 04:18 KST 요청된 실제 호출에서 모델 `gpt-6-luna`와 HTTP 200을 확인했으나, 제공된 부고 링크의 본문 추출 실패로 완성 문안은 생성되지 않았습니다. 키 값은 출력하지 않았으며 상세 범위는 [실제 부고 작성 점검](./walkthrough.md#실제-모델과-부고-작성-점검-2026-11-09)을 따릅니다. 기존 경조사 데이터·상세 주소는 폐기하므로 아래 과거 부고 이관 절차를 새 전환에 사용하지 않습니다.

## 통합 게시글 실행 준비 (2026-11-09)

### 개발 활성화 승인 범위

- 목표: 사용자 요청에 따라 Replit 개발 DB를 공통 게시글 구조로 전환하고 통합 코드로 개발 서버를 재시작한다.
- 범위: `/home/runner/workspace`, Development `heliumdb`, `scripts/unify-posts.sql`, 개발 서버 `npm run dev`만 적용한다. 로컬과 일치하는 검사 완료 소스를 개발 feature 브랜치에 옮긴다.
- 완료 조건: posts의 새 컬럼·제약·인덱스 및 부고·경사 카테고리 반영, 구 테이블 2개 제거, 무관한 애플리케이션 테이블 건수 보존, 적용 파일 일치, 새 서버 프로세스와 5000번 포트 확인.
- 제외 범위: GitHub push·PR·merge, 운영 DB·Republish, 실계정 QA, 실제 OpenAI·청첩장·부고 링크 호출, 별도 기능 회귀 실행은 하지 않는다. API 키 미설정은 그대로 구분해 보고한다.
- 확인: 변경 전 개발 스키마 snapshot과 대상·의존 관계·건수 기록, 한 트랜잭션의 전환 SQL, 새 연결의 구조·건수 및 metadata-only catalog, 재시작 프로세스·시작 로그·비로그인 HTTP 응답만 확인한다. 같은 소스의 이미 통과한 정적 검사는 반복하지 않는다.

### 코드와 실행 조건

- 최초 개발 적용 당시 정책 선커밋은 `2855424`, 구현 브랜치는 `codex/unified-member-posts`였습니다. 이후 GitHub main 통합은 아래 릴리스 기록과 구분합니다.
- `/b`가 공통 게시판이고 `/b/write/obituary`, `/b/write/wedding`, `/b/write/opening`에서 텍스트 초안을 작성합니다. 이전 `/events`, `/o`와 상세 경로는 사용하지 않습니다.
- 앞선 정적 검사는 `/home/runner/workspace/.worktrees/unified-posts-check`에서 `npm run check`, 변경된 테스트 소스의 `npm run check:tests`, Python AST 구문 확인으로 마쳤습니다. 아래 개발 활성화는 이 검사와 별도 실행입니다.
- [DB 운영 런북](./docs/database-operations.md#게시글-통합-결정과-실행-범위-2026-11-09)에 따라 구조 기록과 의존 관계를 확인한 뒤 `scripts/unify-posts.sql`과 같은 버전의 앱을 적용했습니다. 이 SQL은 개발 DB에서 이미 실행됐으며 재실행하지 않습니다. 구 코드로 두 전용 테이블을 삭제하면 경조사 요청이 실패하므로 코드와 스키마를 함께 전환합니다.
- `server/modules/events/writer/`의 Python 파일을 런타임에 포함하고 프로젝트 루트에서 서버를 실행합니다. Python 3.10+ 및 IANA `Asia/Seoul` 시간대 자료가 필요합니다. `.replit`의 `python-base-3.13` 모듈이 포함되어 있고 현재 개발 Python은 3.13.11입니다.
- API 키는 Replit Secrets의 서버 전용 `OPENAI_API_KEY`에만 둡니다. 브라우저·`VITE_` 설정으로 노출하지 않습니다. 일반 텍스트·정정 해석은 필요한 정보만 OpenAI로 전달하며 `store: false`를 사용합니다. 기품 링크의 구조화된 정상 경로는 정적 추출·작성으로 처리합니다. OpenAI 실제 호출은 이번 작업에서 하지 않습니다.
- API 구현 근거: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), 2026-11-09 확인.

### 개발 적용 결과

- 2026-11-09 03:17 KST: `/home/runner/workspace`를 `codex/unified-member-posts`의 `2855424` 기준으로 전환하고 변경·신규 파일 52개와 제거 파일 45개를 반영했습니다. 적용 당시 소스 manifest SHA-256은 `3193618721335b1c9c4ae961a459f6bd803b293fe9f15bdf3a0611ab10a8df7c`이며, 이후 실행 결과 문서만 갱신합니다.
- Development `heliumdb` 전환 SQL을 한 트랜잭션으로 커밋했습니다. 새 연결의 metadata-only catalog에서 12개 테이블, posts의 컬럼 4개·CHECK 2개·partial UNIQUE index 1개, 구 테이블 2개 제거를 확인했습니다. 카테고리는 5→7건이고 나머지 테이블 건수는 보존됐습니다.
- 03:21:53 KST: 기존 개발 서버가 정지돼 있고 5000번 포트가 비어 있는 상태에서 프로젝트 루트의 `npm run dev`로 재기동했습니다. npm PID `535`, 앱 PID `557`이며, 03:22:52 KST 새 SSH 연결에서도 실행·포트 유지가 확인됐습니다.
- 시작 로그의 개발 DB 연결·session index·5000번 포트 listen을 확인했습니다. 쿠키 없는 loopback 요청은 `/` → 200 HTML, `/api/posts` → 401 JSON입니다. Python 3.13.11의 `Asia/Seoul` 시간대 자료도 확인했습니다. 이는 기동·접근 제한 확인이며 로그인·게시 기능 전체 결과가 아닙니다.
- 구조 snapshot, 적용 manifest, SQL·catalog·서버 receipts는 개발 workspace의 `.superpowers/unified-posts-activation-20261108T181441Z/`에 보존했습니다. 운영 DB·Republish·실계정 QA·외부 API 호출과 GitHub push·PR·merge는 하지 않았습니다. 이 최초 적용 당시에는 `OPENAI_API_KEY`가 미설정이었으며 후속 반영은 아래 기록과 구분합니다.

### API 키 반영과 개발 서버 재시작

- 2026-11-09 사용자 요청으로 Replit 개발 Secret의 `OPENAI_API_KEY` 설정 여부를 확인하고 개발 서버를 재시작했습니다. 값·길이·접두어·해시는 출력하거나 문서에 저장하지 않았습니다.
- 03:50 KST 새 SSH 환경에는 키가 있었으나 기존 개발 앱 PID `557`에는 없었습니다. 기존 `npm run dev` 프로세스 그룹 `535`만 SIGTERM으로 종료하고 5000번 포트 해제를 확인했습니다.
- 03:51:10 KST `/home/runner/workspace`에서 `npm run dev`로 기동했습니다. 새 npm PID는 `837`, 앱 PID는 `859`이며 새 앱 프로세스에 키가 전달된 것을 존재 여부만으로 확인했습니다. 개발 DB 연결·session index·5000번 포트의 시작 로그도 확인했습니다.
- 쿠키 없는 loopback GET `/`는 200 HTML, `/api/posts`는 401 JSON이었습니다. 이는 서버 기동과 기존 회원 접근 제한 확인이며 API 키의 유효성·모델 사용 권한·결제 상태나 생성 성공을 확인한 결과는 아닙니다.
- 실행 코드는 이전에 적용한 통합 후보 그대로이며 코드·DB·Secrets를 수정하지 않았습니다. 운영 배포·실계정 QA·실제 OpenAI 호출·GitHub 게시도 수행하지 않았습니다. 실행 증거는 개발 workspace `.superpowers/openai-key-restart-20261108T185109Z/`에 보존했습니다.

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

화면·흐름 확인을 별도로 요청받으면 개발 홈페이지를 사용하며 [AGENTS.md](./AGENTS.md#런타임과-배포-경계)의 GUI 승인 규칙을 따릅니다. 이 절은 화면 점검이나 운영 배포를 자동으로 시작하는 절차가 아닙니다.

2026-11-09 사용자가 최신 변경의 릴리스를 요청했습니다. 이번 릴리스는 아래 범위로 준비하며 실계정 QA는 계속 보류합니다. 일상 개발마다 Republish를 수행하는 정책은 아닙니다.

### 최신 변경 릴리스 (2026-11-09)

- 목표: 게시판 통합, 공개 링크 수집·규칙 저장, 결혼·개원 보완과 본문 서식의 현재 후보를 릴리스한다.
- 범위: 로컬·Replit 소스 대조, 배포 빌드, GitHub push·PR 생성·main 병합, 운영 DB 전환과 Republish. 사용자는 후보 `5b19e86`의 push·PR 생성·main 병합과 운영 DB 전환을 명시 승인했다. 운영 전환에는 사전 확인한 빈 `community_events`·`obituaries` 제거가 포함된다.
- 완료 조건: 승인된 Git 통합·운영 스키마 전환 뒤 같은 후보를 Republish하고 비로그인 HTTP 응답과 정적 자산을 확인한다. 준비만 끝난 상태를 릴리스 완료로 표시하지 않는다.
- 제외: 실계정 QA, 명부 재동기화, 실제 OpenAI·외부 경조사 수집 호출, 자동 원복은 하지 않는다. 기존 일반 게시글·댓글·명부와 사용자 자료를 보존한다.
- 확인: 같은 소스의 기존 정적 결과를 재사용하고, 이번에는 릴리스 산출물 빌드와 변경된 배포 설정의 정적 확인을 추가한다. 운영 DB는 사전 구조 기록·영향 미리보기·승인된 SQL·새 연결 확인 순서로 처리한다.

릴리스 빌드에서 게시판 청크 약 533kB가 기존 500,000-byte 한도를 초과했다. 본문 편집기는 글쓰기 창을 열 때 불러오도록 분리하고 ProseMirror 엔진을 별도 청크로 나눠 같은 한도로 다시 빌드했다. 수집 브라우저는 `.replit`의 Nix `chromium` 패키지로 런타임 의존성을 명시하고, `COLLECTOR_CHROMIUM_PATH` 또는 설치된 PATH의 실행 파일을 사용한다. 개발 도구 전용 `/repl/tools` 경로가 운영에도 있다고 가정하지 않는다. 설정 계약은 [Replit 공식 구성 문서](https://docs.replit.com/features/project-setup/configuration)를 따른다.

운영 DB의 추가 구조는 `scripts/release-posts-additive.sql`, 수동 구 테이블 제거는 `scripts/release-posts-cleanup.sql`로 분리한다. 최초 계획은 추가 구조 → 새 코드 Republish·비로그인 확인 → 구 테이블 제거였다. 실제 Publishing이 구 테이블 삭제 승인을 배포 전에 요구하므로, 아래 웹 DB 검토 절차에 따라 승인된 두 빈 테이블만 Replit의 배포 마이그레이션으로 제거한다. 기존 개발 전환 SQL이나 별도 API로 검토를 우회하지 않는다.

#### 릴리스 후보 확인 결과

- 2026-11-09 12:43 KST Replit의 최종 타입·경계 검사와 배포 빌드가 통과했다. 문서 정적 계약 6개는 12:41 KST 통과했다. 게시판 청크는 약 12kB, 편집기 약 289kB, 편집 엔진 약 233kB다. 초기 JS 350,638 bytes와 지연 화면 21개가 기존 한도를 충족한다.
- 로컬·Replit 전체 소스 대조에서 발견한 차이는 `member-labels.ts` 끝의 빈 줄과 Replit에 빠진 과거 점검 문서였다. 원격 원본을 보존한 뒤 로컬과 맞췄다. 릴리스 수정 전 430개 파일의 해시와 변경 파일 백업은 `.superpowers/release-20261109/`에 보존했다.
- `.replit` 반영 중 SSH 연결이 종료돼 완료 증거가 없는 검사는 새 연결에서 수행했다. 새 셸 PATH의 Nix Chromium은 125.0.6422.141이다. 이전 수집 실행에 사용한 `/repl/tools/bin/chromium` 155.0.8059.79와 다르며, 이번에는 새 실행 파일의 페이지 수집·OCR이나 운영 브라우저 가용성을 확인하지 않았다. 서버 재시작 명령은 실행하지 않았다.
- 12:43 KST 후보 준비 단계에서는 Production의 읽기 전용 구조·건수와 schema-only snapshot만 확보했다. 이후 승인된 Git 통합과 운영 추가 구조 적용 결과는 아래에 기록한다. 이 준비 단계에는 명부 동기화·OpenAI/공개 링크 재호출·Republish·운영 HTTP 점검·실계정 QA를 실행하지 않았다.

#### 릴리스 진행 기록

- 2026-11-09 [PR #22](https://github.com/Raphael-KR/dgkmaWeb/pull/22)를 병합했다. 병합 commit은 `f54177bfe877e40354f961045b65e3f238abed1f`이며 기능 후보 `5b19e86`과 승인 문서 `ad8361a`를 포함한다. 로컬·Replit의 main을 같은 commit으로 동기화했고 12:54 KST Replit의 추적 파일 432개가 Git blob과 일치하며 작업 트리가 깨끗한 것을 확인했다.
- 12:56 KST Production `neondb`에 `release-posts-additive.sql`을 한 트랜잭션으로 적용했다. posts 통합 컬럼·제약·인덱스, 수집 규칙 테이블과 부고·경사 카테고리를 추가했다. 카테고리만 5→7건으로 늘었고 기존 나머지 테이블 건수는 보존했다. 새 연결의 전체 catalog는 15개 테이블·131개 컬럼이며, 두 빈 구 테이블은 유지했다. 상세 증거는 [DB 운영 기록](./docs/database-operations.md#운영-추가-구조-적용-결과)에 둔다.
- 12:58 KST Replit 커넥터 `publish_app`은 DB 스키마 변경에 대한 웹 검토가 필요하다는 `INVALID_ARGUMENT`를 반환했고 새 배포를 시작하지 않았다. 같은 호출을 반복하거나 다른 배포 API로 검토를 우회하지 않는다. 사용자는 이어 Replit 웹 검토·배포 조작을 승인했다.
- CLI 경로 확인 결과 현재 개발 workspace의 `replit --help`에는 publish/deploy 명령이 없었다. 이는 이 설치의 명령 목록 확인이며 모든 CLI에서 재게시가 불가능하다는 뜻은 아니다. 승인된 웹 검토는 `ego-browser` CLI로 열었고, 사용자가 Replit 로그인을 마친 뒤 같은 브라우저에서 이어서 처리했다.
- 웹 재게시 전 조회는 기존 deployment `eb4a4e6a-1633-4882-8ee8-c1e1b9313e8b`의 success를 반환했다. 당시에는 새 후보의 배포 성공이 아니었다. 이후 실제 단계 전환과 성공은 아래 완료 결과로 구분한다. Git·DB·배포 receipt는 Replit `.superpowers/release-20261109/`에 보존한다.

#### 웹 DB 검토에 따른 적용 순서

- 사용자 로그인 후 Publishing에서 `OPENAI_API_KEY`가 운영 배포에 없는 것을 확인하고 기존 프로젝트 Secret을 배포 설정에 추가했다. 값은 열거나 복사하지 않았다. 개발 DB 전체 복사 옵션은 꺼진 상태를 유지했다. 배포 후보는 문서 기록 commit `21bd999`이며 앱 코드는 `f54177b`와 같다.
- 웹 Republish가 실제로 DB 승인 단계에서 멈췄다. 화면의 생성 SQL은 `DROP TABLE "community_events" CASCADE;`와 `DROP TABLE "obituaries" CASCADE;` 두 문장뿐이다. Replit 자체의 임시 복사본 마이그레이션 확인 완료가 표시됐다. 별도 preview 배포나 실계정 점검은 실행하지 않는다.
- 13:18 KST 새 운영 읽기 전용 연결에서 두 테이블 각각 0건, 외부 incoming FK 0개, 의존 객체는 해당 테이블 소유·내부 객체(`a`·`i`)뿐임을 확인했다. 구조 snapshot을 다시 보존했다. 승인된 삭제 범위가 확대되지 않으므로 이번에는 이 두 문장의 플랫폼 SQL을 검토·승인하는 경로로 진행한다. 일반 수동 SQL에 `CASCADE`를 추가하지 않는다.
- Replit은 새 앱 빌드 후, 새 버전 전환 전에 마이그레이션을 적용하며 비호환 변경에는 구 앱을 잠시 중지할 수 있다. [공식 배포 DB 절차](https://docs.replit.com/features/data-and-storage/publish-database-changes)와 화면의 일시 중단 안내를 확인했다. 기존 수동 삭제 순서를 이 플랫폼 절차로 대체하고, 성공 후 DB 새 연결과 비로그인 HTTP로 결과를 확인한다. 두 테이블이 제거됐으면 수동 cleanup SQL을 중복 실행하지 않는다.

#### 릴리스 완료 결과

- 2026-11-09 13:25 KST `https://dgkma.org` 재게시 완료를 확인했다. DB 검토의 `승인 및 게시` 후 커넥터 상태가 `building → running → promoting → success`로 바뀌었다. deployment ID는 같은 앱의 기존 ID를 유지하므로 ID만으로 새 릴리스를 판정하지 않았다. 게시 당시 main은 `21bd999e7224f9f6995fe06174d8a36fb2b51ffb`이며 앱 코드는 PR #22 병합 `f54177b`와 같다.
- Replit은 13:24:35 KST 파일 변경 없는 `79e43c9` (`Published your App`)를 추가했다. 커밋 metadata의 배포 build ID는 `97e874de-635e-441a-9db8-3bc60e55ecd5`다. 완료 문서 커밋 `6f2e0ed`와 분기된 이 배포 기록을 삭제·재작성하지 않고 main에 병합해 로컬·GitHub·Replit 이력을 함께 보존한다.
- 비로그인 GET `/`·`/b`는 200 HTML, `/api/posts`·`/api/categories`는 401 JSON, 제거된 `/api/obituaries`는 404 JSON이었다. 초기 JS·게시판·상세·본문 편집기·편집 엔진의 5개 JS가 모두 200이며 Replit 후보 빌드의 SHA-256과 일치했다. 연결된 CSS도 200이다. 이 결과는 회원 로그인·글 작성·편집 동작을 실행한 결과가 아니다.
- 새 운영 연결에서 `community_events`·`obituaries`와 소유 객체 제거를 확인했다. 최종 catalog는 13개 테이블·102개 컬럼이고 다른 객체 변화는 없었다. 명부 3,458건을 포함한 존속 테이블의 건수는 모두 보존했다. Replit이 검토한 SQL을 적용했으므로 수동 `release-posts-cleanup.sql`은 실행하지 않았다.
- 기존 `OPENAI_API_KEY`를 값 노출 없이 운영 배포에 포함했다. 실제 OpenAI 호출, 부고·결혼·개원 수집, 운영 Chromium/OCR 실행, 편집기 브라우저 동작과 실계정 QA는 수행하지 않았다. 개발 서버의 별도 재시작도 실행하지 않았다.
- 근거는 `production-http-smoke.json`, `production-after-web-publish.json`, `production-after-web-publish-catalog.txt`, `release-completion.json`이다. 최종 문서 기록 commit은 이 게시 버전과 구분하며 문서만 갱신한 뒤 추가 Republish하지 않는다.

### 공개 링크 범용 수집 (2026-11-09 결정)

기존의 제3자 JavaScript 실행 금지를 수집 전용 브라우저의 제한된 실행으로 변경한다. 프로젝트에 포함한 수집기와 Playwright/Chromium·로컬 OCR을 Replit에서 사용하며 Mac 스킬 경로를 런타임에서 읽지 않는다.

사용자 추가 결정에 따라 Playwright 중심으로 구성하고 별도 Linux namespace·mount·컨테이너 관리 코드는 두지 않는다. Chromium은 Playwright의 브라우저 엔진이며 자체 sandbox를 켠다. 앱 프로세스와 브라우저의 환경변수·회원 세션을 분리하는 것이 이 구현의 경계이며 별도 VM 수준의 격리를 주장하지 않는다.

- 순서: DB 규칙·기존 공개 API → HTML/메타데이터/JSON-LD/초기 상태 → 연결된 JavaScript의 명시적 조회 경로 → 브라우저의 실제 Fetch/XHR·JSON 관찰과 본문 → iframe/Shadow DOM/펼침/탭/지연 로딩 → 필요한 이미지 OCR. 충분한 정보를 얻으면 후속 비용을 생략한다.
- 네트워크는 앱의 제한된 공개 요청 중계가 수행한다. URL·모든 DNS 응답·리다이렉트·브라우저 하위 요청에 공개 주소 정책을 적용하고 주소를 고정한다. 쿠키·Authorization·사이트 저장소를 재사용하지 않는다. 직접 재호출은 실제 페이지에 연결된 인증 없는 조회 요청으로 확인한 것만 허용한다.
- 브라우저 작업은 별도 프로세스·일회성 컨텍스트·정리되는 임시 디렉터리에서 실행한다. 환경변수는 허용 목록만 전달하며 앱 Secret·DB·회원 세션은 전달하지 않는다. 서비스 워커·다운로드·웹소켓·비공개 주소·인증 우회는 허용하지 않는다. 브라우저 직접 네트워크 대신 중계 응답을 주입한다.
- 요청·응답 크기·총 전송량·요청 수·페이지/프레임/상호작용/OCR 수·동시 작업·전체 실행 시간과 프로세스 자원을 제한한다. 취소 시 브라우저와 OCR 자식을 함께 종료하고 원문·화면·네트워크 로그를 영구 보존하지 않는다.
- 성공 기준은 경조사 본문 또는 관련 구조화 필드 확보다. 오류·로그인·CAPTCHA·빈 앱 셸은 성공이 아니다. API를 찾지 못해도 렌더링과 이미지 수집을 계속한다.
- 규칙의 정본은 `source_collection_rules`이며 앱 서버만 읽고 쓴다. 규칙 불일치 시 재탐색하고 성공한 템플릿·필드 매핑으로 버전과 성공 시각을 갱신한다. 규칙에 부고 원문·ID 실값·개인정보·쿠키·인증정보를 저장하지 않는다.
- 이번 적용은 Replit 개발 코드·개발 DB에 한정한다. 정적 검사와 사용자 지정 링크의 수집 단계만 실제 수행하며 게시·OpenAI 문안 생성·운영 배포·실계정 QA는 포함하지 않는다. 구현·실제 수행·규칙 저장/재사용·미수행 경로는 별도로 기록한다.

#### 수집기 런타임과 구현 범위

- 진입점은 `server/integrations/public-sources/notice-collector.ts`, Playwright/OCR 작업은 `scripts/collector/worker.mjs`, PostgreSQL 접근은 `server/modules/events/collection-rule-store.ts`다. 기존 회원 전용 `/generate` 경로에서 호출하며 별도 공개 수집 API는 만들지 않는다. 기품 공개 API 최적화도 유지한다.
- 의존성은 lockfile에 고정한 `playwright-core 1.65.0`, `tesseract.js 7.0.0`, 한국어·영어 학습자료 패키지 각 `1.0.0`이다. OCR 학습자료는 설치 패키지에서 읽고 작업 중 외부 OCR API나 OpenAI를 호출하지 않는다.
- Replit 개발에서 확인한 Chromium은 `/repl/tools/bin/chromium`(155.0.8059.79)이다. 다른 런타임에서는 서버 전용 `COLLECTOR_CHROMIUM_PATH`로 설치된 실행 파일을 지정한다. 미설치·기동 실패 시 sandbox를 해제하지 않고 해당 수집 경로를 실패로 처리한다. 운영 런타임의 브라우저 가용성은 이번에 확인하지 않았다.
- 전체 수집 55초, 브라우저/OCR 35초, 요청 90회·총 32MiB, 개별 데이터 512KiB·자산 8MiB, JSON 관찰 12개, 프레임 6개·상호작용 8회·OCR 이미지 3개, 동시 브라우저 작업 2개로 제한한다. Node heap 256MiB·renderer JS heap 192MiB 및 renderer 수 제한을 사용한다. 이는 전체 OS 메모리를 강제 제한하는 cgroup 설정은 아니다.
- 자동 재호출·저장 대상은 인증 없는 `GET`이다. HTML/JS의 단일 인자 `fetch`/`.get` 리터럴과 실제 Fetch/XHR JSON을 확인하며, 페이지 ID와 직접 대응하거나 base64url로 대응하는 URL 템플릿만 저장한다. 다른 메서드·임의 ID 변환·인증 요청을 추정하여 실행하지 않는다.
- 필드별 출처를 공통 `posts.event_data.fieldSources`에 연결한다. 작성자 원문과 수집 근거가 출력 값에 직접 대응하지 않으면 `unresolved`로 남긴다. 원문 값·화면·응답 전체는 규칙 DB나 실행 증거에 저장하지 않는다. 사용자 정정 우선·충돌 질문·회원 권한·미리보기·작성자 확인 후 게시 흐름을 유지한다.

#### 개발 수집 적용 결과 (2026-11-09)

- 개발 workspace에 코드·의존성을 반영하고 `heliumdb`에 규칙 테이블을 추가했다. 서버 재시작, Git 커밋·push·PR·병합, Republish는 수행하지 않았다. 수집 모듈을 개발 CLI에서 직접 실행한 결과다.
- 05:13 KST 지정 Preed 링크에서 `HTML/메타데이터/초기 상태 → 연결 JS 확인 → Playwright Fetch/XHR 관찰 → 인증 없는 API 재조회` 경로가 성공했다. 제공자 전용 Preed 코드를 추가하지 않았다. API는 자동 발견한 `https://api.bugo.gaonprime.com/public/bugo/{id}`이며 도메인·페이지 패턴 `/bugo/{id}`에 규칙 ID 1/version 1을 저장했다. 요청 30회, 약 7.5MB, 브라우저 사용, OCR 0회였다.
- 05:18 KST 새 프로세스의 다음 요청은 PostgreSQL 규칙을 읽어 `stored-rule`로 성공했다. HTTP GET 1회·38,913 bytes, 브라우저/OCR 0회였고 규칙의 마지막 성공 시각이 갱신됐다. 규칙 JSON에 개별 페이지 ID, 실제 수집한 이름·전화·계좌 값, 인증 필드가 없는 것을 확인했다.
- 고인·향년·별세일·발인일·시각 확정 여부·장례식장·호실·장지·대표 연락처·계좌 등 구조화 근거와 본문을 확보했다. 실제 문안 생성·회원 대리 등록·게시·실계정 흐름은 이번 실행에 포함하지 않았다.
- Replit `npm run check`(타입·경계), `npm run check:tests`(테스트 타입), worker 구문, 기존 문서 계약 6개를 확인했다. 전체 테스트·빌드는 실행하지 않았다. 브라우저의 짧은 시스템 임시 경로와 JSON 중첩 필드 오인식을 수정한 뒤 수집에 성공했다.
- **구현됐지만 해당 링크로 성공을 확인하지 않은 경로**: HTML/JSON-LD만으로 완료, JS 리터럴만으로 API 발견, iframe·Shadow DOM·접힌 영역·탭·접근성 트리·실제 지연 콘텐츠·이미지 OCR, 다른 사이트, 다른 부고 ID의 규칙 적용, 구조 변경에 따른 재탐색, 제한 초과·취소 상황. 성공 실행의 프레임은 1개, 상호작용·스크롤·OCR은 0회다. 이 한 링크의 성공을 범용 수집 전체의 확인으로 취급하지 않는다.
- 원문 없는 근거는 Replit `.superpowers/collector-20261109/`의 `collection-discovery.json`, `collection-reuse.json`, `static-checks.json`, `source-manifest.json`, `receipt.json`이다. 스키마 적용·보존 결과는 [DB 운영 런북](./docs/database-operations.md#공개-링크-수집-규칙-개발-적용-2026-11-09)을 따른다.

### 결혼·개원 보완 (2026-11-09 개발 코드 적용)

- 목표: 프로젝트 정본 `dgkma-celebration-writer`의 홈페이지 작성 규칙을 결혼·개원 코드에 완성한다.
- 범위: 공통 수집기의 유형 전달·경사 필드/판정·JSONB 규칙 계약과 기존 경사 정규화·문안·동문 확인. 기존 엔진·DB 저장소·보안 경계·회원 정책을 재사용한다.
- 완료 조건: 유형별 수집 연결, 부모·동문 자녀 두 줄과 서버 호칭, 계좌·연락처 게시 범위, 선택 항목 생략 및 개원 표현을 코드와 기준 문서에 반영하고 Replit 정적 검사 결과를 남긴다.
- 제외: 실제 청첩장·개원 링크 수집, OpenAI 호출, 합성 자료·시험 DB 생성, 기능 회귀, 개발 서버 재시작, Git 게시, 운영 DB·배포·실계정 QA·메시지 발송. 이번 요청의 실제 확인 범위는 정적 검사이며 부고 링크의 과거 성공으로 경사 기능 확인을 대신하지 않는다.
- 확인 방법: 직전 수집기 소스/적용 manifest 대조 → 네 기준 문서 선반영 → 기존 경로 확장 → Replit 타입·경계·worker 구문·문서 계약. 물리 스키마와 기존 규칙 행은 변경하지 않는다.

#### 적용 결과와 확인 범위

- 작업 시작 시 직전 보고의 `.superpowers/collector-20261109/source-manifest.json` 24개 파일이 Replit 소스와 모두 일치했다. 이전 수집·재사용 receipt는 위 05:13/05:18 결과와 일치했다. 이는 부고 한 링크의 과거 실행 근거이며 이번 경사 수집 결과가 아니다.
- 같은 공통 경로에 초안의 `eventType`을 전달했다. HTML·메타데이터·JSON-LD·초기 상태, 연결 JS와 Fetch/XHR의 공개 API 발견, Playwright 렌더링·iframe·Shadow DOM·접힌 영역·탭·지연 로딩·OCR 및 기존 HTTP/브라우저 격리 경계를 재사용한다. 경사별 필드·성공 조건과 열기 버튼 문구만 확장했다.
- 결혼은 혼주·신랑·신부를 구분하고, 동문 자녀는 이름/공식 별칭과 학번 또는 졸업기수로 명부 한 명을 확인한 뒤 서버 호칭으로 두 줄을 만든다. 선택 안내는 확인된 값만 표시하며 계좌 순서·소유자 확인·연락처 공개 범위를 서버에서 제한한다. 안내 문구로 계좌·연락처를 우회 게시하지 않는다.
- 개원은 한의원명·개원 날짜/제공 시각·장소/주소·선택 안내를 사용한다. 결혼 전용 사실 키를 비우고 개원 안내 제목·문장으로 생성한다. 상세 폼과 발송 기능은 추가하지 않았다.
- JSON 계약은 `noticeTypes`·경사 필드 매핑·선택 사실 키를 호환 확장했다. 짧은 청첩장 URL 식별자를 처리하며 실제 ID 대신 템플릿을 저장한다. 기존 부고 규칙은 유형 키 없이 읽을 수 있게 했다. DDL·데이터 변환은 필요하지 않았다.
- Replit `/home/runner/workspace`에 변경 파일 18개를 반영하고 해시 일치를 확인했다. 05:42 KST worker 구문, 05:52 KST 문서 계약 6개·`git diff --check`, 최종 코드 보완 후 05:54 KST `npm run check`(타입·경계·runtime cycle)가 통과했다. 전체 테스트·빌드·실제 외부 호출은 실행하지 않았다.

| 유형 | 이번에 실제 확인한 범위 | 이번에 실행하지 않은 범위 |
|---|---|---|
| 결혼 | 수집 유형 전달·필드/규칙 계약·정규화·문안·서버 신원 확인 코드의 정적 검사 | 실제 청첩장 수집, API 발견·규칙 저장/재사용, OCR, OpenAI 사실 추출, 미리보기·게시 |
| 개원 | 수집 유형 전달·한의원/일시/장소 매핑·결혼 필드 제거·개원 문안 코드의 정적 검사 | 실제 개원 링크 수집, API 발견·규칙 저장/재사용, OCR, OpenAI 사실 추출, 미리보기·게시 |

- 기존 부고 경로는 코드 차이로 보존 여부를 대조했으며 부고 링크를 다시 호출하지 않았다. 위 표의 미실행 항목을 이전 부고 성공으로 대체하지 않는다.
- 실행 증거는 `.superpowers/celebration-20261109/`의 `before-source.tar.gz`, `source-manifest.json`, `static-checks.json`, `receipt.json`에 둔다. 개발 DB 읽기 전용 확인은 [런북 기록](./docs/database-operations.md#결혼개원-수집-계약-보완-2026-11-09)을 따른다. 서버 재시작·Git 커밋/push/PR/병합·운영 DB·Republish·실계정 QA는 수행하지 않았다.

### 게시글 본문 서식 (2026-11-09 개발 코드 적용)

- 목표: 굵게·기울임·취소선·두 종류 목록·링크·H1~H4와 HTML/마크다운 입력·복사를 지원한다.
- 범위: 일반 글 작성기의 Tiptap 서식/마크다운 모드, 텍스트 선택 시에만 보이는 도구, 공통 본문 표시와 목록 요약. 기존 회원 접근·경조사 생성/게시 정책을 유지한다.
- 완료 조건: 지원 서식과 모드 전환·HTML 붙여넣기/복사·마크다운 복사 코드를 Replit 개발에 적용하고 타입·경계·문서 정적 검사 결과를 기록한다.
- 제외: DB 구조·행 변경, 경조사 본문 자유 수정, 게시글 수정/삭제 관리, 서버 재시작·Git 게시·운영 DB·배포·실계정 QA·브라우저 실행 점검.
- 확인: 기존 dirty 파일·적용 해시를 보존하고 기준 문서 선반영 후 구현한다. 개발 직후 검사는 필요한 정적 검사로 제한한다. 의존성은 Replit에서 설치하고 lockfile을 동기화한다.
- 구현 참고: [Tiptap Markdown](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage), [선택 영역 BubbleMenu](https://tiptap.dev/docs/editor/extensions/functionality/bubble-menu), [react-markdown](https://github.com/remarkjs/react-markdown). 편집기와 표시기에서 링크·지원 요소를 제한하고 raw HTML을 실행하지 않는다.

#### 적용 결과

- Replit `/home/runner/workspace`의 기존 대상 파일 11개가 로컬과 일치하는지 대조하고 원본을 보존했다. 정책 문서를 먼저 반영한 뒤 의존성을 설치하고 코드·문서·lockfile 총 15개 파일을 적용했다. 이번 작업 전부터 있던 경조사 수집기 등 미커밋 변경은 보존했다.
- 작성기는 `client/src/components/post-body-editor.tsx`다. `서식` 모드의 HTML 붙여넣기와 마크다운 텍스트 붙여넣기, `마크다운` 모드 전환, HTML/MD 복사를 연결했다. BubbleMenu는 편집기 안의 빈칸이 아닌 텍스트 선택이 있을 때만 표시한다. 링크 입력 중에는 선택 범위를 유지한다. 복사 실패 시 본문·링크·클립보드 내용을 로그로 남기지 않는다.
- `post-body.tsx`와 `post-content.css`를 게시글 상세·경조사 미리보기에 공통 적용하고 게시판·홈·검색 요약은 마크다운 원문을 잘라서 표시하지 않도록 바꿨다. 경조사 원문 입력과 생성·확인·게시 API는 바꾸지 않았다.
- Replit Node `v20.20.0`에서 Tiptap core/react/pm/starter-kit/markdown/bubble-menu `3.33.0`, react-markdown `10.1.0`, remark-gfm `4.0.1`, remark-breaks `4.0.0`을 정확한 버전으로 설치하고 package.json/lockfile을 로컬에 동기화했다. 설치 시 lifecycle script는 실행하지 않았다.
- 2026-11-09 Replit에서 `npm run check`(타입·경계·runtime cycle, 앱 소스 201개), 파일 내용만 읽는 기존 문서 계약 6개, `git diff --check`가 통과했다. 검사별 실행 시각과 최종 적용 해시는 아래 증거 파일에 기록한다. 전체 테스트·빌드·새 합성 자료·브라우저·게시 시험은 실행하지 않았다.
- 실제 선택 도구의 위치·모바일 조작·한글 입력·붙여넣기·모드 왕복·클립보드 권한·게시 후 화면은 이번에 실행 확인하지 않았다. 정적 검사의 통과를 해당 사용자 흐름의 성공으로 확대하지 않는다.
- 증거는 Replit `.superpowers/post-formatting-20261109/`의 `before-source.tar.gz`, `before-manifest.json`, `install-receipt.json`, `source-manifest.json`, `static-checks.json`, `receipt.json`이다. DB 접속·스키마/행 변경·서버 재시작·Git 커밋/push/PR/병합·운영 배포·실계정 QA는 수행하지 않았다.

### 회원 커뮤니티 반응형 화면 (2026-11-09)

- 목표: 모바일 회원 커뮤니티에 태블릿·PC 배치를 추가한다.
- 범위: 회원 홈·공통 탐색, 게시판 목록·상세·댓글·일반 글쓰기·경조사 작성, 명부·검색·내 정보의 표시. 768px/1024px 전환과 최대 1280px 콘텐츠 폭을 사용한다.
- 완료 조건: 기준 문서 선반영 후 반응형 소스를 Replit 개발 워크스페이스에 적용하고 변경 범위의 정적 검사 결과를 기록한다.
- 제외: 공개 홈페이지·관리자 기능 개편, API·DB 변경, 새로운 의존성, 커밋·push·PR·운영 배포, 서버 재시작·실계정 QA·브라우저 실행 점검.
- 확인: 로컬·Replit의 `main` 기준은 `3e679a061633cfda24868291cbfdd086901e9f3e`이며 작업 전 두 working tree는 깨끗했다. 적용 파일의 기존 내용을 대조·보존하고 Replit에서 `npm run check`, Tailwind CSS 정적 컴파일, 파일 내용만 읽는 문서 계약과 `git diff --check`로 한정한다.

#### 반응형 개발 적용 결과

- 2026-11-09 14:01 KST Replit `/home/runner/workspace`에 화면 코드·CSS와 기준 문서를 적용했다. 기존 파일 15개는 적용 전 해시를 대조하고 원본을 보존했으며, 상·하단 공통 탐색 항목 `client/src/app/layout/nav-items.ts` 1개를 추가했다. 새 패키지·API·DB 변경은 없다.
- 공통 콘텐츠 폭은 모바일 448px 상한에서 태블릿 이상 1280px 상한으로 전환한다. 태블릿은 2열 목록과 상단 2행 헤더, PC는 한 행 헤더·게시판 카테고리 사이드바를 사용한다. 1280px 이상 게시판·명부·검색 결과는 3열이다.
- 회원 홈·내 정보는 요약과 본문 카드를 나란히 표시한다. 게시글 상세의 본문·댓글, 경조사 작성의 입력·미리보기는 PC에서 2열로 배치한다. 일반 작성 창은 태블릿 768px·PC 896px 상한으로 넓히고 서식/마크다운 입력부의 최소 높이는 320px로 늘렸다. 모바일 단일 열과 선택 영역 서식 도구, 기존 회원·게시 정책은 유지한다.
- 2026-11-09 14:02 KST Replit Node `v20.20.0`에서 `npm run check`(타입·모듈 경계·runtime cycle, 앱 소스 202개), Tailwind CSS 정적 컴파일, 문서 계약 6개와 `git diff --check`가 통과했다. CSS 컴파일의 Browserslist 데이터 갱신 안내는 경고이며 의존성을 변경하지 않았다.
- 근거는 Replit `.superpowers/responsive-community-20261109/`의 `before/`, `source-manifest.json`, `static-checks.json`, 검사별 로그와 `community.css`에 보존한다. 정적 검사는 실제 화면·터치·스크롤·편집·게시 동작의 확인을 대신하지 않는다. 브라우저·실계정 QA·서버 재시작·smoke check·빌드·Republish는 실행하지 않았다.
- 개발 완료 당시 이 변경은 로컬·Replit의 미커밋 변경이었다. 이후 사용자가 아래 릴리스를 승인했다.

#### 반응형 릴리스 (2026-11-09)

- 목표: 회원 커뮤니티 반응형 변경을 GitHub main에 통합하고 Replit 운영에 릴리스한다.
- 범위: 앞선 반응형 변경 16개 파일의 커밋·push·PR 생성·main 병합, 로컬·Replit main 동기화와 Republish. 사용자 요청이 이 작업의 승인 근거다.
- 완료 조건: Git 통합과 Replit 게시 성공을 확인하고 비로그인 HTTP 응답·변경된 정적 자산의 배포 여부를 확인한다. Replit이 만드는 게시 기록 커밋도 보존한다.
- 제외: DB 스키마·행 변경, Secrets 변경, 개발 서버 별도 재시작, 실계정 QA·회원 화면 조작·OpenAI 호출·경조사 수집·자동 원복. 스키마 변경이 없는 릴리스이므로 DB 전환 절차는 실행하지 않는다.
- 확인: 14:02 KST의 타입·경계·CSS 정적 결과를 소스 해시가 같을 때 재사용하고 Replit에서 배포 빌드와 변경된 문서의 정적 계약을 확인한다. 게시 후에는 비로그인 상태와 자산 해시만 점검하며 회원 기능의 실제 조작 성공으로 확대하지 않는다.

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

Google Sheets를 동문 명부의 **관리 원본**으로 유지하며, PostgreSQL `alumni_database`는 로그인·가입 심사에 사용하는 **런타임 복제본**입니다. 이 경계는 사용자가 최종 원본 전환을 선언할 때까지 유효합니다. 로그인 요청 자체는 Google Sheets를 조회하지 않으며, 관리자가 명시적으로 실행하는 동문 명부 동기화 기능으로 PostgreSQL 복제본을 갱신합니다. 관련 Secrets와 동기화 기능은 사용자가 PostgreSQL 단독 원본 전환을 명시적으로 선언할 때까지 유지합니다. 이 문서는 행 데이터·개인정보·운영 건수를 기록하지 않습니다.

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

기존 일반 Kakao Secret 5개는 현재 코드에서 사용하지 않습니다. 2026-09-05 Replit 개발 SSH 프로세스의 환경변수 존재 여부를 확인해 환경별 Kakao 설정 10개는 모두 존재하고, 기존 일반 설정 5개는 모두 없음을 확인했습니다. 이는 현재 환경변수 상태 확인이며 과거 삭제 시점이나 프로덕션 인스턴스의 Secret 주입 상태를 직접 확인한 것은 아닙니다. 값은 출력하지 않았으며 자세한 범위는 [현재 상태 점검](./walkthrough.md#현재-상태-점검-2026-09-05)을 따릅니다.

서버의 authorization request와 token exchange는 `REPLIT_DEPLOYMENT`로 선택한 동일한 환경 config의 REST API key와 redirect URI를 사용해야 합니다.

카카오 어드민 키는 서버의 회원 탈퇴 및 가입 거절의 카카오 연결 해제에서만 `/v1/user/unlink` 호출에 사용합니다. `KAKAO_DEV_ADMIN_KEY`와 `KAKAO_PROD_ADMIN_KEY`도 `REPLIT_DEPLOYMENT="1"` 규칙으로 선택하며, 브라우저·`VITE_` 변수·로그·오류 메시지·저장소 파일에 노출하지 않습니다.

관리자 계정 복구용 `KAKAO_DEV_ADMIN_USER_IDS`와 `KAKAO_PROD_ADMIN_USER_IDS`에는 각 환경에서 카카오가 인증한 숫자형 회원번호를 쉼표로 구분해 저장합니다. 로그인 callback의 카카오 회원번호가 현재 환경의 allowlist와 정확히 일치하면 서버가 해당 회원의 `isAdmin=true`를 복구합니다. 값이 없으면 아무도 자동 승격하지 않고, 잘못된 형식은 값 원문을 노출하지 않은 채 실패합니다. allowlist에 없다는 이유로 기존 관리자 권한을 자동 회수하지는 않습니다.

## 데이터베이스 운영

상세 SSH 명령, `PG*` 우선순위, 개발·운영 DB 선택법, 변경 전후 검증과 Secret 제거 절차는 [데이터베이스 운영 런북](./docs/database-operations.md)을 기준으로 합니다.

### 정식 오픈 전 데이터 정책

현재 서비스는 정식 오픈 전 개발 단계입니다. 사용자가 데이터 보존을 별도로 선언하기 전까지 Development Database와 Production Database의 애플리케이션 레코드는 테스트 데이터로 간주하며, 개발에 필요한 경우 반복 승인 없이 초기화할 수 있습니다.

초기화 전에는 대상 테이블과 외래키 의존 순서를 확인하고, 가능한 경우 트랜잭션으로 실행한 뒤 테이블별 건수를 다시 확인합니다. 이 정책은 스키마·테이블 삭제, Replit Secrets 삭제, Git 이력 변경, Object Storage 파일 삭제를 자동 승인하지 않습니다.

사용자가 기존 데이터 보존을 선언하는 즉시 그 결정이 이 정책보다 우선합니다.

### 스키마 변경

스키마 변경은 자동 실행하지 않습니다. Development Database와 Production Database에 각각 additive 변경 SQL을 명시적으로 검토한 뒤 수동 적용하고, 테이블과 컬럼을 확인합니다. 개발 환경에서 `db:push`를 사용해야 할 때도 변경 내용을 먼저 확인한 뒤 Replit Shell에서 직접 실행합니다. 테이블·컬럼·제약·인덱스·시퀀스·뷰·트리거·RLS·정책·루틴·enum·domain, runtime DDL 또는 migration 변경은 같은 PR에서 [docs/database-schema.md](./docs/database-schema.md)를 갱신하고 metadata-only catalog를 재검증해야 합니다.

```bash
npm run db:push
```

2026-07-13 전체 브랜치 최종 리뷰에서 OAuth state의 다중 인스턴스 일회성 소비를 위해 `kakao_oauth_states` additive 테이블을 추가했습니다. 이 테이블에는 state 원문이 아니라 SHA-256 hash, 세션 binding hash, PostgreSQL이 발급한 시작 시각과 만료 시각만 저장합니다.

최종 경쟁 조건 수정에서는 `kakao_identity_terminations` additive 테이블과 `kakao_oauth_states.started_at`을 Development Database에 적용했습니다. 종료 테이블은 카카오 회원번호 원문이나 이메일을 저장하지 않고, 카카오 회원번호와 소문자 이메일을 각각 도메인 분리한 `SESSION_SECRET` 기반 HMAC-SHA-256 identity hash 및 종료 시각만 저장합니다. 같은 identity key의 종료 이력은 누적하지 않고 각 key별 최신 marker 1건만 upsert해, 종료보다 먼저 시작된 OAuth callback을 차단하는 용도로만 사용합니다. 종료 이후 새로 시작한 OAuth는 marker 시각보다 새 세대이므로 차단하지 않습니다.

`session` 테이블은 `connect-pg-simple`과 앱 시작 코드가 관리합니다. `drizzle.config.ts`의 `tablesFilter: ["!session"]`는 `db:push`가 이 테이블을 삭제나 rename 대상으로 해석하지 않도록 제외합니다.

프로덕션에는 생성 SQL을 확인한 후 Production SQL 콘솔에서 additive SQL만 수동 적용합니다. 적용 결과를 확인하기 전에는 Republish하지 않습니다. 기존 컬럼·테이블 삭제처럼 되돌리기 어려운 SQL은 별도 백업과 복구 절차 없이 실행하지 않습니다.

#### 프로덕션 선행 additive 스키마 순서

현재 Production Database에는 Republish 전에 [docs/database-operations.md](./docs/database-operations.md)의 조건부 additive SQL을 적용합니다. 이 SQL은 `kakao_oauth_states` 전체 테이블을 먼저 `CREATE TABLE IF NOT EXISTS`로 만들고, 초기 버전 테이블을 위해 `kakao_oauth_states.started_at`을 `ADD COLUMN IF NOT EXISTS`로 보완한 다음 `kakao_identity_terminations`를 생성합니다.

새 연결에서 두 테이블의 전체 컬럼, 기본키, `session_binding_hash` 고유 제약과 기존 `session`, `session_expire_idx`가 모두 존재하는지 확인합니다. 이 확인이 끝난 뒤에만 새 코드를 Republish합니다.

2026-08-16에는 [데이터베이스 운영 런북](./docs/database-operations.md)의 `alumni_name_aliases` exact additive SQL을 Production `neondb`에 transaction으로 적용했다. 적용 전 대상 이름+학번 단일 일치와 기존 13-table baseline을 확인했고, 적용 후 새 연결과 canonical metadata-only catalog에서 14 tables/119 columns/14 PK/10 FK/6 non-PK UNIQUE constraints/24 indexes/10 sequences, 별칭 제약 4개, preferred 1건, 중복 0건과 원본 명부 보존을 확인했다. 실제 이름·연락처·연결 문자열은 기록하지 않는다.

### 운영 데이터와 seed

카테고리 같은 운영 데이터 seed는 스키마 변경과 분리합니다. Development Database에서 검증한 SQL을 Production SQL 콘솔에서 다시 실행하고, 프로덕션 API로 결과를 확인합니다.

```bash
curl -sS https://dgkma.org/api/categories
```

운영 DB 접속 문자열은 셸 기록, Git, 채팅 로그에 남기지 않습니다.

## 개발 직후 정적 점검

타입·의존 경계에 영향을 주는 코드 변경에 필요한 경우 다음 명령을 실행합니다.

```bash
npm run check
```

문서 변경은 내용·링크·기준 간 정합성과 `git diff --check`만 확인합니다. 테스트 코드의 타입 변경에만 `npm run check:tests`를 추가합니다.

`npm test`, `npm run build`, DB 시험, 서버 재시작, 브라우저·모바일·smoke check는 개발 직후 기본 절차가 아닙니다. 빌드 산출물 작업이나 별도 요청된 점검, 구체적인 실행 오류 해결에 필요한 범위만 수행합니다.

직접 DB 변경이 포함된 작업은 [DB 운영 런북](./docs/database-operations.md)을 따릅니다. 개발 직후 정적 점검을 이유로 DB에 접속하거나 스키마를 변경하지 않습니다.

## 배포

이 절은 운영 배포가 명시적으로 요청된 경우에만 적용합니다. 2026-11-09 최신 변경 릴리스 요청은 위 범위로 처리하며 실계정 QA는 계속 보류합니다.

먼저 GitHub `main`, 로컬, Replit 개발 워크스페이스의 배포 대상 커밋이 같은지 확인합니다.

1. Development Database에 additive 스키마를 수동 적용하고 검증합니다.
2. 배포할 코드의 필요한 정적 검사 결과와 빌드를 확인합니다. 같은 소스의 통과 결과를 재사용하며 전체 회귀를 자동 추가하지 않습니다.
3. Production Database에 additive 스키마를 수동 적용하고 검증합니다.
4. Replit Deployments에서 Republish합니다.
5. 스키마와 코드 준비 상태를 확인한 뒤 데이터 마이그레이션을 별도 수동 SQL로 실행합니다.
6. 공개 홈페이지와 핵심 API의 HTTP 상태를 확인합니다.
7. 실계정 QA도 요청된 범위에 포함된 경우에만 실제 계정으로 카카오 로그인과 변경된 회원 기능을 확인합니다.

데이터 마이그레이션은 스키마 적용이나 코드 시작 과정에 포함하지 않고 각 환경의 SQL 콘솔에서 별도 승인 후 실행합니다.

기본 배포 점검:

```bash
curl -I https://dgkma.org/
curl -sS https://dgkma.org/api/categories
```

인증이 필요한 API는 비로그인 요청에서 `401`이 나오는지 먼저 확인한 뒤 실제 계정으로 성공 흐름을 검증합니다.

## 장애 확인 순서

1. GitHub, 로컬, Replit 개발 워크스페이스의 커밋 비교
2. Replit 개발 워크스페이스의 `npm run check`, `npm run build` 결과 확인
3. Development Database와 Production Database 중 어느 DB를 조회했는지 확인
4. Replit Secrets의 환경변수 존재 여부 확인
5. Republish 완료 여부와 프로덕션 HTTP 응답 확인
6. 카카오 redirect URI의 클라이언트·서버·개발자 콘솔 값 비교

환경변수 값이나 사용자 개인 정보를 장애 보고에 첨부하지 않습니다.

## Legacy obituary migration

> 과거 구조의 운영 절차입니다. 2026-11-09 통합 결정은 기존 경조사·레거시 데이터와 상세 주소를 폐기하므로 이 절을 다시 실행하지 않습니다. 새 전환 범위는 [DB 운영 런북](./docs/database-operations.md#게시글-통합-결정과-실행-범위-2026-11-09)을 따릅니다.

1. Development Database에 `community_events` additive 스키마를 수동 적용하고 테이블·컬럼을 검증합니다.
2. 코드의 테스트, 타입 검사, 빌드가 통과했는지 확인합니다.
3. `obituaries`와 `community_events` 건수를 기록합니다.
4. 개발 SQL 콘솔에서 `scripts/migrate-obituaries-to-community-events.sql`을 별도로 수동 실행합니다.
5. 이관 건수, `legacy_obituary_id` 유일성, `event_type`, `status`, `author_id`를 검증합니다.
6. 같은 SQL을 다시 실행해 건수가 늘지 않는지 확인합니다.
7. Republish 전에 Production Database에 같은 additive 스키마를 Production SQL 콘솔에서 수동 적용하고 검증합니다.
8. Republish 후 프로덕션 데이터 마이그레이션 SQL을 별도 승인받아 Production SQL 콘솔에서 수동 실행합니다.
9. 이관 건수와 중복 여부, API 호환성을 검증합니다.

롤백과 기존 경로 호환성 검증이 끝날 때까지 기존 `obituaries` 테이블과 데이터는 그대로 유지합니다.
