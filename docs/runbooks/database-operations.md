# 데이터베이스 운영 런북

이 문서는 승인된 DB 작업의 환경 선택·변경·보존·결과 확인 절차다. 구조는 [스키마 기준서](../reference/database-schema.md), 제품 정책은 [계획서](../product/planning-proposal.md)를 따른다. 승인·실행·백업·catalog 결과는 [수행·변경 이력](../history/README.md)에서 확인한다.

## 회원 상태와 변동 이력 전환

개발 전용 [회원 상태 전환 SQL](../../scripts/member-status-development.sql)은 별도 DB 적용 승인 후에만 사용한다. 기존 앱의 쓰기를 멈추고 개발 PG 변수와 실제 DB가 heliumdb인지 확인한다. 기본 실행은 임시 뷰에서 상태별 건수를 집계한 뒤 롤백한다. 적용은 같은 파일에 `-v apply=true`를 지정한다. 미확인 명부 상태, 심사와 승인 플래그의 충돌은 먼저 검토한다. 기존 명부의 ‘정회원’은 가입 심사 대기·거부 건이 없고 카카오 연결과 가입 승인이 모두 있으면 ‘가입 완료’, 둘 다 없으면 ‘미가입’으로 전환한다. 한 조건만 충족하면 분류를 보류한다. 회비·권리회원 판정과 접근 권한은 보존한다. 전환 자료 중 공란·정상은 연결된 카카오 계정의 승인 여부와 심사 기록으로 분류한다. 확인되지 않은 과거 탈퇴·사망을 추정하지 않는다. 승인된 적용 시 같은 입력을 잠가 다시 판정하고 현재 상태·제약·이력 트리거를 함께 전환한다. 최초 이력은 빈 배열로 두고 배포 후보를 같은 작업에서 활성화한다. 새 연결에서 상태별 건수·승인 계정 일치·이력 배열·제약과 트리거를 검증한다. 구버전 앱이나 최초 명부 수입기로 회원 상태를 다시 쓰지 않는다. [개발 전환 결과](../history/member-status-candidate-2026-11-21.md)를 확인하고 적용 SQL을 재실행하지 않는다.

