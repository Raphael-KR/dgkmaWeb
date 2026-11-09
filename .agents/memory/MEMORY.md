# 프로젝트 참고 메모

현재 정책과 실행 절차는 프로젝트 AGENTS.md와 분야별 기준 문서를 따른다. 아래 메모는 설명·과거 관찰이며 독립적인 실행 지시가 아니다.

- [Drizzle와 session 관리 경계](drizzle-push-session-table.md) — 현행 `tablesFilter: ["!session"]`, Drizzle `DATABASE_URL`과 앱 PG* 선택 차이. 옛 rename/drop 관찰은 이력이며 DB 실행은 운영 런북을 따른다.
- [Object storage serving hardening](object-storage-serving-hardening.md) — blueprint upload/serve routes are insecure by default; session-gate them + force non-image to octet-stream/nosniff to block stored XSS.
- [Modular compatibility](modular-boundaries.md) — preserve shared storage receiver dispatch and actual generated-validator coercion when changing structure.
- [Route loading policy](route-loading-policy.md) — keep the public landing path and auth stable; defer screen bodies and measure the whole initial dependency graph.
