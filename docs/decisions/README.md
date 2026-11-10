# 주요 결정 기록 (ADR)

현재 제품·구조를 이해하는 데 필요한 확정 결정의 배경·대안·결과를 기록한다. ADR 0001~0004는 2026-11-09 기존 사용자 결정과 기준서를 바탕으로 사후 정리했다. ADR 0005는 2026-11-10 사용자 결정을 기록한다. 각 문서의 결정일·기록일을 구분하며 기록일을 배포일로 대신하지 않는다.

| ADR | 결정 | 상태 |
|---|---|---|
| [0001](0001-unified-member-posts.md) | 게시판·경조사를 회원 전용 posts로 통합 | Accepted — 기존 확정 결정 |
| [0002](0002-tiptap-jsonb-body.md) | 무료 공식 Tiptap과 JSONB 본문 정본 | Accepted — 기존 확정 결정 |
| [0003](0003-public-source-collection-rules.md) | 공통 공개 수집 엔진과 PostgreSQL 규칙 저장 | Accepted — 기존 확정 결정 |
| [0004](0004-author-edit-admin-hide.md) | 작성자 수정·삭제와 관리자 가리기 분리 | Accepted — 기존 확정 결정 |
| [0005](0005-membership-public-regulations.md) | 공개 규정을 권리회원 목표 판정 기준으로 채택 | Accepted — 2026-11-10 결정, 구현·DB 적용 별도 |

현행 제품 정책은 [제품·개발 계획](../product/planning-proposal.md), DB 계약은 [스키마 기준서](../reference/database-schema.md), 환경·실행 경계는 [replit.md](../../replit.md)가 정본이다. ADR의 Accepted는 결정이 확정됐다는 뜻이며 실제 코드·DB·배포 확인을 대신하지 않는다. 적용 증거는 각 ADR의 이력 링크에서 확인한다.

새 결정이 기존 결정을 바꾸면 담당 기준서를 먼저 갱신하고, 새 ADR에서 이전 결정을 연결한다. 이전 ADR에는 대체 상태·후속 링크를 남겨 당시 이유를 보존한다. 세부 기능 명세·현재 작업 목록·실행 로그를 ADR에 중복 관리하지 않는다.
