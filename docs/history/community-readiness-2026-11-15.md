# 다음카페 개발 이관 사전 확인 — 2026-11-15

사용자 요청으로 최종 후보 검증·개발 대상 읽기 전용 확인·개발 서버 재시작까지만 수행했다. 리셋·실제 이관·운영 배포·실계정 QA는 보류했다.

## 최종 후보 검증

최종 게시글·사진첩 tar의 파일 경로와 정규 파일 여부를 로컬 확인한 뒤, 선택된 후보만 Replit 비공개 `.superpowers/community-readiness-20261115/`에 풀었다. 원본 백업·SQLite는 전송하지 않았다. 해당 준비 폴더는 0700, 후보 파일은 비공개 권한으로 관리한다. 기존 자료·과거 영수증은 삭제하지 않았다.

Replit의 최신 apply-post-migration.mjs / apply-heritage-albums.mjs를 --validate development heliumdb로 실행했다. 게시글 80건·첨부 11개, 앨범 52개·사진 항목 406개·고유 파일 403개가 통과했다. 문서·메타데이터·파일 형식/용량/보안·해시·참조 검증이며 DB/Storage 쓰기는 없다. HWPX의 본문·외부 PCX 이미지 의미 대조는 수행하지 않았다.

## 개발 대상 사전 확인

두 도구의 --preview development heliumdb를 실행했다. 게시글 카테고리를 확인했고 대상은 heliumdb, 기존 posts 87건·comments 0건, 기존 개발 카탈로그 있음으로 확인했다. 리셋 요청 플래그는 false였다.

추가 읽기 전용 확인에서 posts.author_name TEXT NULL, import_data JSONB NULL, content JSONB NOT NULL, is_hidden BOOLEAN NOT NULL, revision INTEGER NOT NULL, 본문·출처 CHECK validated, 원본 중복 방지 인덱스를 확인했다. 댓글 FK의 삭제 동작은 CASCADE다. 기존 게시글의 import_data 입력은 0건이다. 전체 catalog 재검증이나 스키마 변경은 수행하지 않았다.

기존 개발 사진첩의 실제 카탈로그를 읽어 앨범 52개·사진 항목 406개·고유 파일 403개를 확인했다. 게시글·사진·카탈로그 업로드나 교체는 하지 않았다. 사전 확인은 읽기 가능 여부이며 실제 쓰기 권한·트랜잭션 성공을 증명하지 않는다.

## 개발 앱 재시작

2026-11-15 02:12:50 KST(2026-11-14 17:12:50 UTC)에 기존 앱 PID 631·671을 SIGTERM으로 종료하고 npm run dev로 재시작했다. 새 npm PID 1993, 앱 PID 2004·2015, 5000 포트 기동을 확인했다. 강제 종료·목업 서비스 재시작은 하지 않았다. PG*와 Secrets는 변경하지 않았다. 기존 시작 절차의 session 테이블·인덱스 확인은 그대로 사용했다.

로컬 개발 HTTP의 /about은 200, 쿠키 없는 /api/posts?limit=1은 401이었다. 회원 화면·페이지 이어보기·실제 게시/첨부·이미지 표시의 실계정 QA는 하지 않았다. 재시작 뒤 새 읽기 전용 DB 연결에서도 posts 87건·comments 0건으로 유지됐다. 재시작 근거와 보호된 시작 로그는 Replit 준비 폴더의 restart-result.json·dev-server.log에 있다.

## 다음 실행과 미검증

최종 사전 검증은 통과했다. 실제 게시글 전체 리셋·80건 삽입·첨부 업로드·사진첩 전체 반영의 쓰기 경로는 아직 실행하지 않았다. 이관 뒤 건수·본문/메타데이터·Storage·새 연결 검증도 미실행이다. 운영 이전·운영 Secret 설정·운영 배포·Git 게시와 별도 users 명부 전환도 하지 않았다.

게시글 tar SHA-256: `d0075c213ba7e0142c440da0512094977f9af5a2452c115efc6bc89000401acb`

사진첩 tar SHA-256: `98ce6d4da16d692d6a3cb3a860b7391f9f3b9b21eb0cd664038a48b8d9a7b9e4`
