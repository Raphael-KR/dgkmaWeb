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

## 스키마 manifest와 ledger 진입점

확장된 스키마 계약은 [`database-manifest.yaml`](database-manifest.yaml)이 단일 기준이다. `scripts/validate-database-manifest.ts`는 canonical serialization, plan digest, 68개 테이블 계약, actor/action·lock·account-delete registry와 artifact descriptor 폐쇄성을 검사한다.

sequence 1·10·15·20·30·40·50·60과 선택 sequence 65는 모두 체크인된 SQL과 SHA-256 descriptor로 materialize되어 있다. sequence 40은 capability probe에 따라 `preferred_btree_gist` 또는 `deferred_trigger_fallback` 중 정확히 하나를 선택하고, `fallback-test` override는 UUID-bound disposable target에서만 허용한다. 실행기는 누락된 SQL을 실행 시점에 생성하지 않으며 artifact bytes, descriptor, manifest digest 중 하나라도 drift하면 SQL 전에 중단한다.

Development에 대한 쓰기 없는 사전 확인은 다음 명령이다.

```bash
npx tsx scripts/apply-schema.ts --target development --dry-run
```

이 명령은 공용 target resolver로 `heliumdb` identity를 검증하고 table/routine capability probe를 각각 rollback한 뒤 sequence 계획만 출력한다. Todo 16 검증에서는 두 UUID-bound disposable target에 1→10→15→20→30→40→50→60을 적용하고, artifact와 ledger row를 같은 transaction에 commit한다. Catalog는 sequence 50의 exact count `logical sources=10, releases=2, deferred historical releases=0, bank accounts/maps=2/2, draft policies/mappings/categories=16/46/6`와 승인된 두 adapter code만 허용하며, 재실행 `verified_noop`과 최종 database 부재를 증명한다.

Todo 17 실행기는 Development write path를 구현하지만 대화상의 단일 운영 승인 전에는 호출하지 않는다. 승인 뒤에도 1→40과 50→60은 다음 두 경계로 분리한다.

```bash
npx tsx scripts/apply-schema.ts --target development --through-sequence 40

npx tsx scripts/create-development-admin-receipt.ts \
  --target development \
  --candidate-user-id 315 \
  --receipt docs/database-targets/development-admin-approved.json
```

첫 명령에서 sequence 15가 `pre_anchor_blocking`을 기록하거나 sequence 20 이전에 중단되면 그대로 멈춘다. 차단이 없을 때 생성된 receipt는 그 한 파일만 commit·push한다. Sequence 50 실행기는 receipt bytes가 현재 `HEAD`와 같고, target fingerprint·사용자 315의 ID/UID/admin 상태·verified through-40 release·ledger digest가 모두 live 재현될 때만 다음 명령을 허용한다.

```bash
npx tsx scripts/apply-schema.ts \
  --target development \
  --from-sequence 50 \
  --through-sequence 60 \
  --actor-receipt docs/database-targets/development-admin-approved.json

npx tsx scripts/approve-accounting-categories.ts \
  --target development \
  --actor-receipt docs/database-targets/development-admin-approved.json \
  --codes DUES_INCOME,OTHER_INCOME,DUES_REFUND,GENERAL_EXPENSE,INTERNAL_TRANSFER_IN,INTERNAL_TRANSFER_OUT

npx tsx scripts/verify-schema-catalog.ts \
  --target development \
  --manifest docs/database-manifest.yaml
```

Category 명령은 정확히 여섯 version-1 draft root에 version-2 approved successor만 append한다. Dues policy 16개와 position mapping 46개는 모두 draft여야 하며 승인 행이 하나라도 생기면 transaction을 rollback한다. Catalog는 `REPEATABLE READ READ ONLY`에서 실행하고 항상 `ROLLBACK`으로 끝낸다. Development 완료 선언은 migrated startup, 전체 schema reapply 8개 `verified_noop`, category reapply `verified_noop`, 갱신된 `docs/database-schema.md`까지 확인한 뒤에만 가능하다. Production target과 Production apply는 이 경로에서 지원하지 않는다.

## 가역 rollout과 복원 검증 계약

복원 준비 상태는 정확히 `pending Todo 22 measured drill`이다. 아래 내용은 Todo 22의 측정 가능한 Development→disposable 검증을 위한 고정 계약이며, 현재 복원 실행 승인이나 성공 주장이 아니다. Production backup/restore는 이 계약의 범위 밖이고 RPO/RTO는 policy-pending이다. Production에는 명시적인 사용자 승인, 별도 백업·복구 계획, 대상 확인과 측정된 Todo 22 drill receipt 없이는 이 절차를 적용하지 않는다.

