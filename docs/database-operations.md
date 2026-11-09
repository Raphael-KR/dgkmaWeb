# 데이터베이스 운영 런북

이 문서는 dgkmaWeb의 Development Database와 Production Database를 SSH에서 구분하여 조회·변경·검증하는 기준 절차다. 실제 접속 문자열, 비밀번호, 토큰은 이 문서나 Git에 기록하지 않는다.

## 최신 변경 릴리스 준비 (2026-11-09)

- 사용자 승인: 후보 `5b19e86`의 push·PR 생성·main 병합과 운영 DB 전환을 명시 승인했다. 이 전환은 아래 추가 구조 SQL과 빈 `community_events`·`obituaries` 삭제 SQL을 포함한다. 일반 게시글·회원·명부는 보존하고 명부 재동기화·실계정 QA·자동 원복은 포함하지 않는다.
- 12:35 KST 릴리스 요청에 필요한 운영 사전 확인을 `PROD_DATABASE_URL`로 명시 선택해 `BEGIN READ ONLY`에서 수행했다. 읽기 전용 URL은 없었으며 `current_database()=neondb`, `transaction_read_only=on`을 확인했다. 행 원문과 Secret은 조회·출력하지 않았다.
- 12:35 KST 적용 전 운영은 구 테이블 2개가 포함된 14-table 구조였다. `community_events`·`obituaries`는 각각 0건이고 incoming FK는 없었다. posts는 기존 9개 컬럼이며 통합 컬럼과 `source_collection_rules`는 없었다. 일반 posts/comments도 0건이었다. 나머지 기존 테이블은 보존 대상으로 기록했다. 실제 적용 후 상태는 아래 결과를 따른다.
- 후보 SQL은 추가 구조 `scripts/release-posts-additive.sql`과 배포 후 제거 `scripts/release-posts-cleanup.sql`로 나눈다. 두 파일은 Production `neondb`만 허용하며 앱 시작·빌드에서 실행하지 않는다. 개발용 두 SQL의 대상 제한은 변경하지 않는다.
- 적용 전 schema-only snapshot과 테이블별 건수·의존 관계를 기록한다. 명시 승인 후 첫 SQL의 posts 컬럼·제약·인덱스, 수집 규칙 테이블, 부고·경사 카테고리를 한 트랜잭션으로 적용한다. 새 연결 확인 후 Republish한다. 구 앱이 제공되는 동안에는 구 테이블을 유지한다.
- 수동 절차는 새 배포의 비로그인 HTTP 확인 후, 별도 삭제 승인이 포함된 경우에만 둘째 SQL로 구 테이블 2개를 제거한다. 재확인 시 행이 늘었거나 참조 관계가 달라졌으면 삭제하지 않고 실제 차이를 보고한다. 수동 SQL의 `CASCADE`·일반 posts/comments·명부 삭제는 하지 않는다. 이번 Replit 웹 게시가 요구한 두 빈 테이블 삭제는 아래의 한정된 플랫폼 절차를 따른다.
- 단계별 새 연결의 구조·건수 및 canonical metadata-only catalog로 결과를 기록한다. 원본 보존은 원복 허가가 아니며 성공한 변경을 자동 되돌리지 않는다. 증거는 Replit `.superpowers/release-20261109/`에 둔다. 현재 추가 구조·구 테이블 제거·Republish를 완료했고 실계정 QA는 계속 보류한다.
- 12:43 KST `production-before-schema.sql` 19,953 bytes를 Replit 내 비공개 작업 경로에 보존했다. SHA-256은 `f37b6e986f11887258e149f2b9a432b7625bd63a69a946a66aa94abc3181efc2`다. 구 테이블은 0건이므로 행 원문을 백업하지 않았다. 전체 metadata-only catalog도 READ ONLY gate·ROLLBACK·완료 marker로 종료했고 [구조 기록](./database-schema.md#운영-릴리스-구조-2026-11-09)에 반영했다.

### 운영 추가 구조 적용 결과

- 2026-11-09 12:56 KST, main `f54177bfe877e40354f961045b65e3f238abed1f`의 `scripts/release-posts-additive.sql`을 Production `neondb`에 적용했다. SQL SHA-256은 `926479c120d01b0e5e9d47230fb1b779baecd5625841dbfdc530ff7eacd17afa`다. Replit Secret을 해당 psql 프로세스에만 명시 전달했으며 개발 PG 기본값과 Secrets는 변경하지 않았다.
- 직전 대상·테이블별 건수·의존 관계를 다시 확인하고 `production-before-additive-schema.sql`을 보존했다. snapshot SHA-256은 `546e83bcf40a7e74d0fa4337ec4ca02f8a520976e4549851ee5c6baa1071555b`다. psql은 한 트랜잭션의 COMMIT과 exit 0으로 종료했다.
- 새 연결에서 posts 컬럼 4개·CHECK 2개·partial UNIQUE, 규칙 테이블과 카테고리를 확인했다. 카테고리만 5→7건이고 그 외 기존 테이블 건수는 변경되지 않았다. 신규 `source_collection_rules`는 0건이다. 두 구 테이블은 각각 0건으로 유지했으며 `release-posts-cleanup.sql`은 실행하지 않았다.
- 이 단계의 전체 metadata-only catalog는 15개 테이블·131개 컬럼이며 새 연결의 대상·READ ONLY·ROLLBACK·completion marker를 확인했다. 정확한 객체와 digest는 [구조 기준서](./database-schema.md#운영-릴리스-구조-2026-11-09)를 따른다. `production-additive-receipt.json`, 전후 집계 JSON, SQL 출력과 catalog를 같은 비공개 작업 경로에 보존했다.
- 이후 `publish_app`은 웹의 DB 스키마 검토가 필요하다는 오류를 반환했고 새 배포를 시작하지 않았다. 사용자가 웹 검토·배포를 승인하고 브라우저 로그인을 마친 뒤 아래의 플랫폼 적용 절차로 계속했다. 명부 재동기화·실계정 QA·자동 원복은 수행하지 않았다.

### 웹 게시의 구 테이블 제거 절차

- 로그인 후 시작한 웹 Republish는 DB 승인 단계에서 멈췄으며 생성 SQL은 `DROP TABLE "community_events" CASCADE;`와 `DROP TABLE "obituaries" CASCADE;` 두 문장이다. 다른 테이블·행의 변경이나 개발 DB 전체 복사는 선택하지 않았다.
- 2026-11-09 13:18 KST `neondb`·READ ONLY를 다시 확인했다. 두 테이블 각각 0건, 외부 incoming FK 0개이며 `pg_depend`와 테이블 행 타입에 대한 의존 관계는 해당 테이블의 자동 소유·내부 객체(`a`·`i`)뿐이다. public view·materialized view·routine·사용자 trigger는 모두 0개다. 앞선 집계의 기존 테이블 건수도 그대로다.
- 적용 직전 구조 snapshot `production-before-web-approval-schema.sql`의 SHA-256은 `44655eff6bd954ac96d6bbef9d1af9cd6d762b27d0e283e2a5468e2bab613f61`이다. `production-before-web-approval.json`에는 대상·건수·객체 의존 관계를 남겼다. 모두 Replit `.superpowers/release-20261109/`에 있으며 행 원문·Secret은 없다.
- 이미 승인된 두 빈 테이블 제거의 실효 범위를 유지하므로, 이번에만 검토한 두 문장을 Replit Publishing에서 승인한다. Replit은 빌드 완료 뒤 새 버전 전환 전에 마이그레이션하며 비호환 구 앱을 잠시 중지할 수 있다. 기존 수동 cleanup 순서를 이 플랫폼 적용으로 대체한다. 이는 일반적인 `CASCADE` 허용이나 삭제 범위 확대가 아니다.
- 배포 후 새 운영 연결에서 두 테이블과 소유 객체 제거, 나머지 테이블 건수 보존, 전체 catalog를 확인한다. 플랫폼에서 삭제가 끝나면 `release-posts-cleanup.sql`은 실행하지 않는다. 실제 적용 전에는 이 절의 검토·승인을 삭제 완료로 표시하지 않는다.

### 운영 전환 완료 결과

- 2026-11-09 13:25 KST Replit 재게시 success 이후 새 운영 연결에서 `current_database()=neondb`·READ ONLY를 확인했다. `community_events`·`obituaries`와 소유 객체가 제거됐으며 수동 cleanup SQL은 실행하지 않았다.
- 존속 테이블의 건수는 적용 직전 집계와 모두 일치한다. 명부는 3,458건, 카테고리는 추가 단계에서 만든 7건, 수집 규칙은 0건이다. 일반 게시글·댓글·회원·명부·기존 인증 기록의 행 변경을 하지 않았다.
- 최종 전체 catalog는 `13/102/13/8/6/6/24/9`(tables/columns/PK/FK/non-PK UNIQUE/CHECK/indexes/sequences)이며 출력 SHA-256은 `50b2f6f8676b7ad37a6a1ebd15e596255450f5db5c23f8a1430c6a4cfbf3c60c`다. 추가 구조 적용 후 catalog와 비교한 차이는 승인된 두 구 테이블 및 소유 객체의 제거뿐이었다. READ ONLY gate·ROLLBACK·완료 marker를 확인했다.
- 구조 snapshot `production-after-web-publish-schema.sql`의 SHA-256은 `b10b764347f0640ce3afbe2d03294b805753eee6b506fb691aa90bd4a099a2b2`다. 새 연결 집계·catalog·HTTP 결과와 `release-completion.json`을 같은 작업 경로에 보존했다. 운영 Secret 값과 행 원문은 보존하지 않았다.

## 게시글 본문 서식 계약 (2026-11-09)

- 일반 게시글의 서식 입력은 마크다운으로 변환해 기존 `posts.content` TEXT에 저장한다. 기존 텍스트와 경조사 본문은 공통 표시기를 적용하며 행을 변환하지 않는다.
- 이번 작업에는 DB 접속·DDL·`db:push`·데이터 마이그레이션이 필요하지 않다. 코드·의존성·문서만 Replit 개발에 반영하고 필요한 정적 검사로 확인한다. 물리 catalog는 이전 관찰 이력을 유지한다.
- 2026-11-09 Replit 개발에 코드·문서·lockfile 15개를 적용하고 타입·경계 정적 검사를 통과했다. DB 접속·DDL·행 변경·catalog 재수집은 수행하지 않았다.
- 운영 DB·운영 배포·실계정 QA·게시 시험은 수행하지 않았다. 적용 파일과 정적 검사·미실행 범위는 [Replit 본문 서식 기록](../replit.md#게시글-본문-서식-2026-11-09-개발-코드-적용)을 따른다.

## 결혼·개원 수집 계약 보완 (2026-11-09)

- 기존 `source_collection_rules`와 `posts.event_data`의 JSON 계약을 호환 확장한다. `noticeTypes`가 없는 기존 수집 규칙은 앱에서 부고 전용으로 해석하고, 경사는 해당 유형으로 새로 성공한 규칙만 사용한다. 새 경사 사실 키가 없는 기존 초안도 읽을 수 있게 한다.
- 이번 구현에는 DDL·`db:push`·행 초기화·일괄 JSON 변환이 필요하지 않다. 직전 개발 규칙과 명부 데이터를 보존한다. 새로운 규칙 upsert는 이후 승인된 실제 수집 요청에서 기존 저장소를 통해 이루어진다.
- Replit의 직전 manifest·규칙 저장/재사용 receipt와 개발 DB 이름·규칙 메타데이터만 대조하고, 코드·문서 적용 후 필요한 정적 검사를 수행한다. 원문·개인정보·Secret을 읽거나 출력하지 않는다. 운영 DB·배포·실계정 QA·실제 경사/부고 링크 호출은 이번 범위가 아니다.

### 적용 기록

- 2026-11-09 Replit 개발 환경의 기본 `PG*` 연결로 `BEGIN READ ONLY`에서 `current_database()`와 규칙 전체/`noticeTypes` 키 보유 건수만 조회한 뒤 `ROLLBACK`했다. 대상은 `heliumdb`, 규칙은 1건, 유형 키 보유는 0건이었다. 규칙 원문과 명부 행은 조회하지 않았다.
- 직전 수집기 24개 파일의 manifest와 실제 소스가 일치했다. 기존 소스를 `.superpowers/celebration-20261109/before-source.tar.gz`에 보존하고 변경 전 해시를 대조한 뒤 이번 코드·문서 18개를 적용했다. 최종 코드의 Replit 타입·경계 검사는 05:54 KST 통과했다.
- 이번 작업의 SQL은 위 읽기 전용 조회뿐이다. DDL·`db:push`·규칙 upsert·성공 시각 갱신·명부/게시글 변경·JSON 일괄 변환은 실행하지 않았다. 물리 구조가 같으므로 05:04의 metadata-only catalog를 이력으로 유지하고 불필요한 전체 재수집을 하지 않았다.
- 결혼·개원 규칙 저장·재사용은 코드로 연결했으나 실제 경사 링크 호출은 수행하지 않았다. 유형별 확인/미실행 범위와 증거 파일은 [Replit 적용 기록](../replit.md#결혼개원-보완-2026-11-09-개발-코드-적용)을 따른다. 운영 DB·배포·실계정 QA는 계속 보류한다.

## 공개 링크 수집 규칙 개발 적용 (2026-11-09)

- 목표: 범용 경조사 수집과 PostgreSQL 규칙 저장·재사용을 Replit 개발 환경에 적용한다.
- 범위: 개발 workspace, `heliumdb`, 새 `source_collection_rules` 테이블과 프로젝트에 포함된 수집 코드·브라우저/OCR 의존성. 개별 부고와 명부를 규칙에 복제하지 않는다.
- 완료 조건: 네 기준 문서 선반영, additive SQL·스키마 일치, 개발 타입/경계 검사, 사용자 지정 링크의 수집·규칙 저장·다음 요청 재사용을 각각 확인한다. 미확인 경로를 분리한다.
- 제외: 운영 DB·배포·실계정 QA·게시·OpenAI 문안 생성·전체 회귀·무관한 레코드 변경·GitHub 게시.
- 절차: 개발 DB 이름·새 테이블 존재 여부·기존 테이블별 건수 확인 → schema-only snapshot → `scripts/add-source-collection-rules.sql` 한 트랜잭션 → 새 연결의 객체·건수 대조 및 metadata-only catalog → 수집만 실행. Secret·개인정보·수집 원문을 증거 파일에 저장하지 않는다.

규칙의 저장·조회·구조 확인·upsert는 앱 서버가 수행한다. 저장된 API 주소에도 공개 주소·리다이렉트·응답 검사를 적용하며 규칙 불일치 시 재탐색한다. 성공한 원본 변경의 자동 원복이나 기존 테이블 삭제는 수행하지 않는다. 실제 적용 시간·소스·catalog·정적 검사·수집 경로의 관찰 결과는 실행 후 이 절에 기록한다.

### 적용 기록

- 2026-11-09 05:04 KST Replit 기본 `PG*` 연결이 `heliumdb`이고 운영 배포 환경이 아님을 확인했다. 변경 전 테이블 12개, 새 테이블 없음, 명부 3,458건·카테고리 7건·그 밖의 기존 테이블 각 0건이었다.
- `.superpowers/collector-20261109/before-schema.sql`에 schema-only snapshot 17,122 bytes를 저장했다. SHA-256은 `f81c7bfdb3264f132c1a0703d679d1d49509786d89ac47d3c55416823c57d19b`다. 기존 소스는 `before-source.tar.gz`·`before-source.json`으로 보존했다. 애플리케이션 원문이나 개인정보를 snapshot에 포함하지 않았다.
- `scripts/add-source-collection-rules.sql`을 한 트랜잭션으로 COMMIT했다. 추가한 테이블 1개 외에 기존 객체를 바꾸거나 행을 삭제하지 않았다. 새 연결에서 8개 컬럼, PK·UNIQUE·CHECK 2개와 valid index 2개, serial sequence를 확인했다.
- metadata-only catalog는 `heliumdb`·READ ONLY gate·ROLLBACK·completion marker로 완료했다. tables/columns/PK/FK/non-PK UNIQUE/CHECK/index/sequence는 `13/102/13/8/6/6/24/9`다. 출력 SHA-256은 `5d5fa59ebd65c7e344bff3e245cd1dbf8f0ca28749a64b64963cd85307c5693b`이고 `after-catalog.txt`에 보존했다.
- 05:13 KST 실제 공개 링크 수집에서 규칙 1개를 저장했다. 05:18 KST 별도 프로세스에서 그 규칙으로 원본 API를 다시 읽고 마지막 성공 시각을 갱신했다. 규칙 버전 1을 유지했으며 개별 부고 ID·수집 개인정보·인증 필드 미포함을 확인했다. 다른 페이지 ID 적용과 규칙 불일치 재탐색은 이번에 실행하지 않았다.
- 05:19 KST 새 연결에서 규칙 1건, 명부 3,458건·카테고리 7건·나머지 기존 테이블 각 0건을 재확인했다. 기존 데이터 건수는 모두 보존됐다. 정적 검사·실제 수집 경로·미수행 경로는 [Replit 적용 기록](../replit.md#개발-수집-적용-결과-2026-11-09)에 구분했다.
- 실행 증거는 같은 디렉터리의 `before-counts.json`, `schema-apply.txt`, `after-counts.json`, `collection-discovery.json`, `collection-reuse.json`, `receipt.json`에 저장했다. 적용 소스·lockfile digest는 `source-manifest.json`을 따른다. 운영 DB·운영 배포·실계정 QA·서버 재시작·GitHub 게시를 수행하지 않았다.

## 개발 명부 최신 동기화 (2026-11-09)

- 목표: 사용자 요청에 따라 Google Sheets의 최신 동문 명부를 기존 동기화 기능으로 Replit Development Database에 반영한다.
- 범위: `/home/runner/workspace`, 기본 `PG*` 연결의 `heliumdb.alumni_database`, `RegistryStorage.previewAlumniSync`와 `applyAlumniSync`를 사용한다. Google Sheets는 읽기만 한다.
- 완료 조건: 적용 결과의 추가·수정·변경 없음·오류 건수와 새 연결의 저장 결과를 대조한다. 오류 레코드는 사용자가 요청한 핸드폰번호로 이 대화에서 보고하고 문서·증거 파일에는 번호를 보존하지 않는다.
- 제외 범위: 운영 DB·운영 배포·실계정 QA·서버 재시작·원본 명부 수정·GitHub 게시를 수행하지 않는다.
- 확인: 개발 DB 이름과 변경 전 건수, 원본 미리보기·fingerprint, 기존 트랜잭션 적용 결과와 새 연결의 필수값·중복·회원 연결 상태를 확인한다. 제품 코드 변경이나 별도 회귀 검사를 기본으로 추가하지 않는다.

### 최초 미리보기의 오류 이력

- 04:23 KST Replit의 기존 Google Sheets 서비스와 명부 동기화 함수를 실행했다. 필요한 Secrets 3개의 존재만 확인했으며 값은 출력하지 않았다. 실행 코드 4개 파일은 로컬 구현과 SHA-256이 일치했다.
- 대상은 `heliumdb`이며 변경 전 명부·회원·별칭·회원 연결·명부 필수값 누락은 각각 0건이었다. 원본 3,458건 중 전화번호 형식 오류 3건, 중복 충돌 0건이 확인됐다.
- 현재 동기화는 `010` 형식으로 정규화되는 번호만 허용한다. 오류는 `011` 1건과 `017` 2건이며 원본 행 450·1440·1590이다. 원본에 없는 번호를 추정하거나 수정하지 않았다.
- 최초 미리보기는 `blocked=true`, `INVALID_MOBILE=3`, `sourceFingerprint=null`을 반환했다. 이때 기존 정책에 따라 apply를 실행하지 않았으며 추가·수정은 0건이었다. 정상 3,455건도 이 단계에서는 반영하지 않았다.
- 사용자는 Google Sheets의 오류 3건을 수정한 뒤 전체 반영하는 방식을 선택했고, 이후 원본 수정 완료와 재동기화를 요청했다. 오류 행을 제외한 부분 반영이나 기존 전화번호 검사 변경은 하지 않았다. Codex가 원본 번호를 추정해 수정하지 않았다.
- 원문 없는 실행 증거는 Replit `.superpowers/alumni-sync-20261108T192332Z/preview.json`에 보존했다. 이 결과는 명부 적용 완료나 새 연결의 사후 대조 완료를 뜻하지 않는다.

### 원본 수정 후 전체 적용 결과

- 2026-11-09 04:31 KST Replit `/home/runner/workspace`에서 기존 `RegistryStorage.previewAlumniSync`와 `applyAlumniSync`를 실행했다. 기본 `PG*` 대상 `heliumdb`를 확인했으며 실행 코드 4개 파일은 앞선 후보와 일치했다. 제품 코드와 스키마는 변경하지 않았다.
- 변경 전 명부는 0건이었다. 새 Google Sheets 미리보기는 원본 3,458건·추가 3,458건·수정 0건·변경 없음 0건·충돌 0건·오류 0건, `blocked=false`를 반환했다.
- 04:31:40 KST 기존 advisory lock·원본 재조회·동일 fingerprint 확인을 거쳐 한 트랜잭션으로 추가 3,458건을 커밋했다. 적용 결과의 수정·변경 없음·오류는 각각 0건이다. Google Sheets 읽기는 미리보기와 적용 시 각 1회이며 원본을 변경하지 않았다.
- 커밋 후 별도 연결에서 명부 총 3,458건을 확인했다. 적용 시 읽은 원본과 12개 관리 필드를 대조한 결과 3,458건 모두 동일하고 추가·수정 필요는 0건이었다. 필수값 누락·잘못된 전화번호·전화번호 중복·끊어진 회원 연결은 모두 0건이었다. 회원·별칭·명부의 회원 연결은 변경 전과 같은 각각 0건이다.
- 개인정보 없는 실행 증거는 Replit `.superpowers/alumni-sync-20261108T193130Z/receipt.json`에 보존했다. 상태는 `verified`, SHA-256은 `38118c9e1bc7cd85597ef3da53146b3fa5ee5b06e6cb9df54601856287983555`다. 오류 레코드는 없어 보고할 핸드폰번호도 없다.
- 운영 DB 변경·운영 배포·실계정 QA·서버 재시작·GitHub 게시를 수행하지 않았다. 이 기록은 개발 명부 동기화와 데이터 대조 결과이며 로그인 기능 전체의 확인 결과는 아니다.

## 게시글 통합 결정과 실행 범위 (2026-11-09)

현재 사용자 요청은 **Replit 개발 DB 전환·통합 코드 적용·개발 서버 재시작**이다. 개발 서버를 잠시 멈춘 상태에서 준비된 같은 버전의 코드와 SQL을 함께 적용하고 `npm run dev`로 기동한다. GitHub 게시나 main 병합은 포함하지 않는다. 변경 전 schema-only snapshot과 기존 Git 기준·파일 digest를 개발 workspace의 Git 제외 경로 `.superpowers/`에 보존한다. 기존 두 전용 테이블의 테스트 행은 승인대로 폐기하며 데이터 이관·복원은 수행하지 않는다. 전환 SQL 실패 시 커밋되지 않은 트랜잭션은 종료하고, 성공한 변경의 원복은 자동 실행하지 않는다.


- [확정 제품 정책](../planning_proposal.md#게시글과-경조사-통합)에 따라 통합 구현의 삭제 대상은 `community_events`·`obituaries` 두 테이블과 그 안의 기존 경조사·레거시 부고 데이터다. 새 저장 경로는 `posts`·`categories`와 `posts` 내부 JSONB다. PostgreSQL 데이터베이스 전체, 일반 게시글·댓글·명부 또는 Object Storage 파일 삭제를 뜻하지 않는다.
- 사용자가 출시 전 데이터·상세 주소 폐기와 마이그레이션 불필요를 확정했다. 보존 이관·ID 매핑·옛 상세 주소 호환을 작업에 추가하지 않는다. 기존 `migrate-obituaries-to-community-events.sql`은 이 전환에 사용하지 않는다.
- 2026-11-09 정책 선커밋 후 통합 구현 요청을 받았다. 개발 전환에서는 대상 DB와 의존 관계, 삭제 범위·순서와 복구 가능한 구조 기록을 준비한 뒤 확정된 범위에 적용한다. 무관한 객체를 함께 삭제하는 `DROP ... CASCADE`는 사용하지 않는다.
- 전환 SQL은 `scripts/unify-posts.sql` 한 트랜잭션으로 posts 컬럼·제약·인덱스 추가 → 카테고리 추가 → 두 구 테이블 DROP 순서다. Development 구조 snapshot과 의존 관계·건수 미리보기 후 적용하며 일반 posts/comments와 다른 테이블의 건수는 보존한다. 실패 시 트랜잭션은 rollback된다. 성공 후에는 구 테스트 행 복원 없이 snapshot으로 구조만 복원할 수 있으나 자동 rollback은 하지 않는다.
- 앞선 정적 검사 단계에서는 별도 checkout만 사용하고 기존 14개 테이블을 read-only로 확인했다. 이후 사용자 요청에 따라 아래 개발 활성화를 별도로 수행했다.
- 운영 배포와 실계정 QA는 계속 보류한다. 개발 전환이 운영 DB 변경·Republish를 자동으로 시작하지 않는다. 새 환경별 적용 결과는 실제 실행 후 기록한다.

### 개발 DB 전환 결과

- 실행일: 2026-11-09 KST. 대상은 Replit `PG*` 기본 연결의 Development `heliumdb`이고 `REPLIT_DEPLOYMENT`가 운영 값이 아님을 확인했다. Production 연결은 선택하지 않았다.
- 변경 전: `community_events`·`obituaries` 각 0건, 다른 테이블에서 두 테이블을 참조하는 FK 0개. 두 테이블의 author FK만 `users`를 참조했다. 카테고리 5건, 나머지 애플리케이션 테이블 각 0건이었다.
- 복구 자료: `/home/runner/workspace/.superpowers/unified-posts-activation-20261108T181441Z/`에 `before-schema.sql`(schema-only, 19,948 bytes, SHA-256 `d6c7eab180dde0b21837ab78bafd69ac64f52ec93e5e17d91bf46ce5c24e65d8`), `before.json`, 적용 소스 manifest를 보존했다. 이전 checkout은 main `abff93e`, 전환 후보는 정책 commit `2855424`와 그 위의 검사 완료 구현 변경이다. 원복 실행은 하지 않았다.
- 03:17:22 KST: `scripts/unify-posts.sql` 한 트랜잭션 COMMIT. `posts` 컬럼 4개·CHECK 2개·partial UNIQUE index 1개, 부고·경사 카테고리를 추가하고 두 구 테이블만 삭제했다. 이 SQL은 재실행용이 아니다.
- 03:21 KST 새 연결: 구 테이블 없음, 새 컬럼의 타입·NULL·기본값, CHECK validated 및 unique index valid/ready를 확인했다. 카테고리는 7건이며 `obituary=부고`, `celebration=경사`가 활성 상태다. 일반 posts/comments·회원·명부 등 나머지 11개 테이블은 변경 전과 같은 각 0건이다.
- canonical metadata-only catalog는 `heliumdb`·READ ONLY gate·ROLLBACK·completion marker로 종료했다. 관찰한 tables/columns/PK/FK/non-PK UNIQUE/CHECK/index/sequence는 `12/94/12/8/5/4/22/8`이다. 상세 구조는 [스키마 기준서](./database-schema.md#개발-db-catalog-2026-11-09)를 따른다.
- SQL 결과는 `transition-output.txt`·`transition-receipt.json`, 새 연결 결과는 `after.json`·`after-catalog.txt`에 보존했다. 개발 서버 재기동 결과는 [Replit 운영 문서](../replit.md#개발-적용-결과)에 기록했다.

## 환경과 기준 상태

| 구분 | Development Database | Production Database |
|---|---|---|
| 용도 | 구현, 테스트, 반복 초기화 | Republish된 서비스의 운영 데이터 |
| 기본 접근 | Replit SSH의 `PG*` 환경변수와 `DATABASE_URL` | Replit Secret의 명시적 `PROD_DATABASE_URL` |
| 확인된 DB | `heliumdb` | `neondb` |
| 기본 선택 여부 | 기본값 | 명시적으로 선택할 때만 사용 |

Google Sheets는 최종 전환 선언 전까지 명부 관리 원본이고 PostgreSQL `alumni_database`는 로그인·가입 심사용 런타임 복제본이다. 로그인 요청은 Google Sheets를 직접 조회하지 않으며, 명시적인 관리자 동기화로 PostgreSQL 복제본을 갱신한다. 이 문서는 행 데이터·개인정보·운영 건수를 기록하지 않는다.

## SSH 접속

로컬 Mac에서 다음 SSH 명령으로 Replit 개발 워크스페이스에 접속한다.

```bash
ssh -i ~/.ssh/replit -p 22 dc5e5541-525b-4ad6-b914-2d2db70cb4a9@dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev
cd /home/runner/workspace
```

2026-11-08 이전 개발 세션의 사용자 제공 명령을 확인한 뒤 이 명령으로 접속을 재검증했다. 사용자명은 Replit ID 전체이며 Mac 계정명이나 `runner`가 아니다. 개발 checkout의 HEAD·working tree와 Node/npm 버전만 확인했으며, 이 접속 검증에서 DB나 Secret 값을 조회하지 않았다. 호스트가 바뀌면 Replit의 SSH 접속 명령을 다시 확인한다.

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

### 격리 개발 DB 회귀 검사 (fork / CI)

경조사·명부 DB 회귀 검사는 원본 Replit ID가 아닌 **명시적 opt-in**으로 실행한다.

```bash
npm run test:development-db
```

- 기본 `npm test`에서는 opt-in 미지정 시 두 DB 검사만 skip한다. 전용 명령은 `RUN_DEVELOPMENT_DB_TESTS=1`을 해당 프로세스에만 설정하므로 잘못된 대상은 skip 없이 실패한다.
- 미리 현행 앱 스키마가 준비된 격리 개발 DB를 사용한다. CI는 `heliumdb` 이름의 로컬 PostgreSQL과 `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`를 준비한다. 허용 호스트는 정확히 `helium`, `localhost`, `127.0.0.1`뿐이다. 원격 CI DB는 허용하지 않는다.
- `NODE_ENV=production`, `REPLIT_DEPLOYMENT=1`, 다른 DB 이름, 누락된 PG* 인증, 잘못된 포트, 알려진 운영 URL과 같은 endpoint는 연결 전에 거부한다. 운영 Secret은 테스트 대상으로 사용하지 않는다.
- 테스트 선택 정책은 `server/tests/development-db-target.ts`에만 있다. 서버의 `server/db.ts` PG* 우선순위를 변경하지 않으며 `DATABASE_URL`로 fallback하지 않는다. fixture 연결과 실제 storage 연결 모두 `current_database() = heliumdb`를 확인한 뒤 쓰기를 시작한다.
- 실제 Google Sheets 호출·apply는 하지 않는다. 명부 source는 메모리 fixture로 대체한다. UUID 소유 fixture만 정리하고, 완료 출력의 경조사 users/events 및 명부 alumni/users/triggers/functions 잔여가 모두 0인지 확인한다.
- 명부 검사는 rollback 검증용 임시 trigger/function을 만들었다가 제거하므로 해당 권한이 필요하다. 권한/스키마/연결 오류도 실패로 취급한다.

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

### 동문 공식 이름·개명 전 별칭 스키마

Google Sheets의 `alumni_database.name` 복제값은 원본 대조를 위해 덮어쓰지 않는다. 검증된 현재 공식 이름과 개명 전 이름은 별도 additive 테이블에 저장하며, 관리자 경조사 대리등록에서만 `입력 이름 또는 별칭 + 학번` 단일 일치 판정에 사용한다. 카카오 가입·로그인 명부 매칭의 기존 이름+전화번호 계약은 이 별칭 조회로 확장하지 않는다.

```sql
CREATE TABLE IF NOT EXISTS alumni_name_aliases (
  id serial PRIMARY KEY,
  alumni_id integer NOT NULL,
  name text NOT NULL,
  normalized_name text NOT NULL,
  alias_type text NOT NULL,
  is_preferred boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT alumni_name_aliases_alumni_id_alumni_database_id_fk
    FOREIGN KEY (alumni_id) REFERENCES alumni_database(id) ON DELETE CASCADE,
  CONSTRAINT alumni_name_aliases_type_check
    CHECK (alias_type IN ('current_name', 'former_name')),
  CONSTRAINT alumni_name_aliases_normalized_not_blank
    CHECK (length(normalized_name) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS alumni_name_aliases_alumni_normalized_unique
  ON alumni_name_aliases (alumni_id, normalized_name);
CREATE UNIQUE INDEX IF NOT EXISTS alumni_name_aliases_preferred_unique
  ON alumni_name_aliases (alumni_id)
  WHERE is_preferred = true;
CREATE INDEX IF NOT EXISTS alumni_name_aliases_normalized_idx
  ON alumni_name_aliases (normalized_name);
```

별칭 적용 전 `current_database()`와 대상 `이름+학번` 일치 건수를 확인한다. 하나의 transaction에서 대상 `alumni_id`를 다시 잠그고 현재 공식 이름은 `alias_type='current_name'`, `is_preferred=true`, 개명 전 이름은 `alias_type='former_name'`, `is_preferred=false`로 upsert한다. 적용 후 새 연결에서 대상별 preferred 1건, 중복 정규화 이름 0건, 다른 명부 행 변경 0건을 확인한다. Production Database 적용은 코드 Republish와 별도의 운영 DB 변경으로 취급하며 Development 검증 뒤 명시적으로 실행한다.

2026-08-16 Development `heliumdb`에는 위 테이블·제약 4개·비-PK 인덱스 3개를 적용했다. 기존 스키마에 Drizzle 관리 밖의 회계 테이블이 있어 비대화형 `drizzle-kit push`가 새 테이블을 기존 테이블 rename 후보로 잘못 제시한 뒤 적용 없이 종료됐다. 기존 테이블 보존과 새 테이블 미생성을 확인한 다음 위 정확한 additive SQL만 transaction으로 실행했다. 검증된 한 명의 현재 공식 이름 1건과 개명 전 이름 1건을 추가했고 preferred 1건, 원본 `alumni_database.name` 보존, 전체 별칭 2건을 확인했다.

같은 날 Production `neondb`는 적용 전 13 tables/112 columns/13 PK/9 FK/6 non-PK UNIQUE constraints/20 indexes/9 sequences와 별칭 테이블 부재를 확인했다. 이름+학번 조건이 정확히 한 명과 일치한 뒤 하나의 transaction으로 exact additive SQL과 그 동문의 별칭 2건만 적용했다. 새 연결에서 14/119/14/10/6/24/10, 별칭 제약 4개, PK 포함 인덱스 4개, preferred 1건, 중복 정규화 이름 0건, 원본 명부 보존을 확인했으며 canonical metadata-only catalog가 read-only `ROLLBACK`과 completion marker로 종료됐다. 실제 이름·연락처·행 데이터·연결 문자열은 검증 기록에 남기지 않는다.

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
alumni_name_aliases
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
