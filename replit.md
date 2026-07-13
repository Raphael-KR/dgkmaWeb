# Replit 개발 및 배포 운영

이 문서는 dgkmaWeb의 현재 GitHub, Replit 개발 워크스페이스, 프로덕션 배포, 데이터베이스 운영 방법을 설명합니다. 제품 비전과 개발 우선순위는 [planning_proposal.md](./planning_proposal.md)와 [roadmap.md](./roadmap.md)를 참고합니다.

## 환경 구분

| 환경 | 역할 | 홈페이지 | 코드 반영 | 데이터베이스 |
|---|---|---|---|---|
| 로컬 Mac | Git 작업과 코드 편집 | 해당 없음 | GitHub와 pull/push | 운영 DB 작업에 사용하지 않음 |
| Replit 개발 워크스페이스 | 개발 서버와 반복 검증 | `https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev` | GitHub `main`을 pull | Development Database |
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

### 개발 중 확인 원칙

구현 중에는 Replit 개발 워크스페이스에 코드를 반영하고 개발 서버를 실행한 뒤 개발 홈페이지에서 바로 확인합니다. 단순 화면·기능 확인을 위해 Republish하지 않습니다.

Republish는 배포할 코드와 Production Database 준비가 끝난 뒤 수행합니다. Republish 후에만 운영 홈페이지에서 smoke check와 실제 운영 환경 검증을 진행합니다.

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
- `PRIVATE_OBJECT_DIR`

Replit은 이 프로젝트에 하나의 App Secrets 창을 제공합니다. `REPLIT_DEPLOYMENT="1"`이면 프로덕션 설정을 선택하고, 그 외 모든 값이면 개발 설정을 선택합니다. Secret 값 자체는 이 문서에 기록하지 않습니다.

### 현재 동문 명부 연동

