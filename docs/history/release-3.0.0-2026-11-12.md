# 3.0.0 릴리스 기록

- 목표: 누적된 게시글 편집기·업로드·댓글 확장을 운영에 반영한다.
- 범위: 프로젝트 미커밋분 전체, 버전·변경 기록, Git 통합·Replit 배포·태그·세 환경 main 일치와 브랜치 정리.
- 완료 조건: 선택한 후보 검사, 운영 댓글 구조 전환의 별도 승인·보존 확인, 새 배포·비로그인 smoke, Git 마무리.
- 제외: 실계정 QA, 실제 외부 provider 호출, 파일 물리 삭제, 기존 worktree·stash·보존 태그 삭제.
- 검증: 공통 필수 정적 검사·빌드와 영향받은 기존 계약·facade·권한 HTTP·개인정보 로그 검사. 기존 메모리 대역만 사용하며 시험 DB나 새 합성 자료를 만들지 않는다.

## 기준과 변경 범위

마지막 운영 후보는 `v2.0.3`의 `7062b7c9df5f498ce0b9c775212141aac06425db`, tree는 `0382361e80f257cc76a8391a0f1ba0abe69c6720`이다. 시작 시 로컬·GitHub·Replit main은 `b4d55da121f579beba2cb2990e13b525732d3958`이고 두 작업 사본의 프로젝트 변경 68개와 전체 573개 파일 해시가 일치했다. 열린 PR과 main 외 브랜치는 없었다. 기존 Replit stash 13개·detached `unified-posts-check` worktree는 보존한다.

댓글 삭제 요청의 revision 필수화와 관리자 타인 댓글 삭제 제거는 기존 API·권한 계약을 바꾸므로 `3.0.0`을 선택한다. Tiptap Image/FileHandler·TableKit·Placeholder·TaskList/TaskItem·CharacterCount·Youtube·Drag Handle, 일반 파일 8종과 댓글 수정·가리기·단일 첨부·URL 자동 링크를 함께 포함한다. 댓글 정책과 첨부 한도는 [제품 기준](../product/planning-proposal.md), 공식 확장·저장·변환 경계는 [편집기 기준](../reference/post-editor.md)을 따른다.

## 사용처·검사 정리와 보존

- 이전 댓글 CRUD와 관리자 삭제 분기를 전용 댓글 라우트·저장소·컴포넌트로 대체했다. content 라우트 등록·DatabaseStorage의 실제 prototype 조합·UI 호출을 확인한다. 중복 이전 구현과 예전 이미지 전용 상수·업로드 흐름은 제거했다.
- 기존 `image_urls` 별도 첨부, Tiptap JSONB 본문·경조사 event_data, 기존 한도 초과 자료의 유지·감소 경로, 작성자·회원·가림 접근을 보존한다. App Storage 파일을 물리 삭제하지 않는다.
- Drag Handle의 공식 peer 의존성은 런타임 import를 위해 유지하며 공동 편집 기능은 등록하지 않는다. 공통 FileHandler·upload 계약·CSS를 재사용하고 공식 패키지 소스는 수정하지 않는다.
- 관련 기준 문서·개발 기록의 링크와 현재/이력 구분을 확인한다. 개발 당시의 운영 미적용 기록은 보존하고 이번 운영 결과를 별도로 연결한다.
- 선택한 기존 검사는 계약 입력·저장소 조합·HTTP 접근·로그 노출이라는 서로 다른 위험을 보호한다. 로그가 content/routes에서 분리된 comment-routes로 이동했으므로 개인정보 로그 검사의 기존 보호 목록에 새 소유 경로를 추가한다. 이번 범위에서 폐기 기능만 검사하거나 같은 조건을 중복 검사하는 항목은 발견하지 못해 검사 삭제·기준 완화·CI 개편은 하지 않는다.

## 검사 선택

