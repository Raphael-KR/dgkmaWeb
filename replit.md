# Replit 개발 및 배포 운영

이 문서는 dgkmaWeb의 현재 GitHub, Replit 개발 워크스페이스, 프로덕션 배포, 데이터베이스 운영 방법을 설명합니다. 제품 비전과 개발 우선순위는 [planning_proposal.md](./planning_proposal.md)와 [roadmap.md](./roadmap.md)를 참고합니다.

## 환경 구분

| 환경 | 역할 | 코드 반영 | 데이터베이스 |
|---|---|---|---|
| 로컬 Mac | Git 작업과 코드 편집 | GitHub와 pull/push | 운영 DB 작업에 사용하지 않음 |
| Replit 개발 워크스페이스 | 개발 서버와 검증 | GitHub `main`을 pull | Development Database |
| Replit 프로덕션 배포 | 공개 서비스 | Deployments에서 Republish | Production Database |
| 프로덕션 SQL 콘솔 | 운영 데이터·스키마 확인 | 해당 없음 | Production Database에 직접 연결 |

- 공개 서비스: `https://dgkma.replit.app`
- Replit SSH는 `/home/runner/workspace` 개발 워크스페이스 접속입니다.
- SSH로 접속한 셸은 autoscale 프로덕션 인스턴스의 셸이 아닙니다.
- 개발 DB에 적용한 SQL과 seed는 프로덕션 DB에 자동 반영되지 않습니다.

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
- `KAKAO_REST_API_KEY`
- `KAKAO_CLIENT_SECRET`
- `KAKAO_REDIRECT_URI`
- `PRIVATE_OBJECT_DIR`

### 필수 클라이언트 설정

- `VITE_KAKAO_REST_API_KEY`
- `VITE_KAKAO_REDIRECT_URI`

### 현재 동문 명부 연동

- `ALUMNI_SPREADSHEET_ID`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`

Google Sheets는 현재 신규 가입 매칭과 관리자 동기화에 사용됩니다. PostgreSQL을 기준 명부로 일원화한 뒤에는 명시적인 import 용도로 축소할 계획입니다.

### 선택 운영 설정

- `APP_URL`
- `DEBUG_KAKAO_AUTH`
- `PUBLIC_OBJECT_SEARCH_PATHS`
- `VITE_KAKAO_CHANNEL_URL`

`DEBUG_KAKAO_AUTH`를 활성화해도 전체 키, 토큰, 인가 코드, 개인 정보를 로그에 남기지 않습니다.

## 카카오 로그인

현재 로그인은 카카오 REST authorize URL을 사용하며 브라우저 SDK 기반 로그인은 사용하지 않습니다.

- 클라이언트 인가: `VITE_KAKAO_REST_API_KEY`, `VITE_KAKAO_REDIRECT_URI`
- 서버 토큰 교환: `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI`
- 프로덕션 redirect URI: `https://dgkma.replit.app/kakao-callback`

클라이언트 인가 단계와 서버 토큰 교환 단계의 redirect URI는 문자열까지 정확히 같아야 합니다.

## 데이터베이스 운영

### 스키마 변경

스키마 변경이 있을 때만 Replit 개발 워크스페이스에서 다음 명령을 검토해 사용합니다.

```bash
npm run db:push
```

프로덕션에는 생성 SQL을 확인한 후 Production SQL 콘솔에서 additive SQL을 적용합니다. 기존 컬럼·테이블 삭제처럼 되돌리기 어려운 SQL은 별도 백업과 복구 절차 없이 실행하지 않습니다.

### 운영 데이터와 seed

카테고리 같은 운영 데이터 seed는 스키마 변경과 분리합니다. Development Database에서 검증한 SQL을 Production SQL 콘솔에서 다시 실행하고, 프로덕션 API로 결과를 확인합니다.

```bash
curl -sS https://dgkma.replit.app/api/categories
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

## 배포

1. GitHub `main`, 로컬, Replit 개발 워크스페이스의 커밋이 같은지 확인합니다.
2. Replit 개발 워크스페이스에서 `npm run check`와 `npm run build`를 실행합니다.
3. Replit Deployments에서 Republish합니다.
4. 공개 홈페이지와 핵심 API의 HTTP 상태를 확인합니다.
5. 실제 계정으로 카카오 로그인과 변경된 회원 기능을 확인합니다.

기본 배포 점검:

```bash
curl -I https://dgkma.replit.app/
curl -sS https://dgkma.replit.app/api/categories
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

1. Apply the schema in the development database.
2. Record counts from obituaries and community_events.
3. Run scripts/migrate-obituaries-to-community-events.sql in the development SQL console.
4. Verify migrated count, legacy_obituary_id uniqueness, event_type, status, and author_id.
5. Repeat the script and verify the count does not change.
6. Republish code only after development verification.
7. Apply schema and data migration separately in the production SQL console.
8. Keep obituaries unchanged until rollback and route compatibility are verified.
