# 게시글 원작성일·출처 저장 — 2026-11-14

## 코드와 개발 DB

posts.import_data JSONB NULL에 원본 플랫폼·컨테이너·글 ID·게시판 경로·주소·원작성 시각·날짜 정밀도·이관 시각을 저장하도록 구현했다. 구조 CHECK와 플랫폼/컨테이너/글 ID 부분 UNIQUE 인덱스를 추가했다. 일반 작성·수정 API는 이관 메타데이터를 입력받지 않는다. 목록·검색·상세·가린 글 조회에 메타데이터가 포함되며 상세는 본문 밖에 원문 링크와 게시판을 표시한다. 날짜만 있는 원문은 임의 시각을 표시하지 않는다. 목록 정렬에는 이관 시 원작성 시각을 UTC로 변환해 published_at에 저장하는 계약을 유지한다.

Replit 개발 heliumdb에서 변경 전 대상·기존 컬럼·제약·인덱스를 읽기 전용으로 확인한 뒤 add-post-import-data.sql을 한 트랜잭션으로 적용했다. 새 연결에서 JSONB·NULL 허용, CHECK validated, 부분 UNIQUE 정의를 확인했다. posts는 87→87건, import_data 입력은 0건이다. 별도 백업은 만들지 않았다.

metadata-only catalog의 안전 게이트·완료 marker를 확인했다. Replit `.superpowers/post-import-data-catalog.csv` SHA-256은 `d397b65a46211d05f5f66b14817d4748c4736c7c7e2a51f63a8e3f26d860e2e2`다. public 컬럼 109개, CHECK 10개, 인덱스 25개를 읽기 전용 집계로 확인했다.

## 검사와 경계

2026-11-14 Replit 개발 환경에서 npm run check(앱 타입·의존 경계), npm run check:tests, 변경 9개 코드 파일 ESLint를 통과했다. 변경 파일 서식을 공식 Prettier로 정리했다. 잘못된 URL을 예외 없이 거부하는 마지막 보완은 해당 계약 파일의 lint·서식 검사로 확인했다. 변경 9개 코드 파일 Prettier 검사, 로컬 문서 상대 파일 링크와 git diff --check도 통과했다. 로컬·Replit의 변경 23개 파일 SHA-256 일치를 확인했다.

실행형 테스트·브라우저 확인·서버 재시작·빌드는 수행하지 않았다. 원본 중복·불완전 객체에 대한 실제 INSERT 거부 동작과 이관 글 표시 동작은 미실행이며 제약 정의 확인과 정적 검사로 대체해 성공을 주장하지 않는다. 다음카페·밴드 데이터 이관, users 사전 등록, 운영 DB 변경·배포·실계정 QA·Git 게시도 하지 않았다.
