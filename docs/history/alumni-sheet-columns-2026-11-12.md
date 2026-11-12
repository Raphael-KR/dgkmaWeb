# 명부 시트 컬럼 변경

- 목표: 주소·전화번호가 삭제된 Google Sheets에서 명부를 가져올 수 있게 한다.
- 범위: Sheets 읽기·파싱, 동기화 계획의 관리 필드, 기존 검사와 관련 기준 문서.
- 완료 조건: 실제 헤더와 10개 필드 계약을 맞추고 DB 주소·전화 컬럼과 값을 보존하며, Replit 개발 소스 반영과 필요한 정적 검사를 마친다.
- 최초 구현 제외: 시트 편집, 실제 DB 동기화·DDL·데이터 변경, 서버 재시작·릴리스·실계정 QA. 후속 요청의 개발 서버 재시작은 아래에 구분한다.
- 검증: 변경 파일 lint·서식, 앱 타입·의존 경계·변경된 테스트 타입, 문서 정합성과 `git diff --check`.

## 원본 확인과 결정

2026-11-12 사용자가 주소·전화번호 필드를 DB에는 남기고 시트에서 삭제한 두 열에 맞춰 가져오기 코드를 수정하도록 요청했다. 연결된 동문회 Google 계정에서 [명부](https://docs.google.com/spreadsheets/d/1YBu0MtJ3lt2AB1-DB3-u7NP-TSgehKmGK3Ox4PJCzLw/edit)의 메타데이터와 `통합주소록!A1:J1`을 읽었다. 이 파일이 Replit의 설정된 원본과 일치함을 값 노출 없이 대조했다. 회원 행 원문은 읽거나 기록하지 않았다.

현재 헤더는 학과·기수·성명·입학일자·졸업일자·핸드폰번호·그룹·상태·동문회직책·메모다. `통합주소록`은 첫 탭이며 10열·헤더 고정 1행으로 확인했다. 코드의 이전 `A:L`·12개 필수 헤더는 현재 시트와 맞지 않는다.

[제품 정책](../product/planning-proposal.md#동문-명부), [운영 안내](../../replit.md#현재-동문-명부-연동), [DB 스키마](../reference/database-schema.md#table_row-alumni_database), [DB 런북](../runbooks/database-operations.md#google-sheets-명부-동기화)을 먼저 갱신했다. `address`·`phone`은 원본 파싱·비교·fingerprint·쓰기에서 제외하고 DB 컬럼·기존 값을 보존한다. `mobile`과 현재 회원 전화번호, 기존 권한·미리보기·적용 잠금·회원 연결은 유지한다.

## 구현·개발 적용과 확인 범위

- `server/integrations/google-sheets.ts`는 탭을 명시한 10열 범위를 읽고 현재 10개 헤더를 기준으로 파싱한다. 관리 대상 헤더·필수값 누락은 계속 차단한다.
- `server/modules/registry/alumni-sync-plan.ts`는 Sheets 관리 필드와 DB 보존 필드를 구분한다. 쓰기 객체에 `address`·`phone`을 넣지 않으므로 기존 `.set(change.source)`가 두 값을 덮어쓰지 않는다. 새 행은 기존 nullable 정의에 따라 두 값이 NULL로 남는다. 테이블 정의·실제 저장 트랜잭션은 수정하지 않았다.
- 기존 검사 3개 파일의 헤더·행 위치·원본 타입을 새 계약에 맞췄다. 기존 사례에서 읽기 범위·핸드폰 위치·두 필드의 쓰기 객체 제외를 확인하도록 보완했다. 실행형 테스트나 DB fixture 생성은 하지 않았다.
- 로컬 변경 파일을 해시 대조 후 Replit 개발 사본에 직접 반영했다. 2026-11-12 08:40 KST Node.js `20.20.0`에서 변경 코드 5개의 ESLint·Prettier, `npm run check`(앱 타입·의존 경계), `npm run check:tests`를 통과했다. 검사 전후 소스·스키마·설정·lockfile 해시가 같았다. 기존 locale 경고와 npm 업데이트 안내 외 오류는 없다.
- 실제 시트 헤더와 코드의 10개 컬럼 대응, DB 스키마의 주소·전화·회원 전화번호 필드 보존을 정적으로 확인했다. 문서 내용·로컬 링크·앵커와 `git diff --check`를 확인했다. 근거는 Git 제외 경로 `.superpowers/alumni-sheet-columns-20261112/`에 보관한다.

실제 회원 행 읽기·파싱, DB preview/apply·값 보존 결과, 관리자 화면 동작·실계정 QA는 미검증이다. 최초 구현 시점에는 서버 재시작·운영 배포·커밋·push를 수행하지 않았다. 실제 동기화는 별도 미리보기·적용으로 수행한다.

## 후속 개발 서버 재시작

2026-11-12 사용자 요청으로 09:20 KST Replit 개발 앱을 `npm run dev`로 다시 기동했다. 확인 시점에는 개발 앱 프로세스와 5000 포트가 중지 상태여서 종료할 프로세스 없이 새 앱(PID 142)을 시작했다. 기동 전 로컬·Replit 파일 595개의 해시가 일치했다. 목업 서비스도 중지 상태였으며 조작하지 않았다.

개발 DB 연결·기존 세션 인덱스 확인·5000 포트 기동 로그에 경고나 치명 오류가 없었다. 개발 서버 내부 HTTP에서 `/about`은 HTML 200, `/api/admin/pending-registrations?status=approved`는 비로그인 JSON 401이었다. 새 가져오기 코드와 연결 명부 조회 항목 축소 코드가 포함된 소스로 기동했으며, 실제 동기화·회원 조회 결과를 검증한 것은 아니다.

앱 소스를 변경하지 않아 통과한 정적 검사는 반복하지 않았다. DB 동기화·별도 DB 작업·운영 배포·실계정 QA·커밋·push는 수행하지 않았다. 실행 근거는 같은 Git 제외 경로의 `restart-before.json`·`restart-runtime.json`·`restart-result.json`에 보관한다.