### 동일 snapshot의 custom dump

Todo 22 exporter는 Development resolver가 검증한 연결 A에서 다음 순서로 동작한다.

1. `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`를 실행한다.
2. 같은 연결에서 `pg_export_snapshot()`, `txid_current_snapshot()`, `current_database()`, `current_user`, UTC 관찰 시각과 `pg_current_wal_lsn()`을 한 번에 읽는다. raw snapshot ID는 로그·receipt·명령 기록에 남기지 않고 SHA-256만 기록한다.
3. 같은 A snapshot에서 source catalog, 테이블별 count와 content digest를 생성한다. A는 dump와 evidence 직렬화가 모두 끝날 때까지 열어 둔다.
4. 전용 임시 디렉터리와 dump는 각각 `0700`, `0600`이어야 한다. dump는 저장소·Object Storage·외부 서비스에 commit 또는 upload하지 않는다.
5. dump 종료와 receipt 직렬화 뒤에만 A를 commit한다. 실패 시 rollback하고 임시 파일을 정리한다.

실행기가 생성한 private 환경값을 사용하는 shell 단계는 다음과 같이 고정한다. 빈 값, 예상 밖 임시 경로 또는 Development가 아닌 source는 dump 전에 거부한다.

```bash
set -eu
test "${PGDATABASE:-}" = "heliumdb"
test -n "${restore_snapshot_id:-}"

restore_work_dir="$(mktemp -d /tmp/dgkma-restore.XXXXXXXX)"
case "$restore_work_dir" in
  /tmp/dgkma-restore.*) ;;
  *) exit 64 ;;
esac
chmod 0700 "$restore_work_dir"
dump_path="$restore_work_dir/development.dump"
install -m 0600 /dev/null "$dump_path"

pg_dump --format=custom --compress=9 --no-owner --no-acl --snapshot="$restore_snapshot_id" \
  --file="$dump_path" heliumdb
test -s "$dump_path"
test "$(stat -c '%a' "$restore_work_dir")" = "700"
test "$(stat -c '%a' "$dump_path")" = "600"
dump_sha256="$(sha256sum "$dump_path" | cut -d ' ' -f 1)"
test "${#dump_sha256}" -eq 64
```

Todo 22 executor는 raw snapshot ID가 process output이나 evidence에 유출되지 않았는지 검사한다. receipt timing은 `snapshot-start ≤ snapshot-observed ≤ dump-start ≤ dump-finish ≤ snapshot-finish ≤ restore-start ≤ restore-finish ≤ observed`이고 duration은 음수가 아니어야 한다. WAL LSN은 소문자 canonical 값만 허용한다.

### UUID-bound disposable restore와 sequence 60 gate

대상 resolver가 별도 lowercase UUIDv4에 결합된 `disposable-test`를 만들고 source와 다른 target fingerprint를 검증한 뒤에만 다음 명령을 호출한다. `development`나 `production-readonly` 대상, `heliumdb`, `neondb`, 임의 DB 이름은 restore 전에 거부한다.

```bash
set -eu
test "${restore_target_kind:-}" = "disposable-test"
test -n "${restore_database_name:-}"
test "${restore_database_name}" != "heliumdb"
test "${restore_database_name}" != "neondb"
test -s "${dump_path:-/nonexistent}"

PGDATABASE="$restore_database_name" \
  pg_restore --exit-on-error --single-transaction --no-owner --no-acl \
  --dbname="$restore_database_name" "$dump_path"
```

복원된 DB는 validation-only다. 앱을 시작하거나 일반 migration apply/reapply를 실행하지 않으며, schema ledger fingerprint 비교나 합성 관리자를 만들지 않는다. Standalone reconcile은 오직 `migrations/manual/0060_restore_security_reconcile.sql` 전체 파일만 허용한다. migration runner 또는 `0060_database_security.sql`의 파싱된 일부를 재사용하지 않는다.

reconcile 전에는 다음 순서를 모두 통과해야 한다: disposable target kind → materialized sequence 60 descriptor → sequence 60 artifact checksum → sequence 60 sidecar에 고정된 reconcile checksum → restore receipt binding → statement allowlist. 허용 범위는 owner, ACL, default privileges 복원뿐이다. extension·table·function·trigger·ledger·capability DDL/DML은 금지한다. 하나라도 누락·drift이면 SQL 실행 횟수 0으로 거부한다. Materialization은 실행 승인이 아니며, 실제 reconcile은 Todo 22의 측정 restore drill 안에서만 허용한다.

