# AGENTS.md

이 파일은 `/Users/raphael/Playground/dgkmaWeb` 저장소에만 필요한 지침을 둔다. 전역 기본값은 `/Users/raphael/AGENTS.md`의 `Personal Local Project Mode`를 따르며 여기서 반복하지 않는다.

## 프로젝트와 기준 문서

- 이 저장소는 동국대학교한의과대학동문회의 공개 홈페이지와 회원 서비스다.
- 공유 소스 기준은 GitHub `main`이며, 개발과 배포는 Replit을 사용한다.
- 현재 사용자의 명시적 결정이 최우선이다. 그다음에는 문서의 책임 범위에 따라 아래 canonical 문서를 따른다.
  - `planning_proposal.md`: 제품 비전, 확정 정책, 현재 상태, 우선순위와 완료 조건
  - `replit.md`: Replit 개발·배포·환경변수 운영
  - `docs/database-operations.md`: 개발·운영 DB 선택, 변경, 백업·복구와 검증
  - `walkthrough.md`: 실제 계정과 프로덕션 회귀·smoke check
- `README.md`는 문서 진입점이고 `CHANGELOG.md`와 `docs/superpowers/`의 설계·계획은 이력 자료다. 이력 자료를 현재 정책보다 우선하지 않는다.
- canonical 정책과 코드 또는 실제 환경이 충돌하면 조용히 한쪽을 선택하지 말고, 확인된 사실과 권장 해결책을 보고한다.

## 런타임과 배포 경계

- 개발 홈페이지는 `https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev`, 프로덕션 홈페이지는 `https://dgkma.org`다.
- 구현과 반복 검증은 Replit 개발 워크스페이스와 개발 홈페이지를 기본으로 한다. 단순 확인을 위해 Republish하지 않는다.
- 개발 홈페이지에서 관찰 가능한 화면과 흐름은 인앱 브라우저로 직접 확인한다. 개발 검증이 끝난 뒤 운영 환경에서만 확인 가능한 항목이 있을 때 Republish를 요청하고, 프로덕션 smoke check는 Republish 후에만 수행한다.
- Replit SSH는 개발 워크스페이스와 Development Database에 연결되며 autoscale 프로덕션 인스턴스 셸이 아니다.
- 로컬 Mac의 `node_modules`와 npm 도구 상태를 신뢰하지 않는다. 코드 검증이 필요하면 가능한 경우 Replit 개발 워크스페이스에서 수행한다.

## 변경과 외부 작업

- 한 번에 하나의 직접적인 구현 경로를 유지하고 작업 범위에 필요한 파일만 수정한다.
- 작업 전후 Git 상태를 확인하고 사용자 소유의 dirty·untracked 파일을 보존한다. 관련 없는 파일을 정리하거나 일괄 추가하지 않는다.
- `attached_assets/`는 명시적 요청 없이 정리, 이름 변경, 정규화 또는 삭제하지 않는다.
- 실제 provider, 운영 서비스, 외부 API, 개인정보 또는 사용자 데이터에 대한 쓰기·삭제·덮어쓰기와 비가역 작업은 현재 사용자의 명시적 요청이나 아래의 정식 오픈 전 데이터 정책에 포함될 때만 수행한다.
- 비밀정보, 토큰, 전체 OAuth 인가 코드, DB URL과 불필요한 개인정보를 브라우저, 로그, 오류, 문서, 저장소, 셸 기록 또는 채팅에 노출하지 않는다.

## 데이터베이스와 명부

