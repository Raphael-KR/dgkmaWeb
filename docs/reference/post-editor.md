# 게시글 본문 편집기와 업데이트 기준

제품 정책은 [본문 서식](../product/planning-proposal.md#게시글-본문-서식-2026-11-09), 저장 계약은 [DB 기준](database-schema.md#게시글과-경조사-json-계약)을 따른다. 이 문서는 버전·공식 구현 재사용·사용자 정의·손실 보존 규칙과 서비스 코드의 소유 위치를 관리한다.

## 서비스 코드 소유 위치

기존 편집기 책임 분리는 PR #29로 main에 통합했다. 당시 검사 결과는 [책임 분리 기록](../history/content-responsibility-cleanup-2026-11-10.md)을 따른다. 이후 추가한 파일 이벤트·공통 업로드 연결은 [본문 이미지 개발 기록](../history/inline-images-2026-11-11.md), 환경별 적용 상태는 [Replit 기준](../../replit.md#현재-적용-상태)에서 구분한다.

| 책임 | 위치 |
|---|---|
| 공개 props·ref, 입력 화면·지연 로딩 | [post-body-editor.tsx](../../client/src/components/post-body-editor.tsx), [lazy-post-body-editor.tsx](../../client/src/components/lazy-post-body-editor.tsx) |
| 공식 확장·JSON 스키마·Markdown 변환 | [post-document.ts](../../shared/editor/post-document.ts), [JSON 계약](../../shared/contracts/post-document.ts) |
| 표 셀 속성·격자 제한과 공식 TableMap 검사 | [post-table.ts](../../shared/editor/post-table.ts) |
| YouTube 주소·속성 검증과 공식 확장 설정 | [post-youtube.ts](../../shared/editor/post-youtube.ts) |
| YouTube 영상 입력·공식 명령 연결 | [editor-youtube.tsx](../../client/src/components/post-editor/editor-youtube.tsx) |
| Tiptap 초기화·붙여넣기·부모 통지 | [use-document-editor.ts](../../client/src/components/post-editor/use-document-editor.ts) |
| 일반 파일 선택 버튼 | [editor-file-upload.tsx](../../client/src/components/post-editor/editor-file-upload.tsx) |
| 공식 파일 이벤트·공통 파일 삽입·HTML 이미지 경로 제한 | [editor-files.ts](../../client/src/components/post-editor/editor-files.ts) |
| 파일 확장자·MIME·거부 메시지 | [uploads.ts](../../shared/contracts/uploads.ts) |
| 본문·첨부 공통 업로드 묶음과 파일 제한 | [use-post-uploads.ts](../../client/src/features/boards/use-post-uploads.ts), [use-upload.ts](../../client/src/hooks/use-upload.ts) |
| Markdown 투영·손실 안내 상태·원본 복원 | [use-markdown-mode.ts](../../client/src/components/post-editor/use-markdown-mode.ts) |
| 선택 도구·링크 입력·클립보드 | [editor-toolbar.tsx](../../client/src/components/post-editor/editor-toolbar.tsx), [use-editor-link.ts](../../client/src/components/post-editor/use-editor-link.ts), [editor-clipboard.ts](../../client/src/components/post-editor/editor-clipboard.ts) |
| 공통 도구 버튼·공식 표 명령 연결 | [editor-tool.tsx](../../client/src/components/post-editor/editor-tool.tsx), [editor-table-tools.tsx](../../client/src/components/post-editor/editor-table-tools.tsx) |
| 공식 블록 이동 핸들 | [editor-drag-handle.tsx](../../client/src/components/post-editor/editor-drag-handle.tsx) |
| 편집·표시 공통 서식과 입력 높이 | [post-content.css](../../client/src/components/post-content.css) |

저장·회원 권한·이미지 업로드는 feature와 해당 공통 요청 훅이 담당한다. 편집기 핵심에는 API 호출·회원 판정을 넣지 않는다. 서비스 내부 분리가 공식 패키지·단축키·JSON 계약 변경을 뜻하지 않는다.

## 공식 구현과 호환성

- Tiptap core/react/pm/starter-kit/markdown/bubble-menu/static-renderer와 무료 공식 `@tiptap/extension-image`·`@tiptap/extension-file-handler`·`@tiptap/extension-table`·`@tiptap/extensions`·`@tiptap/extension-list`·`@tiptap/extension-youtube`·`@tiptap/extension-drag-handle`·`@tiptap/extension-drag-handle-react`를 `3.33.0`으로 맞춘다. [StarterKit](https://tiptap.dev/docs/editor/extensions/functionality/starterkit), [MarkdownManager](https://tiptap.dev/docs/editor/markdown/api/markdown-manager), [Static Renderer](https://tiptap.dev/docs/editor/api/utilities/static-renderer), [Image](https://tiptap.dev/docs/editor/extensions/nodes/image), [FileHandler](https://tiptap.dev/docs/editor/extensions/functionality/filehandler), [TableKit](https://tiptap.dev/docs/editor/extensions/functionality/table-kit)의 공개 API를 재사용한다. 공식 패키지와 단축키는 수정하지 않는다.
- 서비스 정의는 H1~H4 범위·기존 안전 링크 설정·JSON 입력 제한·일반 텍스트 추출, HTML 소스/Markdown 붙여넣기 연결, 선택 도구 UI와 Markdown 손실 안내다. 본문 이미지는 공식 Image 노드로 표시하고 FileHandler가 붙여넣기·드롭 이벤트를 전달한다. 편집기는 주입된 업로드 콜백으로 받은 경로를 삽입하며 업로드 API와 회원 판정을 직접 호출하지 않는다. StarterKit 기본 기능·단축키를 유지하고 별도 키 조합·사용자 정의 노드/마크는 추가하지 않는다.
- `StarterKit.configure({ trailingNode: false })`로 자동 끝 문단 삽입만 끈다. 공식 기본 플러그인은 본문을 바꾸지 않는 포커스 전환 트랜잭션에서도 끝 문단을 추가할 수 있어, JSON을 열거나 Markdown 보기로 전환하는 동작의 원본 보존 계약과 맞지 않는다. 공식 설정을 사용하며 기본 명령·단축키는 유지한다. 업데이트 시에도 비편집 동작의 문서 변경 여부를 확인한다.
- 업데이트 시 패키지 버전을 함께 맞추고 JSON 노드/마크·기본 속성, `getSchema`·`nodeFromJSON/check`·Markdown parse/serialize·React 정적 표시, 기본 단축키·선택 도구 포커스, HTML 스키마 처리·링크/이미지 경로 제한과 Markdown 왕복 손실 판정을 확인한다. Image 속성·기본 블록 동작, FileHandler 콜백·HTML 동반 붙여넣기·중복 삽입 방지, 업로드 중 입력 잠금·완료 후 위치도 호환성 대상이다. Markdown 기능은 공식 Beta 계약이므로 미지원 문서를 조용히 축소하지 않는다.
- Markdown 보기·복사는 JSON을 보존한다. 왕복이 같은 문서일 때만 바로 수정할 수 있고, 다르면 읽기 전용 변환본과 손실 안내를 제공한다. `변환본으로 편집`을 선택해도 실제 입력 변경 전까지 원본을 유지한다. 새 Markdown 입력에서 실패하면 마지막 유효 JSON을 보존하고 게시를 막아 수정 내용을 모르게 잃지 않게 한다.
- 공식 Markdown 표·체크리스트를 허용한다. 지원 밖 임의 HTML 구문은 조용히 삭제하지 않고 입력 오류로 알린다. 공식 Markdown 이미지 구문은 `/objects/` 경로에 한해 허용한다. 밑줄은 공식 Underline 토크나이저와 `<u>` 직렬화를 사용한다. HTML 이미지도 같은 경로 제한을 적용하며 외부·data/blob 이미지를 임의로 로드/저장하지 않는다. 빈 문단·목록/이미지 속성·병합 셀·열 너비·복합 셀 내용·YouTube 임베드처럼 Markdown 왕복으로 달라지는 구조는 위 손실 판정 대상이며 복사 시에도 손실을 알린다.

## 블록 이동

공식 무료 [Drag Handle React](https://tiptap.dev/docs/editor/extensions/functionality/drag-handle-react)의 공개 컴포넌트를 사용한다. 기존 Tiptap과 같은 3.33.0의 drag-handle-react·drag-handle·필요한 공식 peer를 설치하며 공동 편집 확장·서비스는 활성화하지 않는다. 필수 peer로 node-range/collaboration 3.33.0, y-tiptap 3.3.0, yjs 13.6.33, y-protocols 1.0.7이 설치됐으며 모두 MIT다. 이 peer들은 공식 드래그 구현의 의존성이며 에디터에 협업 확장을 등록하거나 네트워크 동기화를 연결하지 않는다. 최상위 블록 위의 핸들, 위치 계산·드래그·플러그인 수명은 공식 구현에 맡기고 서비스 코드는 아이콘·공통 CSS·편집 가능 여부만 연결한다. 읽기 전용·Markdown·업로드 중에는 핸들을 제거한다. 텍스트 선택 시의 서식 도구 정책과 구분하며 별도 단축키·노드 속성을 추가하지 않는다.

업데이트 시 동일 버전·peer 의존성, 마운트/해제, 이미지·표·목록의 최상위 블록 이동, FileHandler의 외부 파일 드롭과 내부 블록 이동 구분, 컨테이너 안의 핸들 위치를 확인한다. 실제 적용과 미검증 범위는 [개발 기록](../history/comments-drag-handle-2026-11-12.md)을 따른다.

## 안내·체크리스트·글자 수·YouTube

- [Placeholder](https://tiptap.dev/docs/editor/extensions/functionality/placeholder)는 `@tiptap/extensions`의 공식 decoration과 공통 CSS로 빈 본문 안내를 표시한다. 별도 겹침 안내 요소를 제거한다.
- [TaskList](https://tiptap.dev/docs/editor/extensions/nodes/task-list)·[TaskItem](https://tiptap.dev/docs/editor/extensions/nodes/task-item)은 이미 설치된 `@tiptap/extension-list`를 직접 의존성으로 선언해 사용한다. StarterKit의 기존 목록을 중복 등록하지 않고 두 노드만 추가한다. 중첩 체크리스트와 checked boolean을 공통 JSON 스키마에서 검증하며 공식 HTML/Markdown 변환을 재사용한다. 상세·미리보기의 체크박스는 읽기 전용으로 표시한다.
- [CharacterCount](https://tiptap.dev/docs/editor/extensions/functionality/character-count)는 편집기에서 `limit: null`·`autoTrim: false`로 현재 본문 기준을 보존한다. 기본 텍스트 집계(UTF-16 길이)를 사용하며 Markdown 입력 오류 때는 마지막 유효 본문 기준임을 알린다. 본문 JSON 전체 250,000자·10,000 노드·깊이 64와 API 요청 크기 제한은 별개다. 일반 JSON 요청은 현재 Express 기본 100KB(102,400바이트)여서 본문 250,000자 입력을 보장하지 않는다. 댓글은 Tiptap을 추가하지 않고 기존 textarea의 1,000자 제한과 문자열 길이를 표시한다.
- [Youtube](https://tiptap.dev/docs/editor/extensions/nodes/youtube)는 공식 노드·삽입 명령·렌더러를 사용한다. 정확한 YouTube 호스트·영상 주소와 노드 속성을 확인하고, 개인정보 보호 강화 모드·자동 재생 끄기를 적용한다. HTML 입력·직접 JSON 저장에도 주소 검사를 적용하며 다른 iframe은 허용하지 않는다. 필요한 URI 검증은 공개 확장 API로 한정하고 패키지 소스는 수정하지 않는다.
- 영상 입력 버튼과 주소만 붙여넣기는 같은 주소 검증 후 공식 `setYoutubeVideo`를 호출한다. 기존 HTML/Markdown 붙여넣기 처리와 중복되지 않게 공식 `addPasteHandler`는 끈다. 공식 렌더러는 입력 `/embed/` 주소를 그대로 사용할 수 있으므로 `extend`의 parse/render 경계에서 단일 영상 ID를 확인하고 watch 주소로 정규화해 nocookie·autoplay 설정을 적용한다. 재생목록만 있는 주소는 지원하지 않으며 표시 크기·시작 초는 유효한 정수로 저장한다. `start`를 제외한 주소의 추가 재생/추적 쿼리는 보존하지 않는다.
- YouTube Markdown은 공식 `:::youtube {속성} :::` 원자 블록을 그대로 사용한다. 공식 파서의 숫자 문자열은 저장 검증에서 정수로 정규화한다. 체크리스트는 `- [ ]`·`- [x]`를 사용한다. 별도 Markdown 직렬화 구현을 두지 않으며, 왕복이 달라지는 문서는 기존 손실 안내를 적용한다.
- 업데이트 때 Placeholder CSS, 체크리스트의 입력 규칙·체크 상태·중첩·HTML/Markdown 왕복, CharacterCount의 집계/자동 절삭 설정, Youtube의 URL 변환·iframe 속성·Markdown 손실 판정과 반응형 표시를 확인한다. 설치·개발 반영과 미검증 범위는 [추가 확장 기록](../history/editor-extensions-2026-11-12.md)을 따른다.

TableKit의 table·tableRow·tableCell·tableHeader를 편집·저장·표시·변환에 함께 사용한다. 표 명령과 Tab 등 키 처리는 공식 구현을 사용한다. 선택 도구는 텍스트 선택과 공식 셀 선택을 지원하고 빈 커서만으로 표시하지 않는다. 표 삽입은 선택한 텍스트를 보존해 그 뒤에 기본 표를 넣는다. 공식 `renderWrapper`로 가로 스크롤 영역을 만들고 크기 조절 핸들은 기본 비활성을 유지한다. 저장 검사는 공식 셀 속성과 표 격자를 기존 문서 복잡도 제한 안에서 확인하며 알 수 없는 속성을 허용하지 않는다. 공식 표 Markdown의 셀 줄바꿈에 쓰이는 `<br>`만 HTML 토큰 예외로 허용한다. 업데이트 시 표 노드/속성, 병합·분리·셀 선택·키 처리, 공식 Markdown 변환과 손실 판정을 함께 확인한다. 실행 상태는 [TableKit 개발 기록](../history/table-kit-2026-11-12.md)을 따른다.

본문 이미지는 JSONB에 경로와 순서를 저장하고 파일은 기존 Object Storage에 둔다. 기존 별도 첨부는 옮기거나 중복 저장하지 않는다. 서버는 본문·첨부 양쪽의 개수·경로·열람 권한을 확인한다. 2026-11-11 개발 반영·정적 검사와 미확인 범위는 [수행 기록](../history/inline-images-2026-11-11.md)을 따른다.

FileHandler의 `consumePasteEvent`로 같은 붙여넣기의 중복 삽입을 막는다. `allowedMimeTypes`로 파일을 먼저 걸러내지 않고 `onPaste`·`onDrop`에서 공통 업로드 검증을 호출해 거부 메시지를 표시한다. 파일과 HTML이 함께 있으면 HTML의 텍스트 서식을 유지하고 실제 업로드에 성공한 이미지·파일 링크를 그 뒤에 입력 순서대로 추가한다. 파일이 모두 거부돼도 함께 붙인 텍스트는 보존한다. 파일 없는 HTML·일반 텍스트 붙여넣기는 기존 처리를 유지한다. 외부 웹페이지 이미지의 원래 배치·주소 가져오기는 지원 범위가 아니다. 파일 없는 HTML에서 지원하지 않는 이미지 주소는 제거 사실을 알리고 텍스트 서식은 처리한다. 공식 Image의 크기 조절 핸들은 켜지 않으며 반응형 표시는 공통 CSS로 처리한다.

## 일반 파일 첨부

2026-11-12 확정한 일반 파일 8종과 공통 크기·개수 기준은 [제품 정책](../product/planning-proposal.md#게시글-본문-서식-2026-11-09)을 따른다. 무료 StarterKit Link의 공개 API로 파일명·크기가 있는 링크 문단을 넣는다. 파일 데이터·Base64·토큰은 JSON에 넣지 않는다. 추가 사용자 정의 노드 없이 기존 HTML/Markdown 변환·요약·검색을 사용한다. 다운로드 링크 스타일은 편집기·상세 공통 CSS로 관리한다.

일반 파일은 파일당 10MB·게시글당 5개, 이미지는 파일당 5MB이며 전체 합계 40개를 유지한다. 업로드 요청·토큰 검증·실제 본문 수신에 형식별 크기 한도를 적용한다. 파일 선택·붙여넣기·드롭은 기존 본문의 일반 파일 개수와 이번 묶음의 성공 개수를 합산한다. 게시글 생성/수정의 공통 검증도 일반 파일 링크 5개를 확인해 HTML/Markdown 입력과 직접 API 저장에 적용한다. 한도를 넘는 기존 글은 해당 파일을 유지·줄이는 편집을 허용한다. 일반 파일 링크의 분할·중복은 한 경로로 계산한다.

일반 파일 버튼은 서식 모드에만 활성화하며 미완성 Markdown 입력을 덮어쓰지 않는다. 버튼·FileHandler는 같은 삽입 함수를 사용하며 서비스 업로드는 feature의 공통 훅에 위임한다. 편집기에는 이미지·일반 파일이 섞인 결과를 받는 콜백 하나만 주입한다. 업로드 중 잠금과 부분 성공 보존을 공유하고 성공한 파일만 합계 한도를 차지한다. 파일명·크기는 편집 가능한 본문 표시 문구이며 다운로드 파일명과 실제 크기의 기준은 App Storage 메타데이터다.

확장자 허용 목록·구형 형식 대응·오류 문구는 공통 계약 한 곳에서 관리한다. 브라우저 MIME은 확장자 없는 클립보드 이미지의 호환성 확인에만 사용하며 일반 문서의 허용 여부를 대신하지 않는다. 서버는 같은 확장자 판정을 다시 수행한 뒤 크기·실제 내용을 확인한다. 업데이트 시 FileHandler의 파일 전달·이벤트 소비와 파일/HTML 혼합 입력, 거부 안내, 공통 업로드 잠금·삽입 순서를 확인한다.

서버는 일반 파일을 `application/octet-stream`, `Content-Disposition: attachment`, `nosniff`, `private, no-store`로 응답한다. 기존 회원 및 가림 상태 확인에 본문의 표준 링크 참조도 포함한다. 업데이트 시 공식 Link 삽입·복사·변환과 텍스트 분할 시 개수 계산을 확인한다. 개발 반영·정적 검사와 미확인 실행 범위는 [일반 파일 개발 기록](../history/general-files-2026-11-12.md)에 남긴다.

파일 형식 확인에는 무료 `file-type@20.5.0`과 `yauzl@3.4.0`을 사용한다. ZIP은 파일을 추출하지 않고 중앙 디렉터리와 종류 확인용 메타데이터만 읽는다. 항목 10,000개·메타데이터 항목당 1MB로 범위를 제한한다. 암호화 ZIP·중복 항목·Office 매크로는 지원하지 않는다. 패키지 업데이트 시 Node 20 호환성·버퍼/스트림 API·ZIP 크기 검사·허용 시그니처를 확인한다.

Office/HWPX의 ZIP 시작 헤더는 `50 4B 03 04`, OLE/CFB는 `D0 CF 11 E0 A1 B1 1A E1` 전체를 확인한다. ZIP 시그니처만 통과해도 필수 본문·content types·HWPX mimetype 등의 기존 구조 검사를 계속한다. OLE/CFB는 최신 Office 암호화 파일일 수도 있어 지원하지 않는 형식/암호화 가능성을 안내하고, ZIP 암호화가 확인되면 암호화 파일 거부를 별도로 안내한다. 확장자만 바꾼 파일을 허용하지 않는다.
