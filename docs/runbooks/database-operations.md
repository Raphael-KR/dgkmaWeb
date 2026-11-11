# 데이터베이스 운영 런북

이 문서는 승인된 DB 작업의 환경 선택·변경·보존·결과 확인 절차다. 구조는 [스키마 기준서](../reference/database-schema.md), 제품 결정은 [계획서](../product/planning-proposal.md)를 따른다. 과거 승인·실행·백업·catalog 결과와 당시 SQL은 [DB 작업 이력](../history/database-operations-2026-11-09.md)에 보존한다.

## 승인 상태 변경의 데이터 경계

2026-11-12 승인 취소·거부 보존·재심사 변경은 기존 `users.is_verified`·`pending_registrations.status`와 세션·OAuth 종료 marker를 사용한다. DDL·backfill·DB 초기화 없이 앱의 관리자 심사 트랜잭션으로 처리한다. 신규 개발 코드를 반영하거나 정적 검사하는 것만으로 실제 회원의 상태를 바꾸지 않는다. 거부 자체를 탈퇴·카카오 unlink·레코드 삭제로 처리하던 과거 절차는 재사용하지 않는다. 거부 후 명시적 신청 삭제는 unlink 성공 뒤 신청만 삭제하며 기존 회원·콘텐츠·회비·명부 연결을 유지한다. 실제 탈퇴의 삭제·보존 절차는 유지한다. 과거 삭제된 신청을 가정해 재생성하지 않는다. 이번 작업에서는 개발·운영 DB를 조회하거나 변경하지 않으며 마지막 catalog 관찰 시각도 갱신하지 않는다.

## 실행 범위

역사관 공개 콘텐츠 구현은 [정적 자료 계약](../reference/heritage-content.md)을 사용한다. DB 조회·DDL·seed·`db:push`는 필요하지 않다. 향후 DB 저장이 필요하면 현재 정적 자료와 제안 테이블·관계·접근 범위·이관 대상을 설명하고 사용자 승인 후 개발 DB에만 적용한다.

코드·문서 정리의 수행 결과는 [개발 작업 이력](../history/README.md)에 둔다. 기존 게시글의 값 보존과 권리회원 목표 정책·현행 계산의 차이는 [제품 정책](../product/planning-proposal.md)을 따른다. 목표 정책 결정만으로 등급 재계산·직책 이관·DB 변경을 실행하지 않는다.

- 개발 DB가 기본이다. 개발 작업을 완료했다고 운영 DB 변경·배포까지 이어서 수행하지 않는다. 운영 대상·행위는 사용자가 승인한 범위에서만 선택한다.
- 코드·문서의 정적 검사와 직접 DB 작업을 구분한다. 문서 정리만 하는 작업에서는 DB에 연결하지 않는다. 전체 테스트·빌드·서버 재시작·실계정 QA는 DB 변경의 공통 선행 조건이 아니다.
- 개별 작업의 데이터 보존 요청을 우선한다. 스키마 변경과 데이터 변환을 구분하고, 운영 변경 전에는 복구 가능한 백업/snapshot·preview·적용 순서·새 연결의 사후 확인을 준비한다.
- 성공한 변경의 자동 원복은 하지 않는다. rollback용 원본 보존과 실제 복원 승인은 별개다. 실패한 미커밋 트랜잭션 종료는 성공한 변경의 원복과 구분한다.
- URL·비밀번호·토큰·행 원문을 문서·Git·셸 기록·채팅에 남기지 않는다. 필요한 원본 백업은 승인된 Replit 비공개 경로에 권한을 제한해 보존한다.

## 환경과 마지막 관찰

