# Replit 개발 시작 안내

기존 dgkmaWeb 개발 워크스페이스에서 작업을 시작하는 절차다. 빈 DB를 새로 구축하는 설치 절차는 아니다. 환경·Secrets·배포 기준은 루트 [replit.md](../../replit.md), 작업 범위와 확인 기준은 [AGENTS.md](../../AGENTS.md), 다음 기능은 [제품·개발 계획](../product/planning-proposal.md)을 따른다.

## 1. 소스와 작업 범위 확인

Replit의 프로젝트 셸 또는 [SSH 접속](database-operations.md#ssh-접속)으로 개발 워크스페이스에 들어간다.

```bash
cd /home/runner/workspace
git status --short --branch
git rev-parse HEAD
node --version
npm --version
python3 --version
```

GitHub `main`이 공유 소스다. 기존 수정·untracked 파일을 보존하고, 가져올 변경과 현재 작업을 대조한 뒤 [GitHub 동기화 절차](../../replit.md#github-동기화)를 따른다. dirty 상태에서 자동 reset·clean·일괄 덮어쓰기를 하지 않는다.

## 2. 런타임과 의존성

[.replit](../../.replit)은 Node.js 20, PostgreSQL 16, Python 3.13 모듈과 Chromium 패키지를 지정한다. 경조사 정적 작성기는 Python 3.10+·시간대 자료를 필요로 한다. 실제 npm 버전은 작업 셸에서 확인하고 [package-lock.json](../../package-lock.json)을 사용한다.

의존성이 없거나 lockfile 변경을 반영해야 할 때 Replit 개발 셸에서 설치한다. 같은 상태에서 반복 설치할 필요는 없다.

```bash
npm ci
```

앱 코드 폴더와 각 소유권은 [프로젝트 구조](../architecture/project-structure.md)를 따른다. 로컬 Mac의 `node_modules`를 Replit으로 복사하지 않는다. Chromium·OCR 기능의 설치와 실제 수집 성공은 별개이며 개발 시작 과정에서 외부 링크나 OpenAI를 호출하지 않는다.

## 3. 설정과 Development Database

설정 이름은 [환경변수 기준](../../replit.md#환경변수)과 [.env.example](../../.env.example)을 확인한다. 값은 Replit Secrets에서 관리한다. `.env.example`은 이름·용도 참고 자료이며 운영 Secret을 Mac 파일로 옮기기 위한 템플릿이 아니다. Secret·DB URL·키를 출력하는 `env`/`printenv` 덤프를 사용하지 않는다.

- 앱의 [server/db.ts](../../server/db.ts)는 Replit `PG*`가 `DATABASE_URL`보다 우선한다. 일반 개발에서 `PG*`를 해제하거나 운영 URL로 대체하지 않는다.
- [drizzle.config.ts](../../drizzle.config.ts)는 `DATABASE_URL`을 직접 사용한다. `npm run db:push`는 의존성 설치나 정적 검사가 아니며 시작 절차에 포함하지 않는다.
- 기존 Development Database를 사용한다. 접속·스키마 변경이 필요한 작업은 [DB 런북](database-operations.md)을 따른다. 초기 `migrations/0000_...sql`이나 과거 seed만으로 현재 DB가 재현되지 않는다. [DB 스크립트 분류](../reference/database-scripts.md)에서 완료된 전환과 조회 도구를 구분한다.

## 4. 요청된 개발 실행과 정적 검사

개발 서버 실행이 필요한 작업에서만 Replit의 기존 Run 워크플로 또는 다음 명령을 사용한다. 이미 실행 중이면 중복 서버를 띄우지 않는다.

```bash
npm run dev
```

이는 실제 서버 실행이다. 시작 코드가 Development DB의 세션 테이블·인덱스를 확인·생성하므로 정적 검사로 취급하지 않는다. 기본 내부 포트는 5000이며 홈페이지 주소는 [환경 구분](../../replit.md#환경-구분)을 따른다. 문서 편집이나 타입 수정만으로 재시작하지 않는다.

개발 직후에는 [검사 카탈로그](feature-checks.md)에서 변경 범위에 필요한 정적 검사만 선택한다. 문서, lint·서식, 앱 타입·의존 경계, 테스트 타입, 자료/스킬 형식 중 해당하는 항목의 명령·환경·부수 효과를 따른다. 카탈로그의 앱 릴리스용 필수 빌드나 실행형 테스트를 일상 개발에 추가하지 않는다.

공통 서식은 루트 `.prettierrc.json`·`.prettierignore`를 따른다. `npm run format`은 파일을 수정하므로 읽기 전용 검사와 구분한다. 의존성 설치 뒤 프로젝트의 고정 버전 도구를 사용한다.

검사를 선택할 때는 파일 이름이나 테스트 이름 필터만으로 앱·storage import가 제외된다고 가정하지 않는다.

문서는 내용·상대 링크·기준 간 정합성과 `git diff --check`로 확인한다. 문구·제목을 고정한 과거 문서 계약 명령은 사용하지 않는다. 일반 테스트에서 DB 검사는 기본 제외하며, 실제 DB 검사는 [별도 승인과 대상 검증](database-operations.md#별도로-요청된-격리-개발-db-검사)을 따른다.

UI 문구·CSS·함수 호출 모양을 고정하는 과거 검사는 실행 목록에서 제거했다. 현재 기능의 실제 결과·권한·데이터 보존을 확인하는 검사만 선택하며, 폐기한 모바일 비교·청크 크기 검사 명령을 되살리지 않는다. 자세한 유지 범위는 [최소 검사 기준](../../replit.md#개발-직후-정적-점검)을 따른다.

DB 시험·전체 회귀·빌드·브라우저·smoke check는 일상 개발의 묶음 절차가 아니다. 실제 기능 실행을 별도로 요청받으면 그 범위에서 수행한다. 정적 검사 통과는 로그인·외부 API·DB 전환·운영 실행 확인을 뜻하지 않는다. 적용 환경, 수행한 검사와 남은 범위를 구분해 보고한다.
