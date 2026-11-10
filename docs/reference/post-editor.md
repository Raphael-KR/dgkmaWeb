# 게시글 본문 편집기와 업데이트 기준

제품 정책은 [본문 서식](../product/planning-proposal.md#게시글-본문-서식-2026-11-09), 저장 계약은 [DB 기준](database-schema.md#게시글과-경조사-json-계약)을 따른다. 이 문서는 버전·공식 구현 재사용·사용자 정의·손실 보존 규칙과 서비스 코드의 소유 위치를 관리한다.

## 서비스 코드 소유 위치

아래 내부 분리는 로컬·Replit 개발 사본의 미커밋 변경이다. 적용·검사 결과는 [책임 분리 기록](../history/content-responsibility-cleanup-2026-11-10.md), 커밋·운영 적용은 [Replit 기준](../../replit.md#현재-적용-상태)을 따른다.

| 책임 | 위치 |
|---|---|
| 공개 props·ref, 입력 화면·지연 로딩 | [post-body-editor.tsx](../../client/src/components/post-body-editor.tsx), [lazy-post-body-editor.tsx](../../client/src/components/lazy-post-body-editor.tsx) |
| 공식 확장·JSON 스키마·Markdown 변환 | [post-document.ts](../../shared/editor/post-document.ts), [JSON 계약](../../shared/contracts/post-document.ts) |
| Tiptap 초기화·붙여넣기·부모 통지 | [use-document-editor.ts](../../client/src/components/post-editor/use-document-editor.ts) |
| Markdown 투영·손실 안내 상태·원본 복원 | [use-markdown-mode.ts](../../client/src/components/post-editor/use-markdown-mode.ts) |
| 선택 도구·링크 입력·클립보드 | [editor-toolbar.tsx](../../client/src/components/post-editor/editor-toolbar.tsx), [use-editor-link.ts](../../client/src/components/post-editor/use-editor-link.ts), [editor-clipboard.ts](../../client/src/components/post-editor/editor-clipboard.ts) |
| 편집·표시 공통 서식과 입력 높이 | [post-content.css](../../client/src/components/post-content.css) |

저장·회원 권한·이미지 업로드는 feature와 해당 공통 요청 훅이 담당한다. 편집기 핵심에는 API 호출·회원 판정을 넣지 않는다. 서비스 내부 분리가 공식 패키지·단축키·JSON 계약 변경을 뜻하지 않는다.

## 공식 구현과 호환성

- 기존 Tiptap core/react/pm/starter-kit/markdown/bubble-menu `3.33.0`과 같은 버전의 무료 `@tiptap/static-renderer`를 사용한다. [StarterKit](https://tiptap.dev/docs/editor/extensions/functionality/starterkit), [MarkdownManager](https://tiptap.dev/docs/editor/markdown/api/markdown-manager), [Static Renderer](https://tiptap.dev/docs/editor/api/utilities/static-renderer)의 공개 API를 재사용한다. 공식 패키지와 단축키는 수정하지 않는다.
- 서비스 정의는 H1~H4 범위·기존 안전 링크 설정·JSON 입력 제한·일반 텍스트 추출, HTML 소스/Markdown 붙여넣기 연결, 선택 도구 UI와 Markdown 손실 안내다. StarterKit의 기본 코드·밑줄·인용·구분선·목록·실행 취소/다시 실행을 사용하고 별도 키 조합·사용자 정의 노드/마크는 추가하지 않는다.
- `StarterKit.configure({ trailingNode: false })`로 자동 끝 문단 삽입만 끈다. 공식 기본 플러그인은 본문을 바꾸지 않는 포커스 전환 트랜잭션에서도 끝 문단을 추가할 수 있어, JSON을 열거나 Markdown 보기로 전환하는 동작의 원본 보존 계약과 맞지 않는다. 공식 설정을 사용하며 기본 명령·단축키는 유지한다. 업데이트 시에도 비편집 동작의 문서 변경 여부를 확인한다.
- 업데이트 시 패키지 버전을 함께 맞추고 JSON 노드/마크·기본 속성, `getSchema`·`nodeFromJSON/check`·Markdown parse/serialize·React 정적 표시, 기본 단축키·선택 도구 포커스, HTML 스키마 처리·링크 제한과 Markdown 왕복 손실 판정을 확인한다. Markdown 기능은 공식 Beta 계약이므로 미지원 문서를 조용히 축소하지 않는다.
- Markdown 보기·복사는 JSON을 보존한다. 왕복이 같은 문서일 때만 바로 수정할 수 있고, 다르면 읽기 전용 변환본과 손실 안내를 제공한다. `변환본으로 편집`을 선택해도 실제 입력 변경 전까지 원본을 유지한다. 새 Markdown 입력에서 실패하면 마지막 유효 JSON을 보존하고 게시를 막아 수정 내용을 모르게 잃지 않게 한다.
- 지원 밖 Markdown 표·작업 목록·이미지·임의 HTML 구문은 조용히 삭제하지 않고 입력 오류로 알린다. 밑줄은 공식 Underline 토크나이저와 `<u>` 직렬화를 사용한다. HTML 붙여넣기는 공통 스키마로 처리하며 본문 내 이미지 대신 기존 첨부 기능을 유지한다. 빈 문단·목록 속성 등 Markdown 왕복으로 달라지는 구조는 위 손실 판정 대상이다.
