# 데이터베이스 운영 런북

이 문서는 dgkmaWeb의 Development Database와 Production Database를 SSH에서 구분하여 조회·변경·검증하는 기준 절차다. 실제 접속 문자열, 비밀번호, 토큰은 이 문서나 Git에 기록하지 않는다.

## 환경과 기준 상태

| 구분 | Development Database | Production Database |
|---|---|---|
| 용도 | 구현, 테스트, 반복 초기화 | Republish된 서비스의 운영 데이터 |
| 기본 접근 | Replit SSH의 `PG*` 환경변수와 `DATABASE_URL` | Replit Secret의 명시적 `PROD_DATABASE_URL` |
| 확인된 DB | `heliumdb` | `neondb` |
| 기본 선택 여부 | 기본값 | 명시적으로 선택할 때만 사용 |

2026-07-12 기준으로 Google Sheets 명부 3,458건을 양쪽 `alumni_database`에 1회 이관했다. 최종 전환 선언 전까지 Google Sheets는 명부 관리 원본이고 PostgreSQL `alumni_database`는 로그인·가입 심사용 런타임 복제본이다. 로그인 요청은 Google Sheets를 직접 조회하지 않으며, 명시적인 관리자 동기화로 PostgreSQL 복제본을 갱신한다. 양쪽 DB의 당시 휴대전화 중복과 필수값 누락은 0건이었고 `users`와 명부 연결은 0건이었다. 이 수치는 영구적인 운영 통계가 아니다.

## SSH 접속

로컬 Mac에서 다음 SSH 명령으로 Replit 개발 워크스페이스에 접속한다.

```bash
ssh -i ~/.ssh/replit -p 22 dc5e5541-525b-4ad6-b914-2d2db70cb4a9@dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev
cd /home/runner/workspace
```

이 SSH는 Replit 개발 워크스페이스에 연결된다. autoscale 프로덕션 인스턴스의 셸이 아니다. 다만 개발 워크스페이스에 `PROD_DATABASE_URL`이 설정되어 있으면 SSH 프로세스가 그 URL을 명시적으로 선택해 Production Database에 직접 연결할 수 있다.

## DB 선택 원리

[`server/db.ts`](../server/db.ts)는 다음 순서로 연결 대상을 선택한다.

1. `PGHOST`, `PGUSER`, `PGDATABASE` 등 Replit `PG*` 환경변수
2. `DATABASE_URL`

따라서 SSH에서 앱 코드나 `server/db.ts`를 그대로 실행하면 Development Database가 기본이다. 단순히 `DATABASE_URL="$PROD_DATABASE_URL"`을 앞에 붙여도 `PG*`가 남아 있으면 여전히 Development Database를 사용한다.

- 로그의 `Connecting to PostgreSQL database (local/replit)...`는 개발 DB 선택을 뜻한다.
- 로그의 `Connecting to PostgreSQL database (remote)...`는 원격 URL 선택을 뜻한다.
- 환경 이름이나 명령 모양만 믿지 말고 `current_database()`와 기준 테이블 건수를 확인한다.

## Development Database 사용

개발 DB는 기본 연결이다. 앱 코드, 테스트, `db:push`와 일반 DB 검증은 별도 운영 URL 없이 실행한다.

```bash
npm run check
npm run build
```

직접 연결을 확인할 때는 URL을 출력하지 않고 다음과 같이 DB 이름과 건수만 조회한다.

```bash
node --input-type=module -e '
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const result = await pool.query(`
  select current_database() as database,
         current_user as user_name,
         (select count(*)::int from alumni_database) as alumni_rows,
         (select count(*)::int from users) as user_rows
`);
console.log(result.rows[0]);
await pool.end();
'
```

개발 화면 검증은 Republish 없이 다음 주소에서 수행한다.

```text
https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev
```

## Production Database 사용

### Secret 준비

정식 오픈 전 활발한 개발 기간에는 반복되는 운영 스키마·데이터 작업을 위해 Replit의 `Tools > Setup > Secrets`에 다음 Secret을 유지한다.

```text
PROD_DATABASE_URL
```

