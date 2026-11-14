# 커뮤니티 일회성 이관 도구

분류·제외·실행 시점은 [이관 기준](../product/community-archive-migration-proposal.md)을 따른다. 다음카페와 밴드는 각각 전체 후보를 한 번에 반영하며 증분 이관하지 않는다. 아래 도구는 현재 다음카페 준비 자료용이며 BAND 자료를 입력하지 않는다. 운영 대상은 운영 개시 직전 최종 반영에서만 사용한다.

## 공통 인자와 환경

도구 소스는 `local-backups/community/tools/`에 있으며 사용하는 Python·MJS 8개를 Git으로 관리한다. 같은 트리의 원본·SQLite·바이너리·변환물·payload·영수증은 계속 Git 제외다. Replit에서 `node --import tsx <도구> <workspace> <payload-directory> <mode> <environment> <expected-database>` 형식으로 호출한다. 백업 입력 도구의 `environment`는 development만 허용하며 DB 이름은 heliumdb를 명시한다. production 입력은 거부한다. 선택한 실제 DB 이름을 확인하고 다르면 쓰지 않는다.

- 백업→개발 DB는 앱의 기본 PG* 선택을 유지한다. 운영 DB 선택은 아래 개발→운영 도구에만 있으며 Replit의 PROD_DATABASE_URL을 사용한다. PG*를 해제하거나 바꾸지 않는다.
- 파일 저장소는 개발 PRIVATE_OBJECT_DIR을 사용한다. 운영 이전 도구만 PROD_PRIVATE_OBJECT_DIR을 사용한다. 운영용 값은 실제 운영 앱 PRIVATE_OBJECT_DIR과 일치해야 한다. 누락 시 개발 경로로 대신 쓰지 않는다. URL·Secret·비공개 경로를 로그에 출력하지 않는다. 설정 추가 자체는 이번 작업에서 실행하지 않았다.
- 백업 이관의 사진첩 경로는 개발 비공개 루트의 heritage/development다. 운영 이전 도구만 운영 루트의 heritage/production을 사용한다. 게시글 첨부는 선택한 루트의 uploads 경로와 기존 앱 참조 계약을 사용한다.

## 게시글

apply-post-migration.mjs는 최종 v2 posts.json과 files/를 입력한다. `--validate`는 파일·본문·메타데이터 검증만 하고 DB·Storage에 연결하지 않는다. `--preview`는 대상 DB 이름·기존 게시글/댓글 수·카테고리를 읽어 출력하고 쓰지 않는다.

`--apply`는 비어 있는 posts에 전체 후보를 삽입한다. `--reset-and-apply`는 명시적으로 선택한 경우에만 posts 전체 행을 삭제하고 전체 후보를 삽입한다. 댓글은 기존 FK의 ON DELETE CASCADE로 함께 정리한다. 카테고리·회원·명부·회비·스키마·시퀀스·Storage 파일은 삭제하지 않는다. 리셋과 DB 삽입은 하나의 트랜잭션이며 DB 오류 시 미완료 트랜잭션을 취소한다. 커밋된 작업의 자동 원복은 하지 않는다.

첨부는 먼저 저장·해시 대조한다. DB 실패 시 남은 파일을 자동 삭제하지 않는다. 새 DB 연결에서 전체 건수·대상 ID·본문/메타데이터·작성자·날짜·첨부 참조를 대조한다. 기존 행을 비교·병합·upsert하지 않는다. 이 도구의 전체 리셋을 플랫폼별 자동 실행으로 연결하지 않는다. BAND의 실제 실행 순서는 별도이며 선행 이관 자료를 지우지 않는다.

## 사진첩

apply-heritage-albums.mjs는 catalog.json과 photos/를 입력한다. `--validate`는 로컬 최종 자료만 검사하고, `--preview`는 실제 DB 환경과 카탈로그 존재 여부만 확인한다. `--apply`는 전체 사진을 저장·해시 대조한 뒤 선택 환경의 카탈로그를 전체 교체한다. 서로 다른 카탈로그를 이유로 중단하거나 앨범 ID별 증분 병합하지 않는다. 미리보기 후 다른 작업이 카탈로그를 바꾼 경우에는 Storage generation 조건이 덮어쓰기를 거부한다.

같은 해시 파일은 재전송하지 않을 수 있으나 이는 파일 전송 재사용이며 앨범 증분 이관이 아니다. 새 카탈로그에서 빠진 이전 파일은 물리 삭제하지 않는다. 글당 이미지 40개 제한으로 앨범을 나누지 않는다.

## 영수증·로컬 기록

