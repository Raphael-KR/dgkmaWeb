# 데이터베이스 운영 런북

이 문서는 dgkmaWeb의 Development Database와 Production Database를 SSH에서 구분하여 조회·변경·검증하는 기준 절차다. 실제 접속 문자열, 비밀번호, 토큰은 이 문서나 Git에 기록하지 않는다.

## 환경과 기준 상태

| 구분 | Development Database | Production Database |
|---|---|---|
| 용도 | 구현, 테스트, 반복 초기화 | Republish된 서비스의 운영 데이터 |
| 기본 접근 | Replit SSH의 `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | 별도 읽기 전용 역할의 `PROD_DATABASE_READONLY_URL` |
| 확인된 DB | `heliumdb` | `neondb` |
| 기본 선택 여부 | 기본값 | 명시적으로 선택할 때만 사용 |

Google Sheets는 최종 전환 선언 전까지 명부 관리 원본이고 PostgreSQL `alumni_database`는 로그인·가입 심사용 런타임 복제본이다. 로그인 요청은 Google Sheets를 직접 조회하지 않으며, 명시적인 관리자 동기화로 PostgreSQL 복제본을 갱신한다. 이 문서는 행 데이터·개인정보·운영 건수를 기록하지 않는다.

## SSH 접속

로컬 Mac에서 다음 SSH 명령으로 Replit 개발 워크스페이스에 접속한다.

```bash
ssh -i ~/.ssh/replit -p 22 <replit-user>@<replit-host>
cd /home/runner/workspace
```

이 SSH는 Replit 개발 워크스페이스에 연결된다. autoscale 프로덕션 인스턴스의 셸이 아니다. 공용 resolver는 Development에서 URL credential을 선택하지 않고, Production owner credential을 읽지 않는다.

## DB 선택 원리

[`server/db-target.ts`](../server/db-target.ts)가 런타임, Drizzle과 migration의 연결 대상을 한 계약으로 해석한다.

- Development는 다섯 `PG*` 필드를 모두 요구하고 `PGDATABASE=heliumdb`만 허용한다. URL fallback은 없다.
- Drizzle과 migration에서 `DATABASE_URL`, `PROD_DATABASE_URL`, `PROD_DATABASE_READONLY_URL` 키가 존재하면 값이 비어 있어도 거부한다.
- disposable-test는 Development tuple과 lowercase UUIDv4를 사용하며 Production 변수를 허용하지 않는다.
- Production 조회는 `PROD_DATABASE_READONLY_URL`만 사용하고 `neondb`, `BEGIN READ ONLY`, CREATE 권한 부재를 모두 검증한다. owner credential은 공용 resolver에 전달하지 않는다.
- TCP는 원칙적으로 인증서를 검증한다. owner transport decision `dgkma-owner-transport-decision-v1`에 따라 `REPL_ID`가 존재하고 `PGHOST`가 바이트 단위로 `helium`이며 target이 `development|disposable-test`일 때만 Replit 내부 non-TLS TCP를 선택할 수 있다. ordinary fingerprint의 address/port는 proxy의 live inet 값이 아니라 승인 connection endpoint인 lowercase `PGHOST`와 canonical `PGPORT`를 사용한다. PG tuple digest·`heliumdb`·user name/OID·server version도 독립적으로 일치해야 하며 DDL/DML 전에 이 identity를 검증하고 disposable control/target도 각각 다시 검증한다. 그 밖의 host/target은 verified TLS를 사용하며 TLS 실패 뒤 완화·fallback하지 않는다. Production read-only에는 예외가 없다.

## Development Database 사용

개발 DB는 기본 연결이다. 앱 코드, 테스트, `db:push`와 일반 DB 검증은 별도 운영 URL 없이 실행한다.

### 스키마 카탈로그 재검증

현행 구조와 객체의 기준은 [database-schema.md](database-schema.md)다. Development 기본 metadata-only 재검증은 해당 문서의 catalog SQL을 실행하고 `heliumdb`, read-only, `ROLLBACK`, completion marker를 확인한다. 기존 운영 예시는 보존하며, 이 명령은 행 데이터를 조회하지 않는다.

```bash
psql -X --csv -v ON_ERROR_STOP=1 -v expected_database=heliumdb \
  -f scripts/database-schema-catalog.sql
