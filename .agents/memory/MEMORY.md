# 프로젝트 참고 메모

현재 정책과 실행 절차는 프로젝트 AGENTS.md와 분야별 기준 문서를 따른다. 아래 메모는 설명·과거 관찰이며 독립적인 실행 지시가 아니다.

- [Drizzle와 session 관리 경계](drizzle-push-session-table.md) — 현행 `tablesFilter: ["!session"]`, Drizzle `DATABASE_URL`과 앱 PG* 선택 차이. 옛 rename/drop 관찰은 이력이며 DB 실행은 운영 런북을 따른다.
- [Object Storage 보안 경계](object-storage-serving-hardening.md) — 과거 blueprint 문제의 배경과 현행 업로드·첨부 열람·경로·응답 처리 기준 연결.
- [Modular compatibility](modular-boundaries.md) — preserve shared storage receiver dispatch and actual generated-validator coercion when changing structure.
- [Route loading policy](route-loading-policy.md) — keep the public landing path and auth stable; defer screen bodies and measure the whole initial dependency graph.
- [회원 등급과 회비](../../docs/product/planning-proposal.md#회원-등급과-회비) — 현행 판정은 제품 정책, 부분납부 오판을 정리한 경위는 [삭제·축소 이력](../../docs/history/unused-cleanup-2026-11-10.md#문서-통합과-보존-근거)을 따른다.