적용 영수증은 payload 폴더의 application-<environment>-<실행별 식별자>.json에 새로 저장한다. 기존 파일은 덮어쓰지 않는다. source ID·대상 ID·환경·입력 해시·검증 결과를 남긴다. 백업→개발 적용용 record-cafe-application.py / record-heritage-application.py에는 영수증 파일 경로를 명시한다. 운영 이전은 별도의 스냅샷·이전 영수증으로 원천/개발/운영 게시글 ID와 앨범 ID를 추적하며 백업 적용 영수증으로 기록하지 않는다. 검증한 결과만 로컬 SQLite의 해당 환경 최신 대응표에 기록하고 다른 환경·플랫폼은 변경하지 않는다. 기존 실행 영수증은 보존한다. 원본 백업·SQLite를 Replit에 올리지 않는다.

HWPX는 내용·외부 PCX 이미지 대조를 수행하지 않는다. 기존 업로드 확장자·용량·압축 구조 보안 검사는 유지한다.

## 개발 완료본 → 운영 이전

promote-community-content.mjs는 백업 posts.json/catalog.json을 입력받지 않는다. `node --import tsx <도구> <workspace> <새 snapshot 디렉터리> <mode> [예상 운영 DB 이름]`으로 사용한다.

| mode | 읽기·쓰기 |
|---|---|
| --export-development | 개발 heliumdb의 import_data가 있는 발행 게시글(가린 글 포함)과 개발 사진첩·연결 파일을 읽어 새 비공개 로컬 묶음 생성. DB/Storage 쓰기 없음 |
| --validate | 내보낸 development-content.json·blobs의 문서/파일/참조/해시만 검증. DB/Storage 연결 없음 |
| --preview-production | 위 검증 후 운영 DB 이름·카테고리·기존 글 수·사진첩 카탈로그 존재 확인. 쓰기 없음 |
| --apply-production | posts가 빈 경우에만 운영으로 전체 이전. 기존 파일은 해시가 같으면 재사용, 카탈로그 전체 교체 |
| --reset-and-apply-production | 명시적으로 선택한 경우 posts 전체·종속 댓글 리셋과 삽입을 한 DB 트랜잭션에서 수행한 뒤 카탈로그 교체 |

내보내기 중 개발 콘텐츠 편집을 중지한다. 게시글은 REPEATABLE READ 읽기 전용 스냅샷으로 확보하고 사진첩은 복사 전후 카탈로그 해시를 대조한다. 회원 계정·명부·회비·세션·일반 테스트 글·초안·댓글은 묶음에서 제외하며 제외 게시글 수를 보고한다. 이관 글에 회원 계정 연결이 있으면 임의 ID 매핑 없이 중단한다. 카테고리는 운영의 기존 이름으로 대응하며 누락 시 새 분류를 추측 생성하지 않는다.

development-content.json에는 개발 게시글 ID·완료된 문서·작성자 이름·원작성 메타데이터·수정 버전·가림 상태·시각과 사진첩 카탈로그, 파일의 논리 경로·이름·MIME·크기·해시를 담는다. 파일은 blobs/<SHA-256>으로 보관한다. 파일·본문에 개인정보가 있을 수 있으므로 Git·공개 저장·채팅 로그에 넣지 않는다. 쿠키·토큰·DB URL·버킷 Secret은 포함하지 않는다.

운영은 개발 글 ID와 앱 내부 첨부 경로·앨범 ID를 유지한다. 생성 시각·원작성 시각을 UTC로 유지하고 ID 시퀀스를 다음 삽입에 맞춘다. 첨부는 운영 uploads, 사진은 운영 heritage/production/photos에 저장하며 카탈로그의 논리 참조는 유지한다. 새 DB 연결에서 원본 묶음과 전체 글·카테고리·본문·메타데이터를 대조하고 운영 파일 및 카탈로그 해시를 확인한다. 이전 영수증은 스냅샷 해시와 결과를 연결한 새 파일로 보존한다.

파일 복사·DB 커밋·카탈로그 교체는 하나의 원자적 트랜잭션이 아니다. 실패 시 단계와 filesVerified/databaseCommitted/catalogPublished를 구분해 보고하며 자동 삭제·커밋 후 원복은 하지 않는다. 현재 실패 범위를 확인하고 별도 실행 지시로 처리한다. Storage의 기존 파일을 물리 삭제하지 않는다.

공개 역사관 JSON·공개 문서·임원 사진은 기존 Git 코드 릴리스 대상이다. 운영 개시 전 개발 완료본과 같은 코드 후보를 릴리스하고, 데이터 이전과 코드 배포 결과는 따로 확인한다. 도구 작성·정적 검사만으로 내보내기·이전·운영 릴리스를 시작하지 않는다.