```

테이블·컬럼·제약·인덱스·시퀀스·뷰·트리거·RLS·정책·루틴·enum·domain, runtime DDL 또는 migration을 바꾸면 같은 PR에서 기준 문서를 갱신하고 이 metadata-only 검증을 다시 실행한다. Production은 명시적으로 대상 DB를 선택하고, 성공 catalog 전에는 일치나 drift를 추정하지 않는다.

```bash
npm run check
npm run build
```

직접 연결을 확인할 때는 URL을 출력하지 않고 다음과 같이 DB 이름과 건수만 조회한다.

```bash
npx tsx -e '
import { createTargetPool, resolveDevelopmentTarget, shutdownPool } from "./server/db-target";
const pool = createTargetPool(resolveDevelopmentTarget(process.env, "runtime"));
const result = await pool.query(`
  select current_database() as database,
         current_user as user_name,
         (select count(*)::int from alumni_database) as alumni_rows,
         (select count(*)::int from users) as user_rows
`);
console.log(result.rows[0]);
await shutdownPool(pool);
'
```

개발 화면 검증은 Republish 없이 다음 주소에서 수행한다.

```text
https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev
```

## Production Database 사용

### Secret 준비

반복되는 운영 metadata 조회에는 Replit의 `Tools > Setup > Secrets`에 별도 읽기 전용 역할의 다음 Secret을 둔다.

```text
PROD_DATABASE_READONLY_URL
```

실제 값은 읽기 전용 역할의 Production Database URL 전체다. Mac의 `.env`, 저장소, 문서, 셸 기록, 채팅에는 복제하지 않는다. Secret 존재 여부를 확인할 때도 값을 출력하지 않는다. 일반 개발·앱 실행·테스트는 Development Database만 사용한다.

```bash
node -e 'console.log(Object.hasOwn(process.env,"PROD_DATABASE_READONLY_URL") ? "PROD_DATABASE_READONLY_URL: PRESENT" : "PROD_DATABASE_READONLY_URL: MISSING")'
```

### 읽기 전용 확인

운영 조회는 공용 resolver가 전용 읽기 전용 URL, `neondb`, verified TLS, read-only transaction과 CREATE 권한 부재를 검증한 뒤에만 callback을 실행한다.

```bash
npx tsx -e '
import { withProductionReadonly } from "./server/db-target";
await withProductionReadonly(
  { PROD_DATABASE_READONLY_URL: process.env.PROD_DATABASE_READONLY_URL },
  async (client) => {
    const result = await client.query("select current_database() as database, current_user as user_name");
    console.log(result.rows[0]);
  },
);
'
```

Production read-only 경로는 catalog SELECT만 실행하며 privilege probe나 쓰기 receipt를 생성하지 않는다.

### 명시적인 운영 쓰기

운영 쓰기는 사용자가 승인한 작업이나 정식 오픈 전 데이터 정책에 따른 명확한 작업에만 수행한다. 실행 전에 대상 DB와 변경 전 건수를 확인하고, 가능한 경우 트랜잭션으로 처리하며, 새 연결에서 변경 후 건수를 다시 확인한다.

공용 resolver와 `server/db.ts`는 Production owner 연결을 제공하지 않는다. 운영 쓰기가 별도로 승인되더라도 이 경로를 URL 치환으로 우회하지 않고, 해당 작업의 전용 runbook·백업·대상 검증·트랜잭션·사후 새 연결 검증을 먼저 준비한다.

## 공용 pool 정책

모든 resolver pool은 `max=10`, `min=0`, 연결 대기 10초, idle 30초, `maxUses=10000`을 사용한다. 세션에는 statement 30초, lock 5초, idle transaction 30초 timeout을 설정한다. 종료는 신규 사용을 막고 최대 10초 동안 borrower 반환을 기다리며, 남은 borrower가 있으면 성공으로 처리하지 않는다.

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

### Google Sheets 명부 동기화

관리자 명부 동기화는 즉시 쓰기를 실행하지 않는다. 관리자 화면에서 다음 순서를 지킨다.

1. Google Sheets 연결 상태를 확인한다. 연결 또는 원본 검증 오류가 표시돼도 `변경 미리보기`는 실행할 수 있다.
2. `변경 미리보기`로 원본·DB·추가·수정·동일·충돌·오류·원본만·DB만 건수를 확인한다.
3. 차단 오류가 있으면 원본을 수정하고 미리보기를 다시 실행한다. 빈 원본, `A:L`의 12개 관리 컬럼 헤더 또는 필수값 누락, 잘못된 휴대전화 형식, 원본 또는 DB의 정규화 전화번호 중복은 적용할 수 없다. 헤더 누락을 빈 값으로 해석해 기존 DB 필드를 덮어쓰지 않는다.
4. 실제 적용 전 대상 DB의 `current_database()`, `alumni_database` 총 건수, 필수값 누락과 정규화 전화번호 중복 건수를 별도 집계로 기록한다.
5. 미리보기의 변경 범위가 예상과 일치할 때만 `변경 적용`을 실행한다. 미리보기 뒤 원본이 바뀌었거나 다른 적용이 진행 중이면 서버가 `409`로 거부하므로 새 미리보기부터 다시 시작한다.
6. 적용 후 새 연결에서 총 건수, 필수값, 중복, `matched_user_id` 연결 건수와 예상 insert/update를 대조한다.

서버는 source 재조회부터 commit까지 PostgreSQL advisory lock으로 직렬화하고 하나의 transaction에서 insert/update한다. 기존 `is_matched`, `matched_user_id`와 DB에만 존재하는 행은 보존하며 자동 삭제하지 않는다. 응답과 브라우저에는 집계와 source fingerprint만 전달하고 명부 원문은 포함하지 않는다.

Production Database에서 최종 동기화할 때는 위 절차 외에 사전 백업 또는 복구 가능한 snapshot을 준비하고 사용자에게 실행 범위와 미리보기 집계를 확인받는다. 개발·회귀 테스트에서는 실제 Google Sheets apply를 실행하지 않고 fixture snapshot만 사용한다.

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

Development Database에는 2026-07-13 적용했으며, Production Database에는 별도 승인 작업 전까지 적용하지 않는다. 종료 marker에는 카카오 회원번호와 소문자 이메일의 원문 대신 각각 도메인 분리한 `SESSION_SECRET` 기반 HMAC-SHA-256 hash를 저장하며, 각 identity key별 최신 종료 marker만 보유한다.

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

적용 전후 `current_database()`를 확인하고, 새 연결에서 `event_parse_rate_limits`의 네 컬럼, 기본키와 `users(id)` 외래키를 확인한 뒤에만 경조사 링크 파싱 코드를 Republish한다. Development와 Production의 적용·초기 상태·Republish 후 흐름은 개인정보 없는 검증 기록으로 확인한다.

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
