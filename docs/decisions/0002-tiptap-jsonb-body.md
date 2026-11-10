# ADR 0002: 공식 Tiptap과 JSONB 본문 정본

- 상태: Accepted — 기존 사용자 확정 결정의 사후 기록
- 기록일: 2026-11-09. 제품 기준서에 기록된 같은 날짜의 본문 정책을 근거로 한다.
- 정본: [본문 서식 정책](../product/planning-proposal.md#게시글-본문-서식-2026-11-09), [편집기·업데이트 계약](../reference/post-editor.md)

## 배경

HTML 붙여넣기·Markdown·서식 UI가 같은 게시글을 편집하면서 기존 Markdown TEXT 정본으로 표현하기 어려운 서식의 보존 규칙이 필요했다. 공식 업데이트 때 서비스 코드의 영향을 줄이는 것도 사용자 요구였다.

## 결정과 비교한 선택지

무료 공식 StarterKit과 기존 UI를 사용하고 `posts.content` JSONB에 표준 Tiptap JSON 하나를 정본으로 저장한다. HTML·Markdown·일반 텍스트는 변환 결과다. `posts.event_data` 사실 JSON과 합치지 않는다.

Markdown TEXT 정본은 기존 내용을 보존·변환해 대체한다. 유료 Notion-like 템플릿 도입은 취소하고 패키지 포크·node_modules 수정·외부 편집 서비스는 추가하지 않는다. 공식 기본 단축키·공개 API·설정을 재사용하며 권한·저장·첨부 연동은 서비스 계층에 둔다.

## 결과와 제약

작성·복원·표시·요약·검색이 같은 문서 계약을 사용한다. Markdown 열기·복사는 원본을 바꾸지 않고, 왕복 손실이 있으면 안내 후 작성자가 변환본 편집을 선택하고 실제 수정했을 때만 교체한다. 공식 Markdown 기능의 제약과 서비스 설정은 [호환성 기준](../reference/post-editor.md)에 남긴다. 기존 TEXT 전환은 완료된 일회성 작업이며 매 시작·배포 때 반복하지 않는다.

## 근거와 적용 기록

- [공통 문서 구현](../../shared/editor/post-document.ts), [JSON 계약](../../shared/contracts/post-document.ts)
- [개발 본문 전환](../history/database-operations-2026-11-09.md#본문-jsonb-개발-적용-기록), [운영 전환](../history/database-operations-2026-11-09.md#본문-운영-전환-결과)
- [PR #26 릴리스 기록](../history/replit-2026-11-09.md#본문-jsonb-릴리스-완료-결과)
