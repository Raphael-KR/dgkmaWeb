# DB 스크립트 분류

현재 저장소의 SQL·변환 진입점을 목적과 실행 효과로 분류한다. 파일은 `scripts/`·`migrations/`의 기존 경로에 유지한다. 이 색인은 실행 순서나 일괄 재실행 지시가 아니다. 직접 DB 작업은 [DB 운영 런북](../runbooks/database-operations.md), 현행 구조는 [스키마 기준서](database-schema.md)를 따른다.

## 개발 회비수입원장

회비수입원장에는 [검산 CLI](../../scripts/reconcile-dues-ledger.mjs), [개발 스키마 SQL](../../scripts/add-dues-ledger-development.sql), [개발 이관 SQL](../../scripts/import-dues-ledger-development.sql)을 사용한다. CLI의 시트 검산, DB 읽기 대조, 검토 파일 생성과 실제 쓰기 SQL의 실행 조건은 [회비수입 이관 절차](../runbooks/database-operations.md#개발-회비수입원장-이관)에 구분한다. 개발 스키마 SQL은 [적용 완료](../history/dues-ledger-development-2026-11-21.md)했으며 재실행하지 않는다. 데이터 이관 SQL은 첫 이관 이후 새 입금을 증분 반영할 때 사용한다.

## 조회 도구

| 파일 | 대상·효과 | 사용 조건 |
|---|---|---|
| [database-schema-catalog.sql](../../scripts/database-schema-catalog.sql) | `expected_database`와 실제 DB 이름 확인; READ ONLY 트랜잭션으로 구조 metadata 조회 | 요청된 catalog 확인에서만 사용. 행 본문은 조회하지 않지만 실제 DB 연결이므로 정적 검사가 아님 |

## 명부 운영 CLI

[사망 처리 CLI](../../scripts/record-alumni-death.ts)는 개발 기본명부의 동문 한 명을 처리한다. 미리보기·적용과 사망일 보완은 [사무국 실행 절차](../runbooks/database-operations.md#동문-사망-처리)를 따른다.

## 완료된 Development 전환

[회원 상태·변동 이력 전환 SQL](../../scripts/member-status-development.sql)은 개발 DB에 적용했다. 사망 처리 CLI는 이 전환에서 설치한 트리거를 재사용한다. [개발 적용 기록](../history/member-status-candidate-2026-11-21.md)

2026-11-12 승인된 [add-comment-management.sql](../../scripts/add-comment-management.sql)은 `heliumdb`의 댓글 네 컬럼·두 CHECK를 추가했다. 개발 적용·백업·catalog 근거는 [개발 기록](../history/comments-drag-handle-2026-11-12.md)을 따른다. 운영에는 아래 별도 운영 SQL을 적용했으며 어느 스크립트도 반복 적용용이 아니다.

| 파일 | 대상·효과 | 재사용 경계 |
|---|---|---|
| [unify-posts.sql](../../scripts/unify-posts.sql) | `heliumdb` 확인; posts 경조사 컬럼·분류 추가, 구 테이블 제거 | 통합 당시 전환. 테이블 삭제 포함; 새 DB 기본 설치로 사용하지 않음 |
| [add-source-collection-rules.sql](../../scripts/add-source-collection-rules.sql) | `heliumdb` 확인; 수집 규칙 테이블 생성 | 현행 DB에 이미 존재. 재실행 전제가 아님 |
| [migrate-post-body.ts](../../scripts/migrate-post-body.ts) | 개발 PG*·실제 `heliumdb` 확인; TEXT 본문만 preview/apply | JSONB 전환이 끝난 현행 DB에는 적용 불가. 아래 변환 동작 참조 |
| [post-body-jsonb.sql](../../scripts/post-body-jsonb.sql) | `heliumdb` 확인; content JSONB 타입·CHECK 전환 | 위 변환기가 TEXT 안의 내용을 JSON 문서로 바꾼 뒤 같은 잠금·트랜잭션에서 읽는 SQL. 단독 실행 금지 |
| [add-post-visibility.sql](../../scripts/add-post-visibility.sql) | `heliumdb` 확인; is_hidden 컬럼 추가 | 완료된 additive 변경. 무조건 반복 가능한 스크립트가 아님 |

## 완료된 Production 전환과 준비 자료

운영 기본명부 전환에는 [운영 CLI](../../scripts/promote-membership-production.mjs)를 사용한다. 기본 명령은 읽기 전용 대조이며, 적용 범위와 검증 명령은 [운영 기본명부와 회비 구조 전환](../runbooks/database-operations.md#운영-기본명부와-회비-구조-전환)을 따른다. [회원 상태 SQL](../../scripts/lib/member-status-contract.sql)과 [회비 스키마 SQL](../../scripts/lib/dues-ledger-contract.sql)은 개발·운영 진입점이 대상 DB를 확인한 뒤 트랜잭션 안에서 사용하는 공통 정의다.

- [add-comment-management-production.sql](../../scripts/add-comment-management-production.sql): `3.0.0` 댓글 확장. `neondb`만 허용하며 네 컬럼·두 CHECK를 한 트랜잭션에 추가한다. 2026-11-12 03:47 KST 적용 완료. 반복 적용용이 아니며 당시 운영 승인·백업·preview·새 연결 확인 결과는 [릴리스 기록](../history/release-3.0.0-2026-11-12.md#운영-db-적용)에 남아 있다.

운영 전용 파일이 존재해도 실행 승인이 생기지 않는다. 승인된 운영 작업은 대상·preview·코드 호환·새 연결의 확인을 준비한다. 개발·운영 모두 [DB 복구·백업 기본 정책](../runbooks/database-operations.md#db-복구백업-기본-정책)에 따라 별도 백업을 기본으로 만들지 않는다. 위 완료 기록의 백업은 당시 실행 근거다.

| 파일 | 대상·효과 | 기록·재사용 경계 |
|---|---|---|
| [release-posts-additive.sql](../../scripts/release-posts-additive.sql) | `neondb` 확인; 통합 posts 컬럼·분류·수집 규칙 추가 | 통합 릴리스에서 완료. 현행 전체 스키마가 아님 |
| [release-posts-cleanup.sql](../../scripts/release-posts-cleanup.sql) | `neondb` 확인; 구 경조사·부고 테이블 삭제 | 준비 자료. 이 파일을 직접 실행한 기록이 아니라 Replit Publishing의 승인된 제거 SQL로 완료한 기록임 |
| [migrate-post-body-production.ts](../../scripts/migrate-post-body-production.ts) | 운영 Secret을 명시적으로 선택하고 `neondb` 확인; TEXT 본문 preview/apply | 운영 JSONB 전환 완료. 개발용 진입점과 혼용하지 않음 |
| [post-body-jsonb-production.sql](../../scripts/post-body-jsonb-production.sql) | `neondb` 확인; content JSONB 타입·CHECK 전환 | 운영 변환기가 본문을 먼저 변환한 뒤 읽는 SQL. 단독 실행 금지 |
| [add-post-visibility-production.sql](../../scripts/add-post-visibility-production.sql) | `neondb` 확인; is_hidden 컬럼 추가 | 운영 적용 완료. 재실행 지시가 아님 |

### 본문 변환기의 preview와 apply

두 진입점은 [공통 변환기](../../server/modules/content/post-body-migration.ts)를 사용한다. `--preview`도 실제 DB에서 게시글과 집계를 읽고 접근 제한된 Replit `.superpowers/` 경로에 metadata 결과를 쓴다. 정적 검사가 아니다. 운영 preview는 읽기 전용 URL을 우선하고 없으면 owner URL을 선택하되 READ ONLY 트랜잭션을 사용한다.

`--apply`는 TEXT 여부 확인·테이블 잠금, 원문 백업 생성, Markdown → Tiptap JSON 변환, SQL 타입 전환을 수행한다. 커밋 후 새 연결에서 본문·다른 컬럼·행 수·검색 표현·제약을 확인한다. 이 도구는 완료된 전환의 구현 기록이며 현행 JSONB DB에는 적용할 수 없다. 별도 원문 백업을 생성하는 현재 동작 때문에 재사용 시에는 백업에 대한 명시적 요청·승인이 필요하다. 일반 DB 작업의 기본 경로로 사용하거나 과거 명령을 그대로 복사하지 않는다.

## 과거 초기 자료

| 파일 | 역할·효과 | 한계 |
|---|---|---|
| [seed-categories.sql](../../scripts/seed-categories.sql) | all·notice·free·event·news 5개 항목을 upsert하고 표시 속성·활성 상태를 갱신 | DB 이름 guard 없음. 부고·경사를 포함하지 않는 과거 기본 분류 seed이며 현재 전체 분류의 설치 도구가 아님 |
| [0000_cheerful_nick_fury.sql](../../migrations/0000_cheerful_nick_fury.sql) 및 [meta](../../migrations/meta) | 초기 Drizzle 생성 SQL·snapshot·journal | 이후의 수동 SQL·본문 변환·runtime session DDL이 모두 순차 migration으로 들어 있지 않음. 현행 전체 DB 재현 경로로 사용하지 않음 |

실제 완료 시점과 적용 결과는 [수행·변경 이력](../history/README.md)을 따른다. 새 빈 DB를 재현하는 baseline·migration 체계는 아직 구현되지 않았다.

## 게시글 원작성자 이름

[add-post-author-name.sql](../../scripts/add-post-author-name.sql)은 개발 heliumdb만 허용하며 posts에 author_name TEXT NULL을 추가한다. 기존 행·본문을 변환하지 않는다. 2026-11-14 개발 적용 기록은 [작성자 표시](../history/post-author-name-2026-11-14.md)를 따른다. 운영 적용용이 아니며 반복 실행하지 않는다.

[add-post-import-data.sql](../../scripts/add-post-import-data.sql)은 개발 heliumdb에만 `posts.import_data` JSONB·형식 CHECK·원본 식별 부분 UNIQUE 인덱스를 추가한다. 기존 행 변환 없이 한 번만 적용한다. 일반 API는 이관 메타데이터를 입력받지 않는다.

[개발 회원 가입일 DDL](../../scripts/add-member-joined-at-development.sql)은 기존 데이터 소급 없이 한 컬럼을 추가한다. [실행 절차](../runbooks/database-operations.md#개발-회원-가입일)

[개발 기본명부 DDL](../../scripts/add-user-roster-development.sql)과 [시트 직접 반영 CLI](../../scripts/import-user-roster.mjs)는 스키마 추가와 기존 회원 행 업데이트를 구분한다. [개발 기본명부 직접 반영 절차](../runbooks/database-operations.md#개발-기본명부-직접-반영)

[회원 UUID 전환 CLI](../../scripts/convert-member-ids.ts)는 [기본키·외래키 DDL](../../scripts/convert-member-ids.sql)을 명부 대조와 같은 트랜잭션에서 실행한다. [실행 절차](../runbooks/database-operations.md#개발-회원-기본키-전환과-명부-사전-등록)

- [개발 별칭 FK 전환](../../scripts/link-roster-aliases-development.sql)은 기존 별칭의 소유자를 동문 UUID로 연결한다.

[신규 기수 등록 SQL](../../scripts/add-roster-cohort-development.sql)은 개발에서 신규 UUID만 등록한다. 입력 형식과 정정 SQL은 [동문 기본명부 관리](../runbooks/database-operations.md#동문-기본명부-관리)를 따른다.