statement allowlist는 `REVOKE`나 `ALTER DEFAULT PRIVILEGES` 접두어를 일반 허용하지 않는다. 다음 exact form만 허용한다.

- database ACL은 `pg_catalog.format`과 `pg_catalog.current_database()`만 사용하는 고정 `$dgkma_restore$` DO block 안의 `GRANT CONNECT ... TO PUBLIC` 및 `REVOKE CREATE,TEMPORARY ... FROM PUBLIC` 두 문장이다.
- schema ACL은 `REVOKE ALL ON SCHEMA public FROM PUBLIC` 하나다.
- current relation ACL은 `public`의 `ALL TABLES`, `ALL SEQUENCES`, `ALL FUNCTIONS`, `ALL PROCEDURES`에서 PUBLIC의 모든 권한을 회수하는 네 exact form이다.
- default privileges는 `public`의 TABLES·SEQUENCES에서 PUBLIC의 모든 권한을 회수하는 두 form과, `IN SCHEMA` 또는 `FOR ROLE` 없이 전역 ROUTINES의 PUBLIC EXECUTE를 회수하는 한 form뿐이다.
- `--no-owner` restore로 생성된 application object는 검증된 disposable current user가 소유하고 `public` schema는 `pg_database_owner`가 소유해야 한다. reconcile은 임의 `ALTER ... OWNER`로 이를 교정하지 않고 pre/post owner catalog mismatch를 거부한다.

따라서 `REVOKE admin_role FROM app_owner`, 객체별 임의 REVOKE, 다른 schema/role/grantee, positive GRANT, `FOR ROLE`, schema-local routine default, owner 변경은 checksum과 receipt binding이 일치해도 transaction·DB 호출 전에 거부한다. Role membership은 pre/post catalog가 byte-identical해야 하며 reconcile이 변경할 수 없다.

### checksum-bound restore receipt

[restore-validation.schema.json](restore-contracts/restore-validation.schema.json)은 추가 필드를 금지하는 31-field receipt 계약이다. [restore-validation.descriptor.json](restore-contracts/restore-validation.descriptor.json)이 schema checksum, required sequence/artifact, future reconcile 경로, 대상과 authorization order를 고정한다.

receipt와 검증 입력은 RFC 8785 방식의 key-sorted canonical JSON 뒤 LF 한 바이트로 직렬화한다. `receipt_sha256`은 그 필드 자체를 제외한 canonical bytes의 SHA-256이다. receipt는 source/disposable fingerprint, UUID restore run, 서버와 dump/restore 버전, snapshot ID hash와 txid snapshot, WAL LSN, dump/restore 시각·duration, dump/source manifest/sequence 60/reconcile/pre-post security/schema/data checksum, 결과를 모두 포함한다. raw snapshot ID나 credential은 포함하지 않는다.

### 임시 파일 폐기와 teardown

receipt와 비식별 검증 로그를 evidence에 직렬화한 뒤, dump를 안전하게 unlink하고 disposable DB를 teardown한다. 삭제 대상은 위에서 검증한 `/tmp/dgkma-restore.` prefix와 정확한 dump 파일 하나뿐이다.

```bash
set -eu
case "${restore_work_dir:-}" in
  /tmp/dgkma-restore.*) ;;
  *) exit 64 ;;
esac
test "${dump_path:-}" = "$restore_work_dir/development.dump"
test -f "$dump_path"
shred --remove=unlink --zero "$dump_path"
rmdir "$restore_work_dir"
test ! -e "$dump_path"
test ! -e "$restore_work_dir"
```

Todo 22는 새 control 연결에서 disposable DB 부재까지 확인한다. dump cleanup이나 target teardown 중 하나라도 실패하면 drill은 verified가 아니다.

### rollout 순서, 잠금과 복구 판단

모든 스키마 release 순서는 `expand → capability/catalog preflight → ordinary → manual variant → verify → backfill → compatibility compare → explicit cutover`로 고정한다. 각 artifact 적용과 ledger 기록은 같은 transaction이다. 실패하면 현재 transaction만 rollback하고 이전 additive artifact는 inert 상태로 남긴 채 forward resume한다. destructive contraction은 이 계획에 포함하지 않는다.

