# 데이터베이스 운영 런북

이 문서는 승인된 DB 작업의 환경 선택·변경·보존·결과 확인 절차다. 구조는 [스키마 기준서](../reference/database-schema.md), 제품 정책은 [계획서](../product/planning-proposal.md)를 따른다. 승인·실행·백업·catalog 결과는 [수행·변경 이력](../history/README.md)에서 확인한다.

## 승인 상태 변경의 데이터 경계

승인 취소·거부 보존·재심사는 `users.is_verified`·`pending_registrations.status`와 세션·OAuth 종료 marker를 사용하는 앱의 관리자 심사 트랜잭션으로 처리한다. DDL·backfill·DB 초기화는 필요하지 않다. 거부 자체는 탈퇴·카카오 unlink·레코드 삭제로 처리하지 않는다. 명시적 거부 신청 삭제는 unlink 성공 뒤 신청만 삭제하며 기존 회원·콘텐츠·회비·명부 연결을 유지한다. 실제 탈퇴는 별도의 삭제·보존 절차를 따르고, 과거 삭제된 신청을 추정해 재생성하지 않는다.

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

실행할 때 실제 DB 이름을 확인한다. 구조와 마지막 catalog 근거는 [스키마 기준서](../reference/database-schema.md#기준-소스와-마지막-db-관찰)를 참조한다. Google Sheets가 명부 관리 원본이고 PostgreSQL `alumni_database`는 로그인·가입 심사용 런타임 복제본이다. 로그인 요청은 Sheets를 직접 조회하지 않는다.

## SSH 접속

로컬 Mac에서 다음 SSH 명령으로 Replit 개발 워크스페이스에 접속한다.

```bash
ssh -i ~/.ssh/replit -p 22 dc5e5541-525b-4ad6-b914-2d2db70cb4a9@dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev
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

### 스키마 카탈로그 재검증

직접 DB 관찰이며 정적 검사가 아니다. 요청된 스키마 변경 또는 catalog 확인 범위에서만 다음 읽기 전용 스크립트를 사용한다.

```bash
psql -X --csv -v ON_ERROR_STOP=1 -v expected_database=heliumdb \
  -f scripts/database-schema-catalog.sql
```

대상 이름·READ ONLY·ROLLBACK·`__CATALOG_INSPECTION_COMPLETE__`를 확인한다. 이름·타입·기본값·제약·인덱스·시퀀스·뷰·트리거·RLS·정책·루틴·enum·domain과 코드의 차이를 기록한다. 과거 객체 수를 고정 통과 조건으로 쓰지 않는다. 스키마·runtime DDL·migration 변경 시 같은 변경에서 [스키마 기준서](../reference/database-schema.md)를 갱신한다. 행 원문은 catalog 대상이 아니다.

### 별도로 요청된 격리 개발 DB 검사

`npm run test:development-db`는 DB 쓰기와 fixture 생성·정리를 포함하므로 정적 검사에 포함하지 않는다. 승인된 경우에만 현재 스키마가 준비된 격리 Development DB에서 실행한다. 사용자 지침의 합성 자료·새 DB 생성 허가 기준도 적용한다.

`server/tests/development-db-target.ts`의 opt-in·환경·허용 PG host·DB 이름 검증을 모든 실제 DB 검사에서 공통으로 사용한다. 일반 `npm test`는 PG*나 DATABASE_URL의 존재만으로 DB 검사를 실행하지 않는다. 전용 명령은 명부 동기화·가입/승인/거절 경쟁·탈퇴·OAuth state·경조사 quota의 기존 DB 사례를 선택한다. 정확한 파일 목록은 [package.json](../../package.json)을 따른다.

명부 동기화 검사는 실제 Sheets 대신 기존 fixture를 사용하며 임시 trigger/function을 만들고 정리한다. 다른 DB 검사도 임시 회원·신청·세션 등을 쓰므로 같은 승인 경계를 적용한다. 실행 전 환경 선택과 실제 `current_database()=heliumdb`를 확인하고 기존 정리·잔여 확인을 유지한다.

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

### Secret 수명과 명시적 연결

정식 오픈 전 반복 운영 작업이 끝날 때까지 owner `PROD_DATABASE_URL`은 Replit Secrets에 유지한다. 반복 조회용 `PROD_DATABASE_READONLY_URL`을 우선한다. URL의 존재는 접근·변경 승인이 아니며 Mac `.env`, 저장소, 문서 또는 채팅에 복제하지 않는다. 설정 확인은 값 없이 존재 여부만 출력한다.

앱의 `server/db.ts`를 사용하는 명시적 운영 스크립트는 PG* 우선순위의 영향을 받는다. 필요한 승인 작업에서만 해당 자식 프로세스의 PG*를 제거하고 운영 URL을 전달한다. 일반 앱 실행·개발·시험에서는 PG*를 해제하지 않는다. `pg.Client/Pool`에 URL을 직접 넘기는 운영 전용 도구는 그 연결을 명시적으로 검사한다. 셸 전체의 환경변수를 운영용으로 바꾸지 않는다.

사용자가 반복 운영 작업 종료 또는 launch hardening을 명시하면 이 수명 기준을 먼저 갱신하고 owner Secret을 제거한다. 명령 종료 때 Secret을 자동 삭제하지 않는다.

## Google Sheets 명부 동기화

관리자 명부 동기화는 즉시 쓰기를 실행하지 않는다. 관리자 화면에서 다음 순서를 지킨다.

1. Google Sheets 연결 상태를 확인한다. 연결 또는 원본 검증 오류가 표시돼도 `변경 미리보기`는 실행할 수 있다.
2. `변경 미리보기`로 원본·DB·추가·수정·동일·충돌·오류·원본만·DB만 건수를 확인한다.
3. 차단 오류가 있으면 원본을 수정하고 미리보기를 다시 실행한다. 빈 원본, `'통합주소록'!A:J`의 10개 관리 컬럼 헤더 또는 필수값 누락, 잘못된 휴대전화 형식, 원본 또는 DB의 정규화 전화번호 중복은 적용할 수 없다. 관리 대상 헤더 누락을 빈 값으로 해석해 기존 DB 필드를 덮어쓰지 않는다. 주소·전화번호는 비관리 항목이므로 필수 헤더에 포함하지 않는다.
4. 실제 적용 전 대상 DB의 `current_database()`, `alumni_database` 총 건수, 필수값 누락과 정규화 전화번호 중복 건수를 별도 집계로 기록한다.
5. 미리보기의 변경 범위가 예상과 일치할 때만 `변경 적용`을 실행한다. 미리보기 뒤 원본이 바뀌었거나 다른 적용이 진행 중이면 서버가 `409`로 거부하므로 새 미리보기부터 다시 시작한다.
6. 적용 후 새 연결에서 총 건수, 필수값, 중복, `matched_user_id` 연결 건수와 예상 insert/update를 대조한다.

서버는 source 재조회부터 commit까지 PostgreSQL advisory lock으로 직렬화하고 하나의 transaction에서 insert/update한다. 기존 `is_matched`, `matched_user_id`와 DB에만 존재하는 행은 보존하며 자동 삭제하지 않는다. 응답과 브라우저에는 집계와 source fingerprint만 전달하고 명부 원문은 포함하지 않는다.

주소·전화번호는 Sheets 파싱·변경 비교·source fingerprint·쓰기 payload에서 제외한다. DB의 `address`·`phone` 컬럼은 그대로 두고, 기존 행 업데이트에는 두 필드를 넣지 않아 값을 보존한다. 새 행은 두 값을 보내지 않으므로 기존 nullable 정의에 따라 NULL로 남는다. 두 항목의 입력 원천·수정 절차를 별도로 정하기 전에는 시트에 같은 이름의 열이 생겨도 자동으로 쓰기 대상을 확대하지 않는다.

Production Database에서 동기화할 때는 사용자에게 실행 범위와 미리보기 집계를 확인받는다. 별도 백업은 [기본 정책](#db-복구백업-기본-정책)에 따라 명시적으로 요청·승인된 경우에만 만든다. 개발·회귀 테스트에서는 실제 Google Sheets apply를 실행하지 않고 fixture snapshot만 사용한다.

## 동문 공식 이름·별칭 운영

`alumni_database.name`은 Sheets 복제 원본으로 유지한다. 공식 이름·개명 전 이름은 `alumni_name_aliases`에서 관리하며, 대리 등록의 이름/별칭과 학번 단일 일치에 사용한다. 동문 자녀 확인은 이름/별칭과 학번 또는 졸업기수 및 서버 회원 상태를 사용한다. 로그인 명부 매칭의 이름+전화번호 계약을 별칭으로 대체하지 않는다.

별칭 쓰기가 승인된 경우 대상 DB·동문 한 명을 확인하고 한 트랜잭션에서 해당 alumni 행을 잠근다. 현재 이름은 `current_name`·preferred, 개명 전 이름은 `former_name`으로 처리한다. 새 연결에서 대상의 preferred 1건·정규화 이름 중복 없음·Sheets 원본 이름과 다른 행 보존을 확인한다.

## DB 스크립트 선택

[DB 스크립트 분류](../reference/database-scripts.md)에서 파일별 대상·읽기/쓰기 효과·재사용 조건을 확인한다. 완료된 전환 스크립트를 일괄 재실행하거나 신규 설치 순서로 사용하지 않는다. 초기 checked-in migration만으로 현행 전체 구조가 재현된다고 가정하지 않으며, 새 DB 준비는 별도 요청 범위에서 설계한다.

## 정식 오픈 전 초기화

사용자가 데이터 보존을 선언하기 전의 사전 허용 범위는 [Replit 데이터 정책](../../replit.md#정식-오픈-전-데이터-정책)을 따른다. 아래는 실제 남아 있는 테이블의 분류이며 그대로 전체 삭제할 목록이나 실행 순서가 아니다. 대상·FK 의존 관계·유지할 데이터를 먼저 정하고 가능한 트랜잭션과 새 연결의 건수 확인을 사용한다.

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