| 구분 | Development | Production |
|---|---|---|
| 역할 | 구현과 승인된 개발 DB 작업 | Republish된 서비스의 DB |
| 확인된 DB 이름 | `heliumdb` | `neondb` |
| 기본 연결 | Replit PG* | 명시적으로 선택한 Replit Secret URL |
| 마지막 전체 catalog | 2026-11-12 03:14 KST | 2026-11-12 03:47 KST |
| 관찰 구조 | 공통 posts JSONB·수집 규칙 + 댓글 가림·수정·revision·첨부 | 개발과 같은 댓글 확장 적용 |

위 시각은 마지막 DB 작업의 관찰 이력이다. 문서 수정일과 구분한다. Google Sheets가 명부 관리 원본이고 PostgreSQL `alumni_database`는 로그인·가입 심사용 런타임 복제본이다. 로그인 요청은 Sheets를 직접 조회하지 않는다.

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

2026-11-12 댓글 확장 최초 승인은 `comments.is_hidden`, `edited_at`, `revision`, `attachment`와 두 CHECK를 개발 DB에 추가하는 범위였다. 기존 댓글의 ID·본문·작성자·작성 시각을 보존하며 데이터 변환·초기화는 하지 않았다. 대상 확인 → schema-only 및 comments 데이터 비공개 백업 → 컬럼/의존 객체·SQL preview → 트랜잭션 적용 → 새 연결의 행 보존·기본값·제약 확인 → metadata-only catalog 순으로 진행했다. [전환 SQL](../../scripts/add-comment-management.sql)은 `heliumdb`만 허용하며 재실행용이 아니다. 개발 DB 적용과 새 연결·catalog 확인을 03:14 KST에 마쳤고 기존 댓글은 0건이었다. 결과와 비공개 백업 위치는 [개발 기록](../history/comments-drag-handle-2026-11-12.md)에 남긴다. 이후 별도 승인된 운영 전환은 아래 운영 절과 [3.0.0 릴리스 기록](../history/release-3.0.0-2026-11-12.md#운영-db-적용)을 따른다. Drag Handle 자체는 DB 변경이 없다.

2026-11-12 Placeholder·체크리스트·CharacterCount·YouTube 추가는 기존 JSONB의 앱 스키마 확장이다. 체크리스트 상태·영상 주소는 표준 Tiptap 노드 속성에 저장하며 DB DDL·기존 행 변환·catalog 재조회·`db:push`를 실행하지 않는다. 실제 개발 적용·검사 범위는 [추가 확장 기록](../history/editor-extensions-2026-11-12.md)을 따른다.

2026-11-12 일반 파일 8종은 기존 `posts.content` JSONB의 표준 링크 문단과 App Storage를 사용한다. DDL·데이터 변환·catalog 재조회·`db:push`는 수행하지 않는다. 기존 이미지·본문·객체는 보존하며 적용 상태는 [일반 파일 개발 기록](../history/general-files-2026-11-12.md)에 기록한다.

후속 일반 파일 10MB·5개 제한도 업로드/게시글 입력 검증의 변경이다. DB 작업과 기존 객체 삭제는 필요하지 않으며 한도를 넘는 기존 글은 해당 첨부 유지·감소를 허용한다.

2026-11-12 TableKit 추가도 기존 `posts.content` JSONB의 앱 계약 확장이다. 표를 위한 컬럼·CHECK 변경·기존 행 변환·catalog 재조회·`db:push`는 수행하지 않는다. 공식 스키마의 저장/복원과 미확인 실행 범위는 [TableKit 개발 기록](../history/table-kit-2026-11-12.md)에 남긴다.

본문 이미지의 2026-11-11 확장은 `posts.content` JSONB 안의 공식 image 노드와 참조 읽기 계약만 변경한다. DB DDL·데이터 변환·catalog 재조회는 필요하지 않다. 기존 본문과 `image_urls` 첨부는 보존하며 이번 작업에서 `db:push`나 마이그레이션을 실행하지 않는다. 적용·정적 검사 상태는 [개발 기록](../history/inline-images-2026-11-11.md)을 따른다.

1. 요청된 대상·변경과 보존 범위를 정하고 Replit 개발 checkout·실제 연결 DB를 확인한다.
2. 스키마 작업이면 schema-only snapshot·metadata-only catalog와 의존 객체를, 데이터 작업이면 필요한 백업·변경 전 집계를 준비한다. 원문이 필요하면 Replit의 접근 제한 경로에만 보존한다.
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

명부 동기화 검사는 실제 Sheets 대신 기존 fixture를 사용하며 임시 trigger/function을 만들고 정리한다. 다른 DB 검사도 임시 회원·신청·세션 등을 쓰므로 같은 승인 경계를 적용한다. 실행 전 환경 선택과 실제 `current_database()=heliumdb`를 확인하고 기존 정리·잔여 확인을 유지한다. 이 문서 수정은 DB 검사 실행이나 fixture 생성 승인이 아니다.

## 운영 변경

운영 DB 변경이 승인된 작업에만 아래 절차를 사용한다. 새 운영 변경이 없는 문서·개발 작업은 이 절로 넘어오지 않는다.

2026-11-12 사용자가 `3.0.0`의 [add-comment-management-production.sql](../../scripts/add-comment-management-production.sql) 전환을 승인했다. `neondb`의 comments에 개발과 같은 네 컬럼·두 CHECK만 추가하며 기존 다섯 컬럼·행·시퀀스를 보존한다. 준비한 읽기 전용 preview·비공개 백업과 실행 직전 구조·값을 대조한 뒤 트랜잭션으로 적용한다. 새 연결에서 보존과 구조를 확인한 후 기존 릴리스 승인에 따라 배포한다. 승인·실행·새 연결 검증은 [릴리스 기록](../history/release-3.0.0-2026-11-12.md)에 남긴다.

후속 사용자 결정으로 이번 릴리스의 기존 `posts`·종속 `comments` 데이터는 보존 필수가 아니며 필요하면 초기화할 수 있다. 현재 additive SQL은 초기화를 요구하지 않아 그대로 적용한다. 이 허용을 다른 테이블·스키마·Object Storage 파일 삭제로 확대하지 않는다. 실제 초기화 여부와 전후 건수는 수행 기록에서 구분한다.

03:47 KST 운영 전환과 새 읽기 전용 연결·catalog 확인을 완료했다. 댓글 1건·기존 값·시퀀스는 유지됐으며 초기화는 하지 않았다. 전체 catalog의 변경 범위와 SHA-256은 [스키마 기준](../reference/database-schema.md#기준-소스와-마지막-db-관찰), 백업과 실행 근거는 [운영 적용 기록](../history/release-3.0.0-2026-11-12.md#운영-db-적용)을 따른다.

1. 승인 대상과 적용할 후보 SQL/변환 코드를 확정한다. Replit Secrets의 운영 URL을 해당 프로세스에만 전달한다. 개발 PG* 기본값이나 Secret 자체를 변경하지 않는다.
2. 사전 읽기는 `PROD_DATABASE_READONLY_URL`을 우선하고, 없으면 owner URL을 `BEGIN READ ONLY` 트랜잭션으로 제한한다. `current_database()=neondb`, 실제 구조·변경 전 건수·의존 관계를 확인한다.
3. schema snapshot·catalog·필요한 원본 백업과 preview를 준비한다. 기존 데이터의 보존 기준과 변경·제거 객체를 명시한다. 원문 파일은 Replit 안에서 디렉터리 0700·파일 0600으로 보관하며 Mac·Git으로 복제하지 않는다.
4. 코드를 함께 배포해야 하면 후보 Git 통합과 빌드가 준비됐는지 확인한다. 호환되는 additive 변경은 새 코드보다 먼저 적용할 수 있다. TEXT→JSONB처럼 비호환 변경은 잠금·변환·새 코드 전환 순서와 간격을 별도로 정한다. 과거 실행 순서를 모든 릴리스에 일반화하지 않는다.
5. 실행 직전 대상과 preview 기준의 변화 여부를 재확인하고 가능한 한 트랜잭션으로 승인 범위만 적용한다. 이미 같은 구조이면 중복 적용하지 않는다. Replit이 웹 스키마 검토를 요구하면 승인된 SQL을 검토하며 우회하지 않는다.
6. 새 READ ONLY 연결에서 실제 구조·변환 결과·본문 외 값·전체 보존 건수를 대조한다. metadata-only catalog와 적용 이력을 기록한다.
7. 배포도 승인된 작업일 때만 [Replit 배포 절차](../../replit.md#배포)로 진행한다. 운영 HTTP smoke와 실제 회원 QA를 구분하며 실계정 QA는 계속 보류한다.
8. 연결을 닫고 적용/미적용·오류·남은 조치를 보고한다. 배포 실패나 불일치가 있으면 상태를 보존해 보고하며 별도 승인 없이 원복하지 않는다.

### Secret 수명과 명시적 연결

정식 오픈 전 반복 운영 작업이 끝날 때까지 owner `PROD_DATABASE_URL`은 Replit Secrets에 유지한다. 반복 조회용 `PROD_DATABASE_READONLY_URL`을 우선한다. URL의 존재는 접근·변경 승인이 아니며 Mac `.env`, 저장소, 문서 또는 채팅에 복제하지 않는다. 설정 확인은 값 없이 존재 여부만 출력한다.

앱의 `server/db.ts`를 사용하는 명시적 운영 스크립트는 PG* 우선순위의 영향을 받는다. 필요한 승인 작업에서만 해당 자식 프로세스의 PG*를 제거하고 운영 URL을 전달한다. 일반 앱 실행·개발·시험에서는 PG*를 해제하지 않는다. `pg.Client/Pool`에 URL을 직접 넘기는 운영 전용 도구는 그 연결을 명시적으로 검사한다. 셸 전체의 환경변수를 운영용으로 바꾸지 않는다.

사용자가 반복 운영 작업 종료 또는 launch hardening을 명시하면 이 수명 기준을 먼저 갱신하고 owner Secret을 제거한다. 명령 종료 때 Secret을 자동 삭제하지 않는다.

## Google Sheets 명부 동기화

관리자 명부 동기화는 즉시 쓰기를 실행하지 않는다. 관리자 화면에서 다음 순서를 지킨다.

1. Google Sheets 연결 상태를 확인한다. 연결 또는 원본 검증 오류가 표시돼도 `변경 미리보기`는 실행할 수 있다.
2. `변경 미리보기`로 원본·DB·추가·수정·동일·충돌·오류·원본만·DB만 건수를 확인한다.
3. 차단 오류가 있으면 원본을 수정하고 미리보기를 다시 실행한다. 빈 원본, `A:L`의 12개 관리 컬럼 헤더 또는 필수값 누락, 잘못된 휴대전화 형식, 원본 또는 DB의 정규화 전화번호 중복은 적용할 수 없다. 헤더 누락을 빈 값으로 해석해 기존 DB 필드를 덮어쓰지 않는다.
4. 실제 적용 전 대상 DB의 `current_database()`, `alumni_database` 총 건수, 필수값 누락과 정규화 전화번호 중복 건수를 별도 집계로 기록한다.
5. 미리보기의 변경 범위가 예상과 일치할 때만 `변경 적용`을 실행한다. 미리보기 뒤 원본이 바뀌었거나 다른 적용이 진행 중이면 서버가 `409`로 거부하므로 새 미리보기부터 다시 시작한다.
6. 적용 후 새 연결에서 총 건수, 필수값, 중복, `matched_user_id` 연결 건수와 예상 insert/update를 대조한다.

서버는 source 재조회부터 commit까지 PostgreSQL advisory lock으로 직렬화하고 하나의 transaction에서 insert/update한다. 기존 `is_matched`, `matched_user_id`와 DB에만 존재하는 행은 보존하며 자동 삭제하지 않는다. 응답과 브라우저에는 집계와 source fingerprint만 전달하고 명부 원문은 포함하지 않는다.

Production Database에서 최종 동기화할 때는 위 절차 외에 사전 백업 또는 복구 가능한 snapshot을 준비하고 사용자에게 실행 범위와 미리보기 집계를 확인받는다. 개발·회귀 테스트에서는 실제 Google Sheets apply를 실행하지 않고 fixture snapshot만 사용한다.

## 동문 공식 이름·별칭 운영

`alumni_database.name`은 Sheets 복제 원본으로 유지한다. 공식 이름·개명 전 이름은 `alumni_name_aliases`에서 관리하며, 대리 등록의 이름/별칭과 학번 단일 일치에 사용한다. 동문 자녀 확인은 이름/별칭과 학번 또는 졸업기수 및 서버 회원 상태를 사용한다. 로그인 명부 매칭의 이름+전화번호 계약을 별칭으로 대체하지 않는다.

별칭 쓰기가 승인된 경우 대상 DB·동문 한 명을 확인하고 한 트랜잭션에서 해당 alumni 행을 잠근다. 현재 이름은 `current_name`·preferred, 개명 전 이름은 `former_name`으로 처리한다. 새 연결에서 대상의 preferred 1건·정규화 이름 중복 없음·Sheets 원본 이름과 다른 행 보존을 확인한다. 테이블 생성 SQL과 2026-08 적용 기록은 [이력](../history/database-operations-2026-11-09.md#동문-공식-이름개명-전-별칭-스키마)이며 현재 양쪽 DB에 테이블이 존재한다.

## 완료된 전환과 재실행 경계

다음은 완료된 작업을 찾는 색인이다. 신규 설치의 전체 migration 순서나 재실행 지시가 아니다. 파일별 대상·읽기/쓰기·완료/준비 상태·재사용 조건은 [DB 스크립트 분류](../reference/database-scripts.md)를 따른다.

| 전환 | 실행 도구·당시 절차 | 완료 기록 |
|---|---|---|
| posts 통합·구 테이블 제거 | 개발 `scripts/unify-posts.sql`; 운영 `scripts/release-posts-additive.sql` 후 Publishing의 승인된 제거 SQL | [개발](../history/database-operations-2026-11-09.md#개발-db-전환-결과), [운영](../history/database-operations-2026-11-09.md#운영-전환-완료-결과) |
| 수집 규칙 | 개발 `scripts/add-source-collection-rules.sql`; 운영은 위 additive에 포함 | [수집](../history/database-operations-2026-11-09.md#공개-링크-수집-규칙-개발-적용-2026-11-09) |
| 본문 JSONB | `scripts/migrate-post-body.ts`, `scripts/migrate-post-body-production.ts`의 preview/apply와 환경별 SQL | [개발](../history/database-operations-2026-11-09.md#본문-jsonb-개발-적용-기록), [운영](../history/database-operations-2026-11-09.md#본문-운영-전환-결과) |
| 가림 상태 | `scripts/add-post-visibility.sql`, `scripts/add-post-visibility-production.sql` | [개발](../history/database-operations-2026-11-09.md#게시글-가리기-개발-적용-결과), [운영](../history/database-operations-2026-11-09.md#게시글-가리기-운영-적용-결과) |
| OAuth 종료 경쟁·파싱 제한·별칭 | 당시 additive SQL | [DB 운영 이력](../history/database-operations-2026-11-09.md) |

`release-posts-cleanup.sql`은 준비만 했고 운영에서는 Replit이 승인된 두 구 테이블을 제거했다. `migrate-obituaries-to-community-events.sql`은 제거된 옛 경로이며 사용하지 않는다. 초기 checked-in migration만으로 현행 전체 구조가 재현된다고 가정하지 않는다. 현재 구조가 아닌 새 DB 준비는 별도 요청 범위에서 설계한다.

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
