# 댓글 확장·본문 Drag Handle 개발 기록

- 목표: 승인된 댓글 관리·첨부·자동 링크와 공식 본문 블록 이동을 구현한다.
- 범위: 공유 계약, 댓글 API·저장·화면, 첨부 접근 검사, 공식 Drag Handle 및 개발 DB의 additive 변경.
- 완료 조건: 기존 자료 보존, Replit 개발 코드·의존성·DB 반영과 필요한 정적 검사 결과 기록.
- 제외: 운영 DB·배포·서버 재시작·브라우저/실계정 QA, 파일 물리 삭제, 댓글 리치 텍스트.
- 검증: 변경 코드 lint·서식·앱 타입, 영향받는 테스트 타입, CSS 처리와 문서 연결. DB 백업·적용·사후 catalog는 별도의 승인된 DB 작업이다.

## 결정과 구현

기준은 [제품 정책](../product/planning-proposal.md#댓글-수정가리기첨부-2026-11-12), [DB 계약](../reference/database-schema.md#table_row-comments), [DB 런북](../runbooks/database-operations.md#개발-변경), [편집기 기준](../reference/post-editor.md)이다. 작업 시작 Git main은 `b4d55da121f579beba2cb2990e13b525732d3958`이며 기존 편집기·첨부 미커밋분을 보존한다.

기존 댓글 라우트와 저장 메서드를 `server/modules/content/comment-*`로 분리해 facade에 연결했다. 본인 수정·삭제, 관리자 가리기·복원은 서버에서 판정하고 부모 게시글을 잠근 뒤 댓글 revision을 확인한다. 수정 시각만 별도로 갱신해 작성 순서와 가림 상태를 유지한다.

입력·응답은 `shared/contracts/comments.ts`에 두며 댓글 일반 텍스트·1,000자와 첨부 한 개를 검증한다. 화면은 작성/수정 폼·댓글 항목·첨부·자동 링크를 분리했다. 저장 실패 시 입력·기존 첨부를 보존하고, 가린 댓글은 서버 응답부터 원문·첨부를 지운다. 첨부 경로를 직접 요청할 때도 부모 게시글·댓글 권한을 확인하며 숨겨진 참조를 고아 파일로 취급하지 않는다.

첨부는 기존 `useUpload`·공통 확장자/크기·서버 파일 내용 검증·App Storage 다운로드를 재사용한다. 이미지 5MB 또는 일반 파일 10MB 중 하나이며 댓글 API에는 경로만 받는다. 서버가 저장소의 원래 이름·크기·형식을 확인해 JSONB에 기록한다. 변경하지 않은 첨부 메타데이터는 보존한다. 첨부 제거·댓글 삭제 후 물리 파일 정리는 별도 정책 범위다.

URL 인식은 기존 전이 의존성인 MIT `linkifyjs@4.4.0`을 직접 선언하고 [공식 find API](https://linkify.js.org/docs/linkifyjs.html)와 공통 `safePostLink`를 사용한다. HTTP(S) 링크만 React 요소로 표시하며 원문은 바꾸지 않는다.

공식 [Drag Handle](https://tiptap.dev/docs/editor/extensions/functionality/drag-handle)·[React 컴포넌트](https://tiptap.dev/docs/editor/extensions/functionality/drag-handle-react) 3.33.0을 설치하고 `editor-drag-handle.tsx`에서 재사용했다. 호버 위치·블록 드래그·플러그인 수명은 공식 구현을 사용하고 서비스는 아이콘·CSS·편집 가능 상태만 연결한다. 최상위 블록을 이동하며 서식 도구의 선택 시 표시 규칙은 유지한다. 패키지 소스와 기본 단축키는 수정하지 않았다. 필수 peer인 collaboration/node-range와 Yjs 계열은 설치되지만 협업 확장 등록·동기화 서비스는 추가하지 않았다.

## 개발 DB 적용

2026-11-12 03:13 KST에 Development `heliumdb` / PostgreSQL 16.10과 기존 댓글 0건·다섯 컬럼·PK/FK를 확인했다. `PG*`를 유지했고 운영 Secret URL은 사용하지 않았다. Replit `/home/runner/workspace/.superpowers/comments-drag-handle-20261112/db-backup`에 schema-only와 comments data-only를 디렉터리 0700·파일 0600으로 보존했다. 원문 백업은 Mac·Git으로 가져오지 않았다.

03:14 KST에 [add-comment-management.sql](../../scripts/add-comment-management.sql)의 트랜잭션으로 네 컬럼·두 CHECK만 적용했다. 새 연결에서 다음을 확인했다.

- 기존 다섯 컬럼의 값 집계·digest 일치, 댓글 0 → 0건. 실제 기존 댓글 내용이 있는 자료의 변환 시험은 하지 않았다.
- `is_hidden=false`, `revision=0`, `edited_at`·`attachment` NULL의 정의와 두 CHECK의 validated 상태.
- 전체 catalog: 13개 테이블·107개 컬럼, PK 13·FK 8·non-PK UNIQUE 6·CHECK 9, 인덱스 24·시퀀스 9. view·trigger·policy·routine·enum·domain·활성 RLS는 0.
- catalog의 target/READ ONLY 안전 조건·완료 marker 확인. SHA-256 `cf46305b8f63b3e72a43d4e8a969bbb5dce7b6e94f353b7dc0e4ab7e3ba2890d`.

기존 본문·경조사·명부·객체 파일은 변환/삭제하지 않았다. 운영 DB에는 네 컬럼·두 CHECK를 적용하지 않았으므로 이 코드를 운영에 릴리스할 때는 별도 운영 전환 승인이 필요하다. DB 관찰은 정적 검사의 결과로 보고하지 않는다.

## 개발 코드·검사

Replit `/home/runner/workspace`, Node v20.20.0에서 2026-11-12 03:14–03:15 KST에 수행했다.

| 검사 | 범위·명령 | 결과 |
|---|---|---|
| lint | 변경 TS/TSX 22개, `./node_modules/.bin/eslint <변경 파일>` | 통과 |
| 서식 | 같은 소스와 CSS 23개, `prettier --check <변경 파일>` | 통과 |
| 앱 타입·모듈 경계 | `npm run check`; 앱 소스 263개 경계 확인 | 통과 |
| 테스트 타입 | `npm run check:tests`; 댓글 계약·facade 연결의 타입 영향 | 통과; 테스트 실행 아님 |
| CSS | 변경 `post-content.css`를 PostCSS·Tailwind·Autoprefixer로 처리 | 통과 |
| diff | `git diff --check` | 통과 |

코드·패키지·lockfile을 개발 사본에 직접 반영했다. 검사한 소스의 SHA-256을 최종 파일과 비교해 결과를 재사용하고 후속 문서만 갱신한다. 세부 증거는 양쪽 `.superpowers/comments-drag-handle-20261112/`의 `install.json`(로컬), `db-preview.json`·`db-apply.json`, `checks-first.json`과 `final-sync.json`에 둔다. DB 원본과 catalog는 Replit에 보존한다.

실행하지 않은 범위는 단위·통합 테스트 실행, 실제 댓글 수정/삭제/가리기/복원과 충돌, 업로드·직접 첨부 접근, URL 클릭, 본문 드래그·터치·레이아웃·저장 왕복이다. 서버 재시작·운영 DB·릴리스·실계정 QA는 수행하지 않았다. Git은 기존 main `b4d55da`의 미커밋 개발 변경 상태이며 commit·push·PR·merge는 하지 않았다.