실제 값은 Replit이 제공한 Production Database URL 전체다. Mac의 `.env`, 저장소, 문서, 셸 기록, 채팅에는 복제하지 않는다. 새 Secret은 새 SSH 세션에서 존재 여부만 확인하며 값을 출력하지 않는다. Secret이 상시 존재하더라도 일반 개발·앱 실행·테스트는 Development Database를 기본으로 하며, 운영 DB 접근은 항상 명시적인 운영 명령으로만 수행한다.

```bash
node -e 'console.log(process.env.PROD_DATABASE_URL ? "PROD_DATABASE_URL: PRESENT" : "PROD_DATABASE_URL: MISSING")'
```

### 읽기 전용 확인

운영 DB는 `server/db.ts`를 거치지 않고 `PROD_DATABASE_URL`을 직접 지정하면 `PG*` 우선순위와 혼동하지 않는다.

```bash
node --input-type=module -e '
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.PROD_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const result = await pool.query(`
  select current_database() as database,
         current_user as user_name,
         (select count(*)::int from alumni_database) as alumni_rows,
         (select count(*)::int from users) as user_rows
`);
console.log(result.rows[0]);
await pool.end();
'
```

일반 운영 점검은 조회 쿼리만 사용한다. 장기적으로 반복 조회가 필요하면 owner URL 대신 별도 읽기 전용 역할의 URL을 `PROD_DATABASE_READONLY_URL`로 두는 방식을 우선한다.

### 명시적인 운영 쓰기

운영 쓰기는 사용자가 승인한 작업이나 정식 오픈 전 데이터 정책에 따른 명확한 작업에만 수행한다. 실행 전에 대상 DB와 변경 전 건수를 확인하고, 가능한 경우 트랜잭션으로 처리하며, 새 연결에서 변경 후 건수를 다시 확인한다.

`server/db.ts`를 import하는 스크립트를 운영 DB에 실행해야 할 때만 다음과 같이 `PG*`를 해당 프로세스에서 제거한다.

```bash
env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE \
  DATABASE_URL="$PROD_DATABASE_URL" \
  npx tsx path/to/explicit-production-script.ts
```

이 명령은 운영 쓰기를 가능하게 한다. 일반 개발 명령, 앱 실행, 테스트에는 사용하지 않는다. 셸 전체에 `export DATABASE_URL="$PROD_DATABASE_URL"`을 설정하지 않는다.

## 변경 절차

1. Development Database의 대상 DB 이름과 변경 전 건수를 확인한다.
2. 개발 DB에서 스키마·데이터 변경을 실행한다.
3. 개발 DB를 새 연결로 재조회하고 개발 서버 기능을 검증한다.
4. 코드 테스트, 타입 검사와 빌드를 완료한다.
5. Production Database의 대상 DB 이름과 변경 전 건수를 확인한다.
6. 운영 변경을 트랜잭션 또는 재실행 가능한 명시적 스크립트로 실행한다.
7. 운영 DB를 새 연결로 재조회하여 필수값, 중복, 연결 상태와 건수를 검증한다.
8. Republish가 필요한 코드 변경만 Republish한다.
9. `https://dgkma.org`에서 smoke check를 수행한다.
10. 작업 결과와 운영 DB 연결 종료를 확인한다. 개발 기간에는 `PROD_DATABASE_URL`을 유지하고, 사용자가 반복적인 운영 스키마·데이터 작업 종료 또는 오픈 전 보안 강화를 명시적으로 선언한 뒤에만 삭제한다.

스키마 변경과 데이터 마이그레이션은 별도 작업으로 취급한다. Production Database에 개발 DB 변경이 자동 전파된다고 가정하지 않는다.

### 카카오 종료 경쟁 스키마 선행 순서

최종 종료 경쟁 조건 코드의 Production Republish 전에는 아래 additive SQL을 먼저 적용한다. `kakao_oauth_states`가 없는 운영 DB와 초기 버전 테이블만 있는 DB를 모두 지원한다.

```sql
CREATE TABLE IF NOT EXISTS kakao_oauth_states (
  state_hash text PRIMARY KEY,
  session_binding_hash text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kakao_oauth_states_session_binding_hash_unique
    UNIQUE (session_binding_hash)
);

ALTER TABLE kakao_oauth_states
  ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS kakao_identity_terminations (
  identity_hash text PRIMARY KEY,
  terminated_at timestamptz NOT NULL DEFAULT now()
);
```