- 모든 직접 DB 작업은 `docs/database-operations.md`를 따른다.
- Development Database가 기본이다. `server/db.ts`에서는 Replit `PG*` 변수가 `DATABASE_URL`보다 우선하므로 일반 개발, 실행과 테스트에서 이를 해제하지 않는다.
- Production Database는 명시적인 운영 명령으로만 선택한다. 먼저 `current_database()`와 변경 전 건수를 확인하고, 가능한 경우 트랜잭션을 사용한 뒤 새 연결에서 결과를 검증한다. 반복 조회에는 `PROD_DATABASE_READONLY_URL`을 우선한다.
- `PROD_DATABASE_URL`과 읽기 전용 URL은 Mac `.env`, 저장소, 문서, 셸 기록 또는 채팅에 저장하지 않는다. owner URL의 존재는 운영 접근이나 변경 승인이 아니다.
- 정식 오픈 전 반복 운영 작업이 끝날 때까지 owner URL은 Replit Secrets에만 유지하고, 사용자가 작업 종료나 launch hardening을 명시한 뒤에만 제거한다.
- 스키마 변경과 데이터 마이그레이션은 분리한다. 운영 변경·동기화 전에는 runbook이 요구하는 백업 또는 복구 가능한 snapshot, 미리보기, 적용 순서와 사후 검증을 준비한다. 스키마·테이블 삭제나 되돌리기 어려운 SQL은 별도 승인과 복구 계획 없이 실행하지 않는다.
- 사용자가 최종 명부 원본 전환을 선언하기 전까지 Google Sheets가 관리 원본이고 PostgreSQL `alumni_database`는 로그인·가입 심사용 런타임 복제본이다. 관련 Secrets와 명시적 관리자 동기화 경로를 유지하며 로그인 요청에서 Google Sheets를 직접 조회하지 않는다.

### 정식 오픈 전 데이터 정책

- 사용자가 데이터 보존을 선언하기 전까지 Development Database와 Production Database의 애플리케이션 레코드는 폐기 가능한 테스트 데이터다. 개발에 필요한 초기화는 반복 승인 없이 수행할 수 있다.
- 초기화 전 대상 테이블과 외래키 의존 순서를 확인하고, 가능한 경우 트랜잭션을 사용하며, 완료 후 테이블별 건수를 검증한다.
- 이 사전 승인은 스키마·테이블 삭제, Replit Secrets 삭제, Git 이력 변경, Object Storage 파일 또는 로컬 사용자 파일 삭제를 포함하지 않는다.
- 사용자가 데이터 보존을 선언하면 그 결정이 즉시 이 정책을 대체한다.

## Kakao 인증과 세션

- 현재 인증의 단일 경로는 Kakao Login v5 REST OAuth다. 브라우저는 `/api/auth/kakao/start`로 시작하고 서버만 환경별 REST API key, client secret과 redirect URI를 선택한다. Kakao JavaScript SDK 로그인을 추가하지 않는다.
- `REPLIT_DEPLOYMENT="1"`은 프로덕션 설정을, 그 외 값은 개발 설정을 선택한다. 개발 callback은 `https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev/kakao-callback`, 프로덕션 callback은 `https://dgkma.org/kakao-callback`이며 Kakao 설정과 정확히 일치해야 한다.
- 개발 앱 키를 프로덕션과 공유하지 않고 개발 authorization request에 프로덕션 전용 `plusfriends` scope를 추가하지 않는다.
- Kakao admin key는 서버의 회원 탈퇴와 가입 거절 연결 해제에만 사용한다. 브라우저나 `VITE_` 환경변수에 노출하거나 로그인에 사용하지 않는다.
- 환경별 관리자 Kakao ID allowlist는 쉼표로 구분한 양의 숫자만 허용한다. 누락 시 자동 승격하지 않고, 잘못된 값은 원문을 기록하지 않은 채 실패하며, allowlist 밖이라는 이유로 기존 관리자 권한을 자동 회수하지 않는다.
- 인증 라우트는 `req.session.userId`를 일관되게 사용하고 로그인 성공 후 응답 전에 세션을 저장한다. Replit 프록시를 위한 `app.set("trust proxy", 1)`을 유지한다.
- 로그인 회원에게 `activityRegion`이 없으면 `/onboarding/region`으로 보낸다.

## 검증

- 변경 범위에 맞는 집중 테스트와 정적 검사를 먼저 실행한다. 전체 `npm test`는 영향 범위가 넓거나 배포 후보의 회귀 확인이 필요할 때 한 번 실행한다.
- 타입·번들 또는 배포에 영향을 주는 변경은 Replit 개발 워크스페이스에서 `npm run check`와 `npm run build`를 실행한다.
- `npm run db:push`는 Development Database의 스키마 변경을 검토한 경우에만 Replit에서 실행한다.
- 화면과 사용자 흐름은 개발 홈페이지에서 먼저 확인한다. 배포 작업이 범위에 포함되면 Republish 후 `walkthrough.md`의 관련 항목으로 프로덕션 smoke check를 수행한다.
- 지침·문서만 바꾼 작업에는 제품 테스트나 전체 테스트를 실행하지 않는다. 프로젝트에 instruction/policy lint가 있으면 실행하고 `git diff --check`로 형식을 확인한다.