전환 후 사무국은 권한이 있는 CLI에서 대상 UUID를 바인딩해 `SELECT alumni_status, membership_history FROM public.users WHERE id = $1`로 현재 상태와 이력을 열람한다. 홈페이지와 사무국 SQL 모두 이력은 DB 트리거만 추가한다. 사무국의 [동문 사망 처리](#동문-사망-처리) 명령이 동문 상태를 `사망`으로 변경하면 트리거가 ‘사망 기록’과 DB 기록 시각을 남긴다. 실제 사망일은 확인한 경우에만 명부 메모에 적는다. 날짜를 뒤늦게 확인하면 기존 메모를 보존하며 날짜만 보완한다. 회원 검색 API에는 이력을 넣지 않는다. 탈퇴 접수는 카카오 연결 해제 확인과 명부 상태·세션·가입 프로필 정리가 완료된 트랜잭션에서 성립하며 해당 요청의 트랜잭션 시작 시각을 기록한다. 실패는 요청자에게 알려 재시도할 수 있게 한다.

## 승인 상태 변경의 데이터 경계

승인 취소·거부 보존·재심사는 `users.is_verified`·`pending_registrations.status`와 세션·OAuth 종료 marker를 사용하는 앱의 관리자 심사 트랜잭션으로 처리한다. 6.3.0의 심사 결정과 동문 상태 변경은 같은 트랜잭션에서 처리한다. 상태 이력은 개발·운영 DB에 설치한 트리거가 기록한다. 거부 자체는 탈퇴·카카오 unlink·레코드 삭제로 처리하지 않는다. 명시적 거부 신청 삭제는 unlink 성공 뒤 신청만 삭제하며 기존 회원·콘텐츠·회비·명부 연결을 유지한다. 실제 탈퇴는 별도의 삭제·보존 절차를 따르고, 과거 삭제된 신청을 추정해 재생성하지 않는다.

## 실행 범위

역사관 공개 콘텐츠 구현은 [정적 자료 계약](../reference/heritage-content.md)을 사용한다. DB 조회·DDL·seed·`db:push`는 필요하지 않다. 향후 DB 저장이 필요하면 현재 정적 자료와 제안 테이블·관계·접근 범위·이관 대상을 설명하고 사용자 승인 후 개발 DB에만 적용한다.

게시글 보존과 회비·권리회원 판정은 [제품 정책](../product/planning-proposal.md)을 따른다. 목표 정책 결정만으로 등급 재계산·직책 이관·DB 변경을 실행하지 않는다.

- 개발 DB가 기본이다. 개발 작업을 완료했다고 운영 DB 변경·배포까지 이어서 수행하지 않는다. 운영 대상·행위는 사용자가 승인한 범위에서만 선택한다.
- 코드·문서의 정적 검사와 직접 DB 작업을 구분한다. 문서 정리만 하는 작업에서는 DB에 연결하지 않는다. 전체 테스트·빌드·서버 재시작·실계정 QA는 DB 변경의 공통 선행 조건이 아니다.
- 개별 작업의 데이터 보존 요청을 우선한다. 스키마 변경과 데이터 변환을 구분하고, 변경 전에는 preview·적용 순서·새 연결의 사후 확인을 준비한다. 별도 백업은 아래 기본 정책을 따른다.
- 성공한 변경의 자동 원복은 하지 않는다. 복구 수단의 존재와 실제 복원 승인은 별개다. 실패한 미커밋 트랜잭션 종료는 성공한 변경의 원복과 구분한다.
- URL·비밀번호·토큰·행 원문을 문서·Git·셸 기록·채팅에 남기지 않는다.

## DB 복구·백업 기본 정책

개발·운영 DB 모두 Replit의 7일 복구를 기준으로 삼고 별도 DB 백업을 만들지 않는 것을 기본으로 한다. 스키마 변경·데이터 변환·명부 동기화·초기화·릴리스에 동일하게 적용한다.

- 개발은 Replit의 checkpoint 복구, 운영은 PITR을 사용한다. 복구 시 [Replit 공식 안내](https://docs.replit.com/features/data-and-storage/data-recovery)와 해당 환경의 실제 설정·사용 가능한 복구 지점을 확인한다. 정책에 정한 기간을 실제 복구 가능 여부의 확인 결과로 대신하지 않는다.
- 별도 dump·행 원문 사본·복구용 snapshot·추가 예약 백업을 기본 단계로 생성하거나 활성화하지 않는다. 별도 백업은 사용자가 해당 작업에서 명시적으로 요청하거나 승인한 경우에만 만든다. 기존 데이터 보존 요청 자체를 추가 백업 생성 승인으로 해석하지 않는다.
- 변경 전후 건수·구조 metadata·SQL preview·적용 결과는 필요한 범위에서 기록한다. 이는 행 원문을 담는 복구용 백업과 구분하며 schema-only dump도 기본 필수 단계로 만들지 않는다.
- 별도 백업이 승인되면 대상·보존 위치·기간을 정하고 Replit 비공개 경로의 디렉터리 0700·파일 0600으로 제한한다. Mac·Git·채팅으로 복제하지 않는다.
- 기존 백업 삭제, Replit 복구·예약 백업 설정 변경, 실제 복원은 별도 요청·승인 범위에서 처리한다. 과거 작업의 백업 기록은 이력으로 유지하며 신규 백업 생성 지시로 재사용하지 않는다.

## 환경 선택

| 구분 | Development | Production |
|---|---|---|
| 역할 | 구현과 승인된 개발 DB 작업 | Republish된 서비스의 DB |
| 연결 확인 기준 DB 이름 | `heliumdb` | `neondb` |
| 기본 연결 | Replit PG* | 명시적으로 선택한 Replit Secret URL |

실행할 때 실제 DB 이름을 확인한다. 구조와 마지막 catalog 근거는 [스키마 기준서](../reference/database-schema.md#기준-소스와-마지막-db-관찰)를 참조한다. UUID 전환 전에는 Google Sheets가 명부 관리 원본이고 PostgreSQL `alumni_database`는 로그인·가입 심사용 런타임 복제본이다. 로그인 요청은 Sheets를 직접 조회하지 않는다.

## SSH 접속

로컬 Mac에서 다음 SSH 명령으로 Replit 개발 워크스페이스에 접속한다.

```bash
ssh -i ~/.ssh/replit -p 22 dc5e5541-525b-4ad6-b914-2d2db70cb4a9@ssh.sisko.replit.dev
cd /home/runner/workspace
```

사용자명은 Replit ID 전체이며 Mac 계정명이나 `runner`가 아니다. 호스트가 바뀌면 Replit의 SSH 접속 명령을 다시 확인한다.

이 SSH는 Replit 개발 워크스페이스에 연결된다. autoscale 프로덕션 인스턴스의 셸이 아니다. 다만 개발 워크스페이스에 `PROD_DATABASE_URL`이 설정되어 있으면 SSH 프로세스가 그 URL을 명시적으로 선택해 Production Database에 직접 연결할 수 있다.

## DB 선택 원리

[`server/db.ts`](../../server/db.ts)는 다음 순서로 연결 대상을 선택한다.

1. `PGHOST`, `PGUSER`, `PGDATABASE` 등 Replit `PG*` 환경변수
2. `DATABASE_URL`

따라서 SSH에서 앱 코드나 `server/db.ts`를 그대로 실행하면 Development Database가 기본이다. 단순히 `DATABASE_URL="$PROD_DATABASE_URL"`을 앞에 붙여도 `PG*`가 남아 있으면 여전히 Development Database를 사용한다.

- 로그의 `Connecting to PostgreSQL database (local/replit)...`는 개발 DB 선택을 뜻한다.
- 로그의 `Connecting to PostgreSQL database (remote)...`는 원격 URL 선택을 뜻한다.
- 환경 이름이나 명령 모양만 믿지 말고 `current_database()`와 기준 테이블 건수를 확인한다.

`drizzle.config.ts`는 앱과 달리 `DATABASE_URL`을 직접 사용한다. `db:push` 실행 전에는 그 URL의 실제 대상도 확인한다. 두 연결 경로가 항상 같은 DB라고 가정하지 않는다.

## 개발 변경

JSONB 안의 앱 문서 스키마·편집기 기능·업로드 검증만 바꾸고 DB 컬럼·제약·기존 행 변환에 영향이 없으면 DDL·catalog 재조회·`db:push`를 추가하지 않는다. 본문과 첨부의 저장 계약은 [편집기 기준](../reference/post-editor.md)과 [스키마 기준서](../reference/database-schema.md)를 따른다.

1. 요청된 대상·변경과 보존 범위를 정하고 Replit 개발 checkout·실제 연결 DB를 확인한다.
2. 스키마 작업이면 metadata-only catalog와 의존 객체를, 데이터 작업이면 변경 전 집계를 준비한다. [DB 복구·백업 기본 정책](#db-복구백업-기본-정책)에 따라 별도 백업은 기본으로 생성하지 않는다.
3. 해당 변경의 SQL·변환 preview를 확인한다. `session`은 Drizzle 관리 대상에서 제외돼 있다. `db:push`가 rename/drop 후보를 제시하면 자동 응답하지 말고 diff와 실제 대상을 확인한다.
4. 가능한 트랜잭션에서 승인된 개발 변경만 적용한다. 스키마와 본문 변환은 호환성에 맞춰 순서를 정한다.
5. 새 연결에서 컬럼·제약·영향 행·보존 건수를 확인한다. 스키마 변경이면 catalog와 기준서를 함께 갱신한다. 앱 코드 변경의 정적 검사는 [개발 기준](../../AGENTS.md#개발-직후-점검)을 따른다.
6. 적용 대상·전후 상태·수행 결과를 기록하고 연결을 종료한다. 개발 서버 재시작·기능 실행은 별도로 요청되었거나 구체적 오류 해결에 필요한 범위에서만 수행한다.

### 개발 회비수입원장 이관

개발 DB에 첫 원장 이관을 마쳤다. [개발 이관 기록](../history/dues-ledger-development-2026-11-21.md)에 대상과 검산 결과가 있다. 이후 원장에 추가된 입금은 전체 원장과 기존 DB를 대조한 뒤 증분 반영한다. 회비 판정과 운영 이전은 별도 단계다. 개발 워크스페이스의 Sheets 읽기 전용 서비스 계정에 사무국 회계장부 조회 권한이 필요하다. SQL도 원장 표기를 UTF-8 기준으로 검사해 한글 이름을 보존하고 제어문자와 연락처를 차단한다.

귀속연도가 없는 대표 수입에 분개가 이어지면 실입금액과 분개 합계를 대조하고 한 입금으로 처리한다. 피벗은 귀속연도가 있는 분개만 합산한다. 시트에 분개만 표시된 거래는 연도별 장부의 원입금을 확인한다. 개인별 배분은 확인된 동문 ID에 연결하고, 동명이인·명부 미일치·성명불상을 구분해 건수와 금액을 보고한다.

2025년까지 마감된 일반회계 결산에서 동문 ID가 연결되지 않은 실명 납부는 원장의 이름·기수·금액으로 확정한다. 이런 행은 신원 확인 대기 목록에서 제외하며 동명인 계정에 임의로 연결하지 않는다. 원장에 성명불상으로 기록된 거래는 그 표기를 유지한다. 이 기준은 실제 입금연도에 적용한다. 검산 CLI는 계정 미연결 실명 납부를 별도 건수·금액으로 집계한다. 이관 형식이 원장 명의를 보존할 수 있을 때 해당 묶음을 생성한다.

같은 입금 안에서 이름·금액이 같은 분개가 반복되면 원장 행을 모두 보존한다. 비공개 대조표의 `duplicateRows`별로 당월분·보충분 등 사무국 근거를 확인한 뒤 각 행의 `overrides`에 동문 ID를 지정한다. [일반회계 장부 작성 매뉴얼 제4절](https://app.notion.com/p/41e2225d9c4d8196a397de7ac2b60c4b)에 따라 혼합 입금은 `groups`에 은행 총액(`bankAmount`), 회비 몫(`amount`), 다른 용도 분개 합계(`otherAmount`)를 기입한다. 읽기 전용 대조에서는 세 값의 관계와 회원별 회비 배분을 검산한다. 이관 묶음은 일반 입금과 혼합 입금 모두 은행 총액과 회비 몫을 전달한다. DB는 각각 `dues_receipts.bank_amount`와 `amount`에 저장하며 재실행 때 두 금액을 모두 대조한다. 다른 용도 분개는 회비 집계에 포함하지 않는다.

1. [검산 CLI](../../scripts/reconcile-dues-ledger.mjs)를 옵션 없이 실행하면 `회비수입`의 원장 전체와 두 피벗을 같은 요청으로 읽어 대조한다. J2는 표시된 모든 연도의 건수와 금액을 비교하고, 납부자 내역이 접힌 연도는 상세 미검사로 표시한다. 개인별 대조가 필요하면 사무국이 펼친 피벗으로 다시 확인한다. Q1은 표시된 연도의 회원별 금액을 비교한다. 이 명령은 시트 조회이며 DB를 변경하지 않는다.
2. `--template 새파일`로 비공개 사무국 대조표를 만든다. `members`에는 확인된 납부 표기별 동문 UUID, 동명이인 등 예외에는 `overrides`의 개별 행 키를 사용한다. `groups`의 분개 후보는 실제 단체 입금과 구성원을 확인하고 원입금액을 기입한다. 별개 입금으로 확인된 후보는 해당 묶음에서 빼고 빈 묶음을 제거한 뒤 `singles`에 지정한다. 성명불상은 자동으로 미배분 처리한다. 근거가 없어 미배분으로 확인한 다른 단건은 대조표의 `unallocated`에 해당 원장 키를 지정한다. `--review 기존파일 --template 새파일`은 계속 늘어나는 원장의 신규 확인 대상을 추가한다. 행번호는 대조 위치이며 거래 키에는 사용하지 않는다. 대조표의 `keySecret`은 입금·배분 키를 만드는 비밀값이다. 최초 이관 이후에도 같은 대조표와 키를 재사용한다. 대조표·이관 파일은 접근 제한 디렉터리에 두며 Git에 추가하지 않는다.
3. `--review 대조파일`로 모든 입력 행이 정확히 한 번 포함되는지, 입금별 배분 합계와 확인된 동문 ID 형식을 점검한다. 실제 DB 대조는 `--review 대조파일 --compare-db`로 수행한다. 별도의 `--verify-db`는 새 연결에서 추가 예정 건수까지 0인지 확인한다. 기존 자료 변경·누락, 중복 가능성이 있는 기존 납부, 확인되지 않은 동문 연결은 자동 처리하지 않는다.
4. [개발 스키마 SQL](../../scripts/add-dues-ledger-development.sql)은 `heliumdb`에 적용을 마쳤다. 데이터 이관 시 이 SQL을 재실행하지 않는다. 원장 테이블과 납부 연결 컬럼은 SQL로 관리하므로 Drizzle 전체 동기화로 덮어쓰지 않는다.
5. 데이터 이관 승인 후 아래 예와 같이 기존 대조표로 전체 묶음을 만들고 CLI가 출력한 지문을 사용한다. 묶음 생성은 시트 검산과 개발 DB 읽기 대조에 성공해야 가능하고 기존 파일을 덮어쓰지 않는다. SQL은 지문·개발 대상·기존 입금과 배분을 재확인하고 트랜잭션에서 새 입금만 추가한다. 적용 후 CLI의 `--verify-db`로 다시 읽어 검산한다.

```sh
node scripts/reconcile-dues-ledger.mjs --review "$dues_review" --bundle "$dues_bundle"
psql -X -v bundle_sha256="$dues_sha256" -f scripts/import-dues-ledger-development.sql < "$dues_bundle"
node scripts/reconcile-dues-ledger.mjs --review "$dues_review" --verify-db
```

관리자는 **관리자 → 회비수입**에서 DB 기준 귀속연도·납부자별 금액과 건수, 회원별 연간 금액을 조회한다. 미배분액을 총액에 한 번 포함하고, 회원 연결을 해제한 건은 익명으로 집계한다. 홈페이지의 기존 납부 내역과 권리회원 판정에는 이관 검토 중인 납부를 반영하지 않는다.

### 스키마 카탈로그 재검증

직접 DB 관찰이며 정적 검사가 아니다. 요청된 스키마 변경 또는 catalog 확인 범위에서만 다음 읽기 전용 스크립트를 사용한다.

```bash
psql -X --csv -v ON_ERROR_STOP=1 -v expected_database=heliumdb \
  -f scripts/database-schema-catalog.sql
```

대상 이름·READ ONLY·ROLLBACK·`__CATALOG_INSPECTION_COMPLETE__`를 확인한다. 이름·타입·기본값·제약·인덱스·시퀀스·뷰·트리거·RLS·정책·루틴·enum·domain과 코드의 차이를 기록한다. 과거 객체 수를 고정 통과 조건으로 쓰지 않는다. 스키마·runtime DDL·migration 변경 시 같은 변경에서 [스키마 기준서](../reference/database-schema.md)를 갱신한다. 행 원문은 catalog 대상이 아니다.

### 별도로 요청된 격리 개발 DB 검사

`npm run test:development-db`는 DB 쓰기와 fixture 생성·정리를 포함하므로 정적 검사에 포함하지 않는다. 승인된 경우에만 현재 스키마가 준비된 격리 Development DB에서 실행한다. 사용자 지침의 합성 자료·새 DB 생성 허가 기준도 적용한다.

`server/tests/development-db-target.ts`의 opt-in·환경·허용 PG host·DB 이름 검증을 모든 실제 DB 검사에서 공통으로 사용한다. 일반 `npm test`는 PG*나 DATABASE_URL의 존재만으로 DB 검사를 실행하지 않는다. 전용 명령은 가입/승인/거절 경쟁·탈퇴·OAuth state·경조사 quota의 기존 DB 사례를 선택한다. 정확한 파일 목록은 [package.json](../../package.json)을 따른다.

DB 검사는 임시 회원·신청·세션 등을 쓰므로 같은 승인 경계를 적용한다. 실행 전 환경 선택과 실제 `current_database()=heliumdb`를 확인하고 기존 정리·잔여 확인을 유지한다.

## 운영 변경

운영 DB 변경이 승인된 작업에 아래 절차를 사용한다.

1. 승인 대상과 적용할 후보 SQL/변환 코드를 확정한다. Replit Secrets의 운영 URL을 해당 프로세스에만 전달한다. 개발 PG* 기본값이나 Secret 자체를 변경하지 않는다.
2. 사전 읽기는 `PROD_DATABASE_READONLY_URL`을 우선하고, 없으면 owner URL을 `BEGIN READ ONLY` 트랜잭션으로 제한한다. `current_database()=neondb`, 실제 구조·변경 전 건수·의존 관계를 확인한다.
3. metadata-only catalog와 preview를 준비하고 기존 데이터의 보존 기준·변경·제거 객체를 명시한다. [DB 복구·백업 기본 정책](#db-복구백업-기본-정책)에 따라 Replit 복구를 기준으로 하며 별도 백업 생성을 공통 선행 조건으로 두지 않는다.
4. 코드를 함께 배포해야 하면 후보 Git 통합과 빌드가 준비됐는지 확인한다. 호환되는 additive 변경은 새 코드보다 먼저 적용할 수 있다. TEXT→JSONB처럼 비호환 변경은 잠금·변환·새 코드 전환 순서와 간격을 별도로 정한다. 과거 실행 순서를 모든 릴리스에 일반화하지 않는다.
5. 실행 직전 대상과 preview 기준의 변화 여부를 재확인하고 가능한 한 트랜잭션으로 승인 범위만 적용한다. 이미 같은 구조이면 중복 적용하지 않는다. Replit이 웹 스키마 검토를 요구하면 승인된 SQL을 검토하며 우회하지 않는다.
6. 새 READ ONLY 연결에서 실제 구조·변환 결과·본문 외 값·전체 보존 건수를 대조한다. metadata-only catalog와 적용 이력을 기록한다.
7. 배포도 승인된 작업일 때만 [Replit 배포 절차](../../replit.md#배포)로 진행한다. 운영 HTTP smoke와 실제 회원 QA의 실행 범위·결과를 구분한다.
8. 연결을 닫고 적용/미적용·오류·남은 조치를 보고한다. 배포 실패나 불일치가 있으면 상태를 보존해 보고하며 별도 승인 없이 원복하지 않는다.

### 운영 기본명부와 회비 구조 전환

Replit 개발 워크스페이스에서 `node scripts/promote-membership-production.mjs`를 실행하면 개발 기본명부와 운영 UUID 명부를 읽기 전용으로 대조한다. 개발 연결은 기존 PG 환경변수를, 운영은 Replit Secrets의 운영 URL을 명시적으로 사용한다. 적용 전 두 환경의 DB 이름, 운영에만 있는 UUID, 신규 등록 수, 별칭 소유자와 가입 상태 충돌을 확인한다.

6.3.0은 기존 운영 사이트 전체를 일시 중단하고 DB를 전환한 뒤 게시한다.

1. **기존 운영 사이트 일시 중단.** Replit Publishing에서 현재 운영 배포를 `Pause`하고 중단 상태를 확인한다. 별도 세션의 익명 요청으로 공개 홈과 회원 API에서 기존 앱이 응답하지 않는지 확인한다. 처리 중인 회원 거래가 종료될 때까지 기다린다. 현재 환경에 일시 중단 기능이 없거나 기존 배포의 중단을 확인할 수 없으면 DB 적용 전에 멈춘다.
2. **운영 DB 전환과 검증.** 중단 상태에서 읽기 전용 미리보기를 다시 실행하고 `node scripts/promote-membership-production.mjs --apply=<미리보기 지문>`을 실행한다. 도구는 진행 중인 회원 거래와 지문을 확인한 뒤 한 트랜잭션으로 전환한다. 운영 UUID에는 확정된 명부 필드를 연결하고 신규 동문을 사전 등록한다. 승인·카카오 연결·심사는 운영 값으로 판정하고 과거 가입일·이력을 소급하지 않는다. 기존 별칭은 옛 명부 연결을 따라 해당 UUID로 옮기며, 회비는 빈 원장과 납부 연결 컬럼만 추가한다. 커밋 전 및 새 읽기 전용 연결에서 계정·신청·명부·별칭·상태·회비 구조를 대조하고 metadata-only catalog를 확인한다. 추가 대조 명령은 `node scripts/promote-membership-production.mjs --verify`이며, 가입·납부가 재개되기 전 사용한다.
3. **6.3.0 게시와 서비스 재개.** DB 검증 후 승인된 후보를 Republish한다. 자동 DDL이 제시되면 적용을 중단하고 이미 전환한 운영 구조와 제안된 SQL을 대조한다. 해당 게시의 승격 성공·배포 ID·후보 커밋을 확인한다. 승격 후에도 사이트가 일시 중단 상태이면 **6.3.0이 현재 배포인지 확인한 후** Resume한다. DB 전환 이후에는 이전 버전을 다시 열지 않는다.
4. **익명 운영 smoke.** 공개 홈·메타데이터·운영 HTML의 후보 번들·회원 전용 API의 비로그인 응답을 확인한다. 운영 중단·재개 시각, DB 변경 건수와 검증 결과, 배포 ID와 HTTP 응답을 릴리스 기록에 남긴다.

6.3.0의 [운영 전환 미들웨어](../../server/middleware/membership-cutover.ts)는 운영 DB `neondb`의 `public.dues_receipts`와 회원 이력·회비 익명화 트리거의 활성 상태를 읽는다. 확인 전에는 `Retry-After: 5`와 HTTP 503을 반환하며, 확인이 끝난 인스턴스는 회원 요청을 다시 받는다. 운영 전환 커밋과 새 연결에서의 두 트리거 확인, 모든 운영 인스턴스의 승격 및 익명 smoke 결과를 릴리스 기록에 남기면 다음 버전에서 미들웨어와 등록 코드를 제거한다.

2026-11-21 17:57 KST에 운영 DB를 전환하고 새 연결에서 기본명부·승인·심사·별칭·트리거와 빈 회비 원장을 검증했다. 운영 대상 DDL은 재실행하지 않는다. 회비 원장 자료는 개발에만 이관했으며 운영 거래 이관과 연도별 권리회원 등급 전환은 별도 작업이다. [6.3.0 운영 DB 전환 기록](../history/release-6.3.0-2026-11-21.md#운영-db-전환)

### Secret 수명과 명시적 연결

정식 오픈 전 반복 운영 작업이 끝날 때까지 owner `PROD_DATABASE_URL`은 Replit Secrets에 유지한다. 반복 조회용 `PROD_DATABASE_READONLY_URL`을 우선한다. URL의 존재는 접근·변경 승인이 아니며 Mac `.env`, 저장소, 문서 또는 채팅에 복제하지 않는다. 설정 확인은 값 없이 존재 여부만 출력한다.

앱의 `server/db.ts`를 사용하는 명시적 운영 스크립트는 PG* 우선순위의 영향을 받는다. 필요한 승인 작업에서만 해당 자식 프로세스의 PG*를 제거하고 운영 URL을 전달한다. 일반 앱 실행·개발·시험에서는 PG*를 해제하지 않는다. `pg.Client/Pool`에 URL을 직접 넘기는 운영 전용 도구는 그 연결을 명시적으로 검사한다. 셸 전체의 환경변수를 운영용으로 바꾸지 않는다.

사용자가 반복 운영 작업 종료 또는 launch hardening을 명시하면 이 수명 기준을 먼저 갱신하고 owner Secret을 제거한다. 명령 종료 때 Secret을 자동 삭제하지 않는다.

## 동문 사망 처리

사무국은 사망을 확인한 동문 한 명의 고정 UUID를 대조한 후 Replit 개발 워크스페이스에서 [사망 처리 CLI](../../scripts/record-alumni-death.ts)를 사용한다. `$ROSTER_ID`는 그 동문의 UUID다. 실제 사망일이 확인된 경우에만 두 명령에 같은 `--date YYYY-MM-DD`를 추가한다.

```sh
node --import tsx scripts/record-alumni-death.ts --id "$ROSTER_ID"
node --import tsx scripts/record-alumni-death.ts --id "$ROSTER_ID" --apply "$PREVIEW_HASH"
```

첫 명령은 읽기 전용이다. 변경할 항목과 지문을 확인해 `PREVIEW_HASH`에 넣는다. 두 번째 명령은 명부 쓰기를 잠근 뒤 같은 동문과 변경 내용을 다시 확인한다. 첫 사망 처리에는 명부 전체 대체번호 최댓값의 다음 번호를 배정하고 그룹을 `본인사망`, 상태를 `사망`으로 바꾼다. 이미 사망 처리된 동문의 대체번호는 유지한다. 새 번호가 필요한데 끝 번호가 9999라면 변경 전체를 중단한다. 확인된 사망일은 기존 메모를 보존하면서 `사망일: YYYY-MM-DD`로 기록한다. 이미 같은 날짜가 있으면 그대로 두며 기존 사망일과 다르면 사무국에서 원자료를 대조한다. 날짜만 보완할 때 상태 이력은 늘어나지 않는다.

적용 후 첫 명령을 같은 UUID·날짜로 다시 실행해 새 연결에서 `변경 없음`을 확인한다. 자유서술 메모에 고인과 가족의 날짜가 함께 있으면 사무국이 원자료를 대조한다.

사망 전환의 이력과 기존 세션·승인·관리자 권한 해제는 회원 상태 트리거가 처리한다. 명부 UUID·성명·학적은 유지한다. 발송 명단을 만들 때는 사망 상태와 대체번호를 제외하고 카카오 프로필 번호로 대체하지 않는다. 홈페이지에는 SMS 발송 경로가 없다.

## 동문 기본명부 관리

개발 대상은 `heliumdb`다. 기장이 제출한 새 기수는 졸업 전 CLI로 일괄 등록한다. 관리자 SQL에서 입력을 임시 staging으로 받아 UUID·성명 누락, 입력 내 중복, 기존 UUID와의 충돌을 확인한다. 중복·동일인 여부를 해결한 뒤 한 트랜잭션에서 새 사람만 `users(id, name, alumni_name, department, generation, …)`에 등록한다. 연락처가 없어도 UUID를 부여하고 카카오 연결·승인·가입일은 기본 미가입 상태로 둔다. 새 사람과 기존 사람 정정을 upsert로 섞지 않는다.

신규 등록은 [기수 등록 SQL](../../scripts/add-roster-cohort-development.sql)을 쓴다. 기수 명부와 누락 동문 한 명에 같은 형식을 사용한다. 기존 동문 여부를 확인한 뒤 신규 행에 고정 UUID를 발급한다. UTF-8 CSV 헤더는 아래 순서다.

```csv
id,department,generation,alumni_name,admission_date,graduation_date,alumni_mobile,alumni_group,alumni_status,alumni_position,alumni_memo
```

보호된 입력 파일의 경로를 `ROSTER_CSV`에 지정한다. 개발 워크스페이스에서 `psql -X -f scripts/add-roster-cohort-development.sql < "$ROSTER_CSV"`로 예정 건수를 확인한다. 같은 파일로 명령에 `-v apply=true`를 추가하면 신규 행만 등록한다. UUID 누락·중복·기등록은 전체를 중단한다. 상태 전환 후 신규 기수의 공란·정상은 미가입으로 등록하며 사망 외에 확인되지 않은 상태는 일괄 등록을 중단한다.

이미 사망 처리된 신규 등재 자료는 원본의 그룹 `본인사망`과 배정된 대체번호를 함께 등록한다. 기수 등록은 입력과 기존 명부 사이에서 대체번호가 겹치면 중단한다. 일반 휴대전화 정정으로 사망자의 대체번호를 변경하지 않는다.

기존 명부의 휴대전화 정정은 관리자 psql 세션에서 다음과 같이 처리한다. 연결 대상 확인 후 값을 입력하고 UPDATE 1건을 확인한 뒤 COMMIT한다. 다른 결과는 ROLLBACK한다. 세션 변수의 실제 값은 이력이나 문서에 복사하지 않는다.

```sql
\prompt '동문 UUID: ' roster_id
\prompt '정정할 명부 휴대전화: ' roster_mobile
BEGIN;
SELECT current_database();
SELECT id FROM users WHERE id = :'roster_id'::uuid AND alumni_name IS NOT NULL FOR UPDATE;
UPDATE users SET alumni_mobile = nullif(:'roster_mobile', '')
WHERE current_database() = 'heliumdb' AND id = :'roster_id'::uuid
  AND alumni_name IS NOT NULL AND alumni_status <> '사망';
```

기존 동문은 UUID로 한 행을 잠그고 확인한 명부 필드만 UPDATE한다. 가입 프로필과 권한은 명부 정정 대상에서 제외한다. 별칭은 같은 UUID에 current_name/former_name과 정규화 이름을 기록하며 대표 이름은 최대 하나다. 대기·거부 신청은 원래 신청을 재대조한다. 작업 후 새 연결에서 건수와 변경한 항목만 대조하고 개인정보를 로그에 남기지 않는다.

개발 별칭 전환은 `scripts/link-roster-aliases-development.sql`로 수행한다. 옛 명부의 matched_user_id로 별칭을 대조하고 소유자 미확인 시 전체를 취소한다. 기존 별칭 행, 대표 이름, 신청 기록과 옛 테이블은 유지한다. 운영 기본명부와 별칭도 [운영 전환 절차](#운영-기본명부와-회비-구조-전환)로 적용했다.

## DB 스크립트 선택

[DB 스크립트 분류](../reference/database-scripts.md)에서 파일별 대상·읽기/쓰기 효과·재사용 조건을 확인한다. 완료된 전환 스크립트를 일괄 재실행하거나 신규 설치 순서로 사용하지 않는다. 초기 checked-in migration만으로 현행 전체 구조가 재현된다고 가정하지 않으며, 새 DB 준비는 별도 요청 범위에서 설계한다.

## 정식 오픈 전 초기화

초기 개발 종료·운영 시작 선언 전의 허용 범위는 [Replit 데이터 정책](../../replit.md#정식-오픈-전-데이터-정책)을 따른다. 아래 표에서 작업에 필요한 대상을 정하고 외래키·세션 등 논리 참조도 확인한다. 가능한 트랜잭션과 새 연결의 건수 확인을 사용한다.

| 분류 | 현행 테이블 | 처리 기준 |
|---|---|---|
| 회원·게시·납부 | `comments`, `posts`, `payments`, `alumni_name_aliases`, `alumni_database`, `pending_registrations`, `event_parse_rate_limits`, `users` | 해당 작업 대상만 정한다. 부모 users·posts·alumni_database보다 참조 자식이나 연결 해제를 먼저 처리한다 |
| 인증 상태 | `session`, `kakao_oauth_states`, `kakao_identity_terminations` | 관련 로그인 상태·종료 경쟁 영향까지 범위에 포함된 경우에만 정리한다 |
| 기준·수집 데이터 | `categories`, `source_collection_rules` | 회원 초기화에 묶어 삭제하지 않는다. 유지 또는 별도 초기화 대상을 명시한다 |

`community_events`·`obituaries`는 양쪽 DB에서 제거돼 초기화 대상이 아니다. Object Storage 파일, 스키마·테이블, Secrets와 Git 이력 삭제는 이 허용 범위에 포함되지 않는다. 보존 선언이 있으면 초기화를 멈추고 기준 문서부터 변경한다.

## 장애 확인

실제 대상 DB·명시한 URL 선택·PG* 우선순위·사전후 집계를 확인한다. 화면 오류만 보고 SQL 성공을 추측하지 않는다. 연결 오류 보고에는 유형·대상 구분·기대/실제 상태만 남기고 Secret·행 원문은 제외한다. 사용한 연결은 작업 종료 시 닫는다.

## 로컬 커뮤니티 백업·이관 작업

다음카페 백업·다음카페 마이그레이션·밴드 백업·밴드 마이그레이션은 독립적으로 실행·보고한다. 수집 범위·날짜별 증분은 [백업 운영 문서](community-backup.md), 분류·변환·공개 범위는 [이관 기준](../product/community-archive-migration-proposal.md)을 따른다. 백업 완료나 과거 테스트 결과를 실제 이관·삭제·원복의 실행 지시로 대신하지 않는다.

`local-backups/community/archive.sqlite3`는 로컬 백업·이관 작업 DB다. 앱의 개발·운영 PostgreSQL이나 별도 DB 복구용 dump가 아니다. 원문과 SQLite는 Git·Replit 전송에서 제외하며 디렉터리 0700·파일 0600으로 보존한다. 로컬 색인 갱신은 원본 복합 ID/해시로 upsert하고 기존 원문·변환 이력·적용 대응표를 자동 삭제하지 않는다.

홈페이지 이관에는 기존 게시판과 저장 계약을 사용한다. SQLite·원문 전체 대신 확정된 게시글·허용 첨부만 대상 환경에 반영하고, 대상 게시글 ID와 적용 해시를 로컬에 기록한다. 실제 적용 전후 건수·중복·본문/첨부 확인은 이 런북의 환경 선택과 변경 절차를 따른다. 운영 반영·배포는 별도 승인 범위다.

역사관 사진첩은 PostgreSQL 작업과 분리한다. 회원 전용 목록 JSON과 사진은 [자료 계약](../reference/heritage-content.md)에 따라 승인된 대상 환경의 비공개 Object Storage에 반영한다. development와 production 영역을 구분하고 운영 쓰기는 별도 승인 범위에서만 수행한다. 최종 사진의 해시·크기와 목록의 ID 참조를 확인한 뒤 목록을 마지막에 저장하며, 원본 백업·SQLite·인증정보는 전송하지 않는다. 원격 기존 목록이 있으면 대조 없이 덮어쓰지 않는다.

게시판 이관 글은 기존 nullable `author_id`를 비워 두고 확정된 카테고리·Tiptap JSONB를 사용한다. 이관 원문 URL과 로컬 SQLite 대응표로 중복을 대조하고, 허용 첨부 검증 후 트랜잭션으로 글을 반영한다. 새 연결에서 대상 행의 본문·첨부·건수를 대조한다.


## 게시글 작성자 이름 표시

`posts.author_name`은 계정 미연결 이관 글의 원작성자 이름을 저장하는 nullable TEXT다. 회원용 조회는 `author_id`가 있으면 연결된 `users.name`, 없으면 `author_name`, 둘 다 없으면 ‘작성자 정보 없음’으로 표시한다. 표시 이름은 권한 판정에 사용하지 않는다. 일반 작성·수정 API는 원작성자 이름 입력을 받지 않으며 기존 회원 연결·수정·삭제·관리자 가림 정책을 유지한다. 개발 DB에만 컬럼을 추가하고 기존 행·본문·회원 연결을 변환하지 않는다. 운영 DB 적용과 실제 카페 이관은 별도 실행 범위다.

개발 적용·새 연결 확인·catalog 근거는 [작성자 표시 실행 기록](../history/post-author-name-2026-11-14.md)을 따른다. 이 컬럼 추가를 실제 이관 데이터 입력이나 운영 적용 완료로 취급하지 않는다.


## 동문 원본 전환 설계

원본 A열의 UUID를 단일 기본키 `users.id`로 이관하며, 가입 후 카카오 프로필을 갱신한다. 홈페이지 탈퇴는 동문회 탈퇴로 처리하며, 단계별 비공개·파기 기준은 DB 변경안의 탈퇴 절차를 따른다. [DB 변경안](../product/pre-migration-database-design.md)에 따른 회원 UUID 기본키와 다섯 외래키 및 사전 등록을 개발·운영 DB에 적용했다. 가입·심사 상태는 기존 판정을 유지한다. 탈퇴원·회원 상태 전환은 [회원 상태와 변동 이력 전환](#회원-상태와-변동-이력-전환)을 따른다. 기존 Sheets/명부 복제본 설명은 전환 전 구현 상태다. 두 환경의 기본명부는 `users`이며 운영 적용 결과는 [전환 기록](../history/release-6.3.0-2026-11-21.md#운영-db-전환)에서 확인한다.

개발 전환 시 회원 키와 다섯 FK의 타입, 기존 세션·신청 및 종속 데이터 수를 확인한다. 원본 UUID를 넣은 사전 등록 행은 가입 전까지 이메일·카카오 연결이 없고 인증 상태는 false다. 명부 복제본을 사용하는 동안에는 기존 `matched_user_id`로 해당 행을 가리키고 실제 가입 여부는 `is_matched`로 구분한다.

전환 후 졸업 기수 일괄 등록과 개별 누락 등록은 [명부 등록 기준](../product/pre-migration-database-design.md#전환-후-명부-등록)을 따른다. 관리자는 AI와 함께 CLI에서 대상 DB와 기존 동문 행을 확인하고 등록·정정용 SQL을 준비한다. 같은 사람이 확인되면 기존 ID로 필요한 항목만 정정하며, 동명이인 등으로 식별이 불확실하면 등록을 보류한다. 처음 등록하는 사람만 새 UUID와 미가입 상태로 추가한다. 적용 전 추가·정정 건수를 확인하고 트랜잭션 완료 뒤 새 연결에서 결과를 대조한다.

가입 심사가 진행 중이면 명부 정정 후 기존 신청을 [서버의 가입 심사 절차](#승인-상태-변경의-데이터-경계)로 처리한다. 현재 관리자 화면이 사용하는 이 절차는 전환 후 CLI에서도 재사용한다. 명부 정정용 SQL의 범위는 동문 기본 정보까지다.


## 게시글 이관 출처 저장

개발 heliumdb에서 기존 posts 건수·컬럼·제약·인덱스를 먼저 확인하고 [추가 SQL](../../scripts/add-post-import-data.sql)을 트랜잭션으로 적용한다. 새 연결에서 JSONB·NULL 허용·CHECK·부분 UNIQUE·행 보존을 확인하고 metadata-only catalog를 갱신한다. 기존 행에 출처를 채우거나 본문을 변환하지 않는다. 별도 백업과 운영 적용은 포함하지 않는다. [실행 기록](../history/post-import-data-2026-11-14.md)에 결과를 남긴다.

다음카페 개발 데이터의 마지막 적용은 [2026-11-15 개발 이관 기록](../history/daum-development-import-2026-11-15.md)을 따른다. posts 전체 리셋 후 80건·댓글 0건이며 스키마 변경·별도 백업·운영 작업은 없었다.


### 개발 회원 기본키 전환과 명부 사전 등록

개발 DB의 기존 정수 기본키를 시트 A열 UUID로 바꾸고 명부 3,458행을 사전 등록한다. 개발 워크스페이스에서 `npx --no-install tsx scripts/convert-member-ids.ts`로 먼저 미리본다. `source`·`registry`·`matched`가 일치하고 기존 계정 전부가 한 사람에게만 연결되는지 확인한다. 이름이나 연락처 일부만 일치하는 계정은 연결하지 않는다.

같은 명령에 `--apply=<미리보기 지문>`을 붙이면 원본을 다시 대조한 뒤 개발 DB 트랜잭션 안에서 기본키와 다섯 외래키를 변환하고 미가입 동문을 사전 등록한다. 기존 계정·권한·콘텐츠는 보존하고 이전 회원 세션은 만료한다. 실행 후 새 연결에서 원본과 DB의 UUID 집합·명부 연결 수를 비교한다. 개발 앱은 UUID 버전과 함께 적용한다. 개발 전환 후 관리자 화면은 DB 등록 수를 조회하며 Sheet 재동기화를 차단한다. 운영 UUID 전환은 [별도 운영 절차](#운영-회원-uuid-전환)로 완료했다.

개발 적용 및 새 연결 검증 결과는 [회원 UUID 전환 기록](../history/member-uuid-2026-11-20.md)에 있다.

### 개발 기본명부 직접 반영

개발 워크스페이스에서 `node --import tsx scripts/import-user-roster.mjs`를 실행해 시트와 개발 `users`의 UUID 집합과 B~K열의 변경 예정·동일 건수를 확인한다. 이 작업은 시트만 정본으로 삼고 기존 명부 복제본은 조회하지 않는다. 빈 셀은 NULL, 날짜와 휴대전화는 표시 문자열로 보존한다.

미리보기와 대조 후 개발 DB에 `psql -X -v ON_ERROR_STOP=1 -f scripts/add-user-roster-development.sql`로 nullable TEXT 10개를 추가한다. 이어서 같은 CLI에 `--apply=<미리보기 지문>`을 전달한다. 쓰기는 기존 UUID가 일치하고 명부 값이 다른 행만 대상으로 한다. 오류는 트랜잭션을 취소하고 성공 시 새 연결에서 시트와 DB의 UUID·10개 값 및 나머지 회원 필드 보존을 대조한다. 적용 결과와 metadata-only catalog를 기록한다. 이 최초 시트 반영 CLI는 개발 전용이다. 운영은 검증한 개발 명부를 [운영 CLI](#운영-기본명부와-회비-구조-전환)로 전환했으며 앱에서 정기 동기화하지 않는다. [개발 적용 기록](../history/member-roster-fields-2026-11-21.md)

### 개발 회원 가입일

개발 워크스페이스에서 `psql -X -v ON_ERROR_STOP=1 -f scripts/add-member-joined-at-development.sql`을 실행한다. 대상은 UUID 기본키를 사용하는 `heliumdb`이고 DDL은 `users.joined_at TIMESTAMPTZ NULL` 한 컬럼만 추가한다. 기본값·기존 행 UPDATE·가입 상태 변경은 없다. 새 연결로 스키마 catalog를 확인하고, 앱의 검증은 정적 검사로 한정한다. [개발 적용 기록](../history/member-joined-at-2026-11-21.md)

### 운영 회원 UUID 전환

Replit 개발 워크스페이스에서 `node --import tsx scripts/convert-member-ids.ts --production`으로 미리 본다. 개발 명부에 연결된 UUID와 운영 명부를 대조하고 운영 계정이 한 명의 동문과 일치하는지 확인한다. 운영 계정의 카카오 연결과 권한은 운영 값으로 유지한다. 승인된 운영 전환은 같은 명령에 `--apply=<미리보기 지문>`을 더해 트랜잭션으로 실행한다. 회원 외래키 5개와 명부 연결을 전환하고 기존 회원 세션을 만료한다. 새 연결에서 ID 집합과 명부 연결을 재확인한다. 다음카페 콘텐츠 이전은 [별도 도구](community-migration.md)로 수행한다.