rollout과 backfill·retention worker는 서로 다른 고정 PostgreSQL advisory-lock namespace를 사용한다. 한 release에는 전역 rollout lock 하나만 허용하며, 동일 target fingerprint에서 중복 실행은 lock 획득 전에 아무것도 쓰지 않는다. backfill은 manifest가 정한 안정 키 범위별 lock을 잡고 receipt checkpoint 뒤 재개한다. explicit cutover 뒤 문제가 발견되면 feature read를 이전 호환 경로로 되돌리거나 additive forward-fix를 적용한다. 이미 적용된 artifact나 ledger row를 삭제·수정해 rollback하지 않는다.

| 실패 시점 | 즉시 조치 | 재개 조건 | 금지 사항 |
|---|---|---|---|
| capability/catalog preflight 전·중 | 현재 probe transaction rollback | 동일 target identity와 capability receipt 재검증 | DDL 시작, 실패한 probe 결과 추정 |
| ordinary 또는 manual artifact 적용 중 | 현재 artifact transaction rollback | 이전 ledger checksum 재검증 후 첫 missing sequence부터 forward resume | 이전 ledger/artifact 삭제·수정 |
| verify 또는 backfill 중 | feature를 legacy/shadow에 유지하고 현재 batch rollback | catalog·checkpoint·호환 비교가 다시 일치 | 부분 cutover, destructive contraction |
| explicit cutover 후 read mismatch | feature read rollback 또는 additive forward-fix | 고정 comparison digest와 새 검증 receipt | legacy write 재개, 적용 artifact 역실행 |
| restore/reconcile drill 중 | exporter rollback, disposable teardown, dump 안전 폐기 | 새 UUID run과 새 snapshot으로 처음부터 재시도 | 실패 receipt를 verified로 변경, Development/Production reconcile |

Todo 22의 validation query는 같은 exported snapshot의 source digest와 restored target을 비교하되 대상 중립 필드만 사용한다. restore 직후에는 다음 read-only query를 실행해 disposable identity, row counts, schema/security catalog와 copied Development ledger bytes를 별도 evidence로 직렬화한다. `<expected_disposable_database>`는 resolver가 UUID에서 생성하고 descriptor에 결합한 이름이며 임의 입력이 아니다.

```bash
psql -X --csv -v ON_ERROR_STOP=1 \
  -v expected_database="$restore_database_name" \
  --dbname="$restore_database_name" <<'SQL'
BEGIN TRANSACTION READ ONLY;
SELECT current_database() = :'expected_database' AS target_ok \gset
\if :target_ok
\echo 'target_gate=ok'
\else
ROLLBACK;
\quit 64
\endif
SELECT current_database(), current_user,
       current_setting('server_version_num')::integer AS server_version_num;
SELECT schemaname, relname, n_live_tup::bigint
FROM pg_stat_user_tables
ORDER BY schemaname, relname;
SELECT sequence_no, artifact_id, artifact_sha256, target_fingerprint
FROM schema_migration_ledger
ORDER BY sequence_no;
SELECT n.nspname, c.relname, c.relkind, c.relowner, c.relacl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY c.relkind, c.relname;
ROLLBACK;
SQL
```

위 target gate 결과가 `ok`가 아니거나 source의 table별 count/content digest, target-neutral schema catalog, sequence 60 이후 expected disposable-owner security catalog 중 하나라도 다르면 reconcile transaction을 rollback하고 drill을 rejected로 기록한다. DB name/OID/owner identity와 외부 receipt 자체는 source-target equality 대상에서 제외한다.

### retention worker 계약

retention worker는 매시간 전용 advisory lock을 하나 획득하고, 각 정책을 안정 키 순서의 `500행 또는 5초` 단위로 처리하며 실행당 `최대 10개 batch`에서 멈춘다. 동일 정책 checkpoint와 HMAC 입력 버전을 receipt에 남겨 재실행 가능하게 한다. HMAC secret이 없으면 삭제를 시작하지 않는다.

- 만료된 `session`은 현재 시각 기준으로 삭제한다.
- OAuth state는 만료 후 24시간이 지난 행을 삭제한다.
- identity termination은 30일이 지난 행을 삭제한다.
- rejected pending registration은 reject 후 30일이 지났고 `pii_redacted_at IS NULL`인 행만 redact 대상으로 삼는다.
- actor, audit, source와 financial 기록은 retention worker가 삭제하지 않는다.

### Production gate

Production cutover에는 materialized artifact checksum, capability/catalog preflight, Development validation, Todo 22의 measured restore receipt와 명시적 사용자 승인이 모두 필요하다. 이 중 하나라도 없으면 Production backup, restore, reconcile, migration, deploy 또는 Republish를 실행하지 않는다. 이 문서의 command를 Production credential이나 `neondb`에 맞게 치환하는 것도 승인된 경로가 아니다.

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