새 운영 연결에서 두 테이블의 컬럼과 `kakao_oauth_states_pkey`, `kakao_oauth_states_session_binding_hash_unique`, `kakao_identity_terminations_pkey`, 기존 `session`, `session_expire_idx`를 확인한 뒤에만 코드를 Republish한다.

Development Database에는 2026-07-13 적용했으며, Production Database에는 별도 승인 작업 전까지 적용하지 않는다. 종료 marker에는 카카오 회원번호와 소문자 이메일의 원문 대신 각각 도메인 분리한 `SESSION_SECRET` 기반 HMAC-SHA-256 hash를 저장하며, 각 identity key별 종료 시각의 최신 marker 1건만 보유한다.

### 경조사 링크 파싱 제한 스키마 선행 순서

경조사 공개 링크 파싱 코드를 Production Republish하기 전에 다음 additive 테이블을 먼저 적용한다. 여러 Autoscale 인스턴스가 같은 회원별 호출량을 원자적으로 공유하기 위한 런타임 테이블이며, 원문 URL이나 개인정보는 저장하지 않는다.

```sql
CREATE TABLE IF NOT EXISTS event_parse_rate_limits (
  user_id integer PRIMARY KEY
    REFERENCES users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

적용 전후 `current_database()`를 확인하고, 새 연결에서 `event_parse_rate_limits`의 네 컬럼, 기본키와 `users(id)` 외래키를 확인한 뒤에만 경조사 링크 파싱 코드를 Republish한다. Development Database에는 2026-07-14 적용·0건 초기 상태를 확인했다. Production Database에는 2026-07-14 적용해 같은 스키마와 0건 초기 상태를 확인했고, 2026-07-16 Republish 후 실제 회원의 문자 분석·초안 생성·삭제와 운영 DB의 경조사·초안 0건 정리를 확인했다.

## 정식 오픈 전 초기화

사용자가 데이터 보존을 선언하기 전까지 양쪽 DB의 애플리케이션 레코드는 테스트 데이터이며 개발 목적에 따라 초기화할 수 있다. 초기화할 때는 외래키 의존 순서를 확인하고 카테고리처럼 유지할 기준 데이터를 명시한다.

현재 사용자 관련 초기화 대상은 다음과 같다.

```text
comments
community_events
obituaries
payments
posts
alumni_database
pending_registrations
users
session
kakao_oauth_states
kakao_identity_terminations
event_parse_rate_limits
```

스키마·테이블 삭제, Replit Secrets 삭제, Git 이력 변경, Object Storage 파일 삭제는 이 자동 승인 범위에 포함되지 않는다.

## 비밀정보와 연결 종료

- 실제 DB URL과 비밀번호를 출력하거나 커밋하지 않는다.
- 명령에는 실제 URL 대신 `$PROD_DATABASE_URL` 변수명만 사용한다.
- 프로덕션 쿼리 결과에 개인정보가 포함되지 않도록 집계와 마스킹된 샘플을 우선한다.
- 장시간 SSH 작업이 끝나면 실행 중인 프로세스를 확인하고 `exit`로 세션을 닫는다.
- 개발 기간에는 향후 스키마·데이터 작업을 위해 owner URL을 유지하되 명시적인 운영 명령에서만 사용한다.
- 사용자가 반복적인 운영 스키마·데이터 작업 종료 또는 오픈 전 보안 강화를 선언하면 `PROD_DATABASE_URL` Secret을 삭제한다.

## 장애 확인

1. `current_database()`와 `current_user`로 실제 대상을 확인한다.
2. `PGHOST`, `PGUSER`, `PGDATABASE`가 존재하면 `server/db.ts`는 개발 DB를 우선한다는 점을 확인한다.
3. 운영 직접 연결은 `PROD_DATABASE_URL` 존재 여부와 SSL 설정을 확인한다.
4. 실행 전후 핵심 테이블 건수를 별도 연결에서 비교한다.
5. 운영 SQL 콘솔이 결과 표시 오류를 내더라도 성공으로 추측하지 말고 Database Overview나 새 쿼리로 재확인한다.