- `ALUMNI_SPREADSHEET_ID`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`

Google Sheets 명부 3,458건은 2026-07-12에 Development Database와 Production Database의 `alumni_database`로 1회 이관했습니다. 최종 원본 전환을 선언하기 전까지 Google Sheets를 동문 명부의 **관리 원본**으로 유지하고, PostgreSQL `alumni_database`는 로그인·가입 심사에 사용하는 **런타임 복제본**으로 운용합니다. 로그인 요청 자체는 Google Sheets를 조회하지 않으며, 관리자가 명시적으로 실행하는 동문 명부 동기화 기능으로 PostgreSQL 복제본을 갱신합니다. 관련 Secrets와 동기화 기능은 사용자가 PostgreSQL 단독 원본 전환을 명시적으로 선언할 때까지 유지합니다.

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

기존 일반 Kakao Secret 5개는 deprecated 상태입니다. 개발과 프로덕션 smoke check가 모두 통과한 뒤에만 제거합니다.

서버의 authorization request와 token exchange는 `REPLIT_DEPLOYMENT`로 선택한 동일한 환경 config의 REST API key와 redirect URI를 사용해야 합니다.

카카오 어드민 키는 서버의 회원 탈퇴 및 가입 거절의 카카오 연결 해제에서만 `/v1/user/unlink` 호출에 사용합니다. `KAKAO_DEV_ADMIN_KEY`와 `KAKAO_PROD_ADMIN_KEY`도 `REPLIT_DEPLOYMENT="1"` 규칙으로 선택하며, 브라우저·`VITE_` 변수·로그·오류 메시지·저장소 파일에 노출하지 않습니다.

## 데이터베이스 운영

상세 SSH 명령, `PG*` 우선순위, 개발·운영 DB 선택법, 변경 전후 검증과 Secret 제거 절차는 [데이터베이스 운영 런북](./docs/database-operations.md)을 기준으로 합니다.

### 정식 오픈 전 데이터 정책

현재 서비스는 정식 오픈 전 개발 단계입니다. 사용자가 데이터 보존을 별도로 선언하기 전까지 Development Database와 Production Database의 애플리케이션 레코드는 테스트 데이터로 간주하며, 개발에 필요한 경우 반복 승인 없이 초기화할 수 있습니다.

초기화 전에는 대상 테이블과 외래키 의존 순서를 확인하고, 가능한 경우 트랜잭션으로 실행한 뒤 테이블별 건수를 다시 확인합니다. 이 정책은 스키마·테이블 삭제, Replit Secrets 삭제, Git 이력 변경, Object Storage 파일 삭제를 자동 승인하지 않습니다.

사용자가 기존 데이터 보존을 선언하는 즉시 그 결정이 이 정책보다 우선합니다.

### 스키마 변경

스키마 변경은 자동 실행하지 않습니다. Development Database와 Production Database에 각각 additive 변경 SQL을 명시적으로 검토한 뒤 수동 적용하고, 테이블과 컬럼을 확인합니다. 개발 환경에서 `db:push`를 사용해야 할 때도 변경 내용을 먼저 확인한 뒤 Replit Shell에서 직접 실행합니다.

```bash
npm run db:push
```

2026-07-13 전체 브랜치 최종 리뷰에서 OAuth state의 다중 인스턴스 일회성 소비를 위해 `kakao_oauth_states` additive 테이블을 추가했습니다. 이 테이블에는 state 원문이 아니라 SHA-256 hash, 세션 binding hash, PostgreSQL이 발급한 시작 시각과 만료 시각만 저장합니다.

최종 경쟁 조건 수정에서는 `kakao_identity_terminations` additive 테이블과 `kakao_oauth_states.started_at`을 Development Database에 적용했습니다. 종료 테이블은 카카오 회원번호 원문이나 이메일을 저장하지 않고, 카카오 회원번호와 소문자 이메일을 각각 도메인 분리한 `SESSION_SECRET` 기반 HMAC-SHA-256 identity hash 및 종료 시각만 저장합니다. 같은 identity key의 종료 이력은 누적하지 않고 각 key별 최신 marker 1건만 upsert해, 종료보다 먼저 시작된 OAuth callback을 차단하는 용도로만 사용합니다. 종료 이후 새로 시작한 OAuth는 marker 시각보다 새 세대이므로 차단하지 않습니다.

`session` 테이블은 `connect-pg-simple`과 앱 시작 코드가 관리합니다. `drizzle.config.ts`의 `tablesFilter: ["!session"]`는 `db:push`가 이 테이블을 삭제나 rename 대상으로 해석하지 않도록 제외합니다.

프로덕션에는 생성 SQL을 확인한 후 Production SQL 콘솔에서 additive SQL만 수동 적용합니다. 적용 결과를 확인하기 전에는 Republish하지 않습니다. 기존 컬럼·테이블 삭제처럼 되돌리기 어려운 SQL은 별도 백업과 복구 절차 없이 실행하지 않습니다.

#### 프로덕션 선행 additive 스키마 순서

현재 Production Database에는 Republish 전에 [docs/database-operations.md](./docs/database-operations.md)의 조건부 additive SQL을 적용합니다. 이 SQL은 `kakao_oauth_states` 전체 테이블을 먼저 `CREATE TABLE IF NOT EXISTS`로 만들고, 초기 버전 테이블을 위해 `kakao_oauth_states.started_at`을 `ADD COLUMN IF NOT EXISTS`로 보완한 다음 `kakao_identity_terminations`를 생성합니다.

새 연결에서 두 테이블의 전체 컬럼, 기본키, `session_binding_hash` 고유 제약과 기존 `session`, `session_expire_idx`가 모두 존재하는지 확인합니다. 이 확인이 끝난 뒤에만 새 코드를 Republish합니다. 이번 작업에서는 Production Database에 접근하거나 적용하지 않습니다.

### 운영 데이터와 seed

카테고리 같은 운영 데이터 seed는 스키마 변경과 분리합니다. Development Database에서 검증한 SQL을 Production SQL 콘솔에서 다시 실행하고, 프로덕션 API로 결과를 확인합니다.

```bash
curl -sS https://dgkma.org/api/categories
```

운영 DB 접속 문자열은 셸 기록, Git, 채팅 로그에 남기지 않습니다.

## 검증

GitHub 커밋을 Replit 개발 워크스페이스에 반영한 뒤 다음 순서로 실행합니다.

```bash
npm run check
npm run build
```

기대 결과는 두 명령 모두 종료 코드 `0`입니다. Browserslist 데이터 또는 번들 크기 경고는 빌드 실패와 구분해 기록합니다.

데이터베이스 스키마가 바뀐 작업은 필요한 테이블과 컬럼을 Development Database에서 별도로 확인합니다.

화면과 사용자 흐름은 Republish 전에 개발 홈페이지에서 먼저 확인합니다. 개발 검증이 끝난 변경만 배포 절차로 넘깁니다.

## 배포

먼저 GitHub `main`, 로컬, Replit 개발 워크스페이스의 배포 대상 커밋이 같은지 확인합니다.

1. Development Database에 additive 스키마를 수동 적용하고 검증합니다.
2. 배포할 코드에서 테스트, 타입 검사, 빌드를 완료합니다.
3. Production Database에 additive 스키마를 수동 적용하고 검증합니다.
4. Replit Deployments에서 Republish합니다.
5. 스키마와 코드 준비 상태를 확인한 뒤 데이터 마이그레이션을 별도 수동 SQL로 실행합니다.
6. 공개 홈페이지와 핵심 API의 HTTP 상태를 확인합니다.
7. 실제 계정으로 카카오 로그인과 변경된 회원 기능을 확인합니다.

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