| 검사 | 선택 이유·명령·환경·부수 효과 |
|---|---|
| 문서·공백·사용처 | 로컬/Replit 변경 전후·참조와 `git diff --check`. 파일 읽기 |
| lint·서식 | Replit 변경 JS/TS/TSX에 ESLint, 해당 코드·CSS에 Prettier `--check`. 파일 읽기 |
| 앱 타입·경계 | 최종 패키지·소스에서 Replit `npm run check`. 앱/DB 실행 없음; 포함된 경계 검사를 중복 실행하지 않음 |
| 테스트 타입 | 공유 계약·facade 테스트 변경이 있으므로 `npm run check:tests`. 실행형 테스트가 아님 |
| 공유 계약·facade·권한·로그 | `node --import tsx --test shared/contracts/parity.test.ts server/tests/module-composition.test.ts server/tests/route-security.test.ts server/tests/privacy-logging.test.ts`. Replit의 기존 fixture·loopback HTTP/메모리 대역·AST 읽기; 실제 DB/provider 호출 없음 |
| 빌드 | Replit `npm run build`. 기존 dist 보존 후 최종 후보 번들 생성; 서버 시작 없음 |
| 운영 smoke | 새 배포 후 현재 PUBLIC_PAGES·사이트맵·회원 API 401·후보 자산 해시. 비로그인 GET·접근 로그 발생 |

공통 회원·명부·회비·수집 알고리즘은 변경하지 않아 전체 회귀·DB 시험·브라우저 복구 검사를 추가하지 않는다. 기존 선택 테스트는 새 댓글 편집·첨부·가리기 전체 동작, 이미지 붙여넣기·표·체크리스트·영상·블록 드래그의 실제 브라우저 동작을 확인하지 않는다. 해당 경로와 실계정 QA는 미검증으로 구분한다. 이전 개발 검사와 달리 이 기록의 실제 수행 결과만 이번 릴리스 검사로 보고한다.

## 운영 DB 준비

후속 사용자 결정: 기존 본문·댓글 보존은 필수가 아니며 필요하면 posts와 종속 comments 데이터를 초기화할 수 있다. 현재 컬럼 추가에는 초기화가 필요 없어 원래 additive SQL을 유지한다. 실제 삭제를 수행한 것으로 기록하지 않는다.

개발 DB에는 댓글 네 컬럼·두 CHECK가 적용됐으며 운영은 미적용이다. 운영 전용 SQL은 `neondb`만 허용하며 기존 댓글의 id·post_id·author_id·content·created_at과 시퀀스를 보존한다. 읽기 전용 preview·비공개 보존본·승인·트랜잭션 적용·새 연결 검증 순서를 따른다.

2026-11-12 03:34 KST `neondb` PostgreSQL 16.15를 읽기 전용으로 조회했다. 기존 댓글 1건, 다섯 컬럼과 PK·FK 두 개, 시퀀스 상태를 확인했다. 전체 catalog는 기존 운영 관찰과 같은 SHA-256 `27588cbda434da037691dbf79f754ed8956b5b01fdc082a83227f3479eed8262`다. 원본 스키마·댓글·시퀀스 백업은 Replit의 `/home/runner/workspace/.superpowers/release-3.0.0-20261112/production-backup-final`에 디렉터리 0700·파일 0600으로 보관하며 Mac·Git에 복제하지 않았다. 원문 대신 건수·digest·백업 해시만 로컬 근거에 남겼다.

운영 SQL의 SHA-256은 `f4f4a5dc78bb8929cb23e4a3f42ea5b2a2dcc27e25a77e1fb30ce51012d01b42`다. 컬럼 네 개·CHECK 두 개 추가와 기존 1건 보존의 구체적인 범위로 별도 승인을 요청했고, 2026-11-12 사용자가 운영 DB 전환을 명시적으로 승인했다. 실행 직전 preview·보존본·후보 소스 일치를 재확인하고 같은 트랜잭션에서 기존 값·새 기본값을 대조한다. 최초 사전조회는 libpq의 연결 환경 구성 문제로 접속 전에 실패했으며, 자식 프로세스에 파싱한 PG 설정을 전달한 뒤 성공했다. 실패 때 DB 변경은 없었다.

## 실행 결과

### 운영 DB 적용

2026-11-12 03:47:23 KST 사용자 승인 범위의 네 컬럼·두 CHECK를 `neondb`에 한 트랜잭션으로 추가했다. 실행 직전 댓글 테이블을 잠그고 현재 구조·값을 확인했으며 적용 후 새 READ ONLY 연결에서 아홉 컬럼·두 새 CHECK·기존 댓글과 시퀀스를 다시 확인했다. 댓글은 1건 → 1건이며 기존 다섯 필드의 digest와 시퀀스가 같았다. 새 필드의 기본값도 확인했다. 사용자에게 초기화 허용을 받았지만 초기화는 수행하지 않았다.

03:47:54 KST metadata-only catalog: public 테이블 13개·컬럼 107개, PK 13·FK 8·UNIQUE 6·CHECK 9, 인덱스 24·시퀀스 9다. SHA-256은 `6db840de3331eedf55a53d6d6f02e15594a3dc51c7173508a00e7825a093a582`이다. 변경 전후 catalog 차이는 댓글 컬럼 네 개·검증된 CHECK 두 개의 추가뿐이며 제거 객체·RLS 변경은 없다. 실행·새 연결 결과와 catalog는 Replit 비공개 근거 경로에 보관했다. Secret 값·회원 원문은 출력하거나 Mac으로 복제하지 않았다.

### 후보 검사

2026-11-12 03:33:02~03:33:43 KST Replit에서 최종 버전 `3.0.0` 후보를 검사했다. 575개 파일의 해시를 `candidate-inputs.json`으로 식별하고 검사 전후 일치를 확인했다. 앱 코드 수정 없이 이후 문서와 운영 적용 기록만 보완할 경우 해당 검사 입력·산출물 해시를 대조해 재사용한다.

- 변경 JS/TS/TSX 50개 lint와 코드·CSS 51개 서식: 통과.
- `npm run check`: TypeScript 및 앱 263개 파일의 의존 경계 통과.
- `npm run check:tests`: 통과.
- 공유 계약·저장소 facade·HTTP 접근·개인정보 로그 테스트: 11건 통과, 실패·skip 없음. 소스 경로가 옮겨진 댓글 로그도 보호 목록에 포함했다.
- `npm run build`: 통과. 이전 dist를 Replit 안에 보존하고 후보 정적 자산과 서버 번들의 SHA-256을 기록했다.
- `git diff --check`: 통과.

환경은 Replit Node 20.20.0·npm 10.8.2, TypeScript 5.6.3·ESLint 10.14.0·Prettier 3.9.10·Vite 6.4.3이다. 셸의 C.UTF-8 locale 경고 외 검사·빌드 실패는 없다. 명령·UTC 일시·실행 시간·표준 출력과 파일 해시는 `.superpowers/release-3.0.0-20261112/candidate-results.json`에 남겼다. 기존 개발 결과를 이번 실행으로 바꿔 보고하지 않았다.

로컬 문서 19개의 상대 링크 420개·앵커 131개를 확인했다. 신규 문서까지 stage한 공백 검사에서 일반 파일 개발 기록의 끝 빈 줄 한 개를 발견해 제거하고 재검사했다. 코드·의존성과 검사 결과는 바뀌지 않았다. 근거 파일은 `.superpowers/release-3.0.0-20261112/`에 보관한다.

## Git 통합과 개발 반영

- 전체 변경 71개를 `049c281cad48ae5ab887ccc0d0f26b85baceb710`로 커밋·push하고 [PR #36](https://github.com/Raphael-KR/dgkmaWeb/pull/36)을 main `86ebf6a3c55b1384792b1c1ef520b3e20ef68ac0`에 병합했다. GitHub 상태·Check Runs·Actions 검사는 없었다. 자동 코드 리뷰는 같은 후보에서 03:39 KST 지적 없이 완료됐다.
- 03:39 KST Replit을 GitHub main으로 fast-forward했다. 기존 직접 반영본을 stash `fcf37eb0e6531c0f5c1fd8044a6e4e7c1bd25f1d`에 보존하고 소스 575개·정적 산출물 90개의 해시 일치를 확인했다. 기존 stash 13개와 detached worktree를 보존했다.
- 병합 후보 tree는 `1be421e21ad4d95c209395c29fdae56790c68ad5`다. 검사 이후 달라진 파일은 Markdown뿐이며 앱·의존성과 빌드는 동일하다. 문서 후속 기록만으로 다시 빌드하지 않는다.

운영 DB 전환 승인을 받아 기존 릴리스 작업을 계속한다. Republish·운영 smoke·`v3.0.0` 태그는 아직 실행하지 않았고 현재 운영은 `2.0.3`이다. 준비 문서·main 병합을 운영 배포 성공으로 간주하지 않는다.
