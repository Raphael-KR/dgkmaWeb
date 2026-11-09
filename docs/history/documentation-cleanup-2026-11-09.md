# 문서 정리 기록 (2026-11-09)

이 문서는 지적된 6가지 문서 문제를 정리한 작업 이력이다. 현재 기준은 [문서 진입점](../../README.md)과 분야별 기준서를 따른다. 문서 확인일을 DB 재관찰일이나 운영 재배포일로 사용하지 않는다.

## 기준과 범위

- 기준 소스: 로컬·Replit 개발 main `d7184ca5238e0cdc3e91515ac0616e3b33332f41`. 작업 시작 시 두 checkout의 추적 파일은 깨끗했다.
- 목표: 현재 정책·코드·마지막 적용 상태를 일치시키고 누적된 승인·실행·검사 기록을 분리한다. 내용·링크·기존 파일 기반 문서 계약과 diff 확인으로 마친다.
- 적용: 기준서·진입점·구조/보안 설명·프로젝트 참고 메모, 파일만 읽는 기존 문서 계약. 앱 기능과 DB 계약은 변경하지 않았다.
- 제외: DB 접속·변경, 서버 재시작, 브라우저/외부 API 실행, 운영 배포, 실계정 QA, Git 커밋·push·PR·병합.

## 6가지 정리 결과

| 문제 | 반영 |
|---|---|
| 개발 DB 절차가 운영 전환·전체 시험으로 이어짐, 제거된 테이블이 초기화 목록에 남음 | [DB 런북](../database-operations.md)에 개발/승인된 운영 작업을 분리하고 현행 테이블과 초기화 범위를 명시. 과거 SQL은 완료된 전환 색인으로 이동 |
| README·계획서·Replit의 미적용/최신 상태 충돌 | [현재 적용 상태](../../replit.md#현재-적용-상태)를 PR #28까지 맞추고 main·개발 checkout·실제 게시 커밋·확인 범위를 구분. canonical도 운영 적용 완료로 정리 |
| 최신 스키마가 누적 추가 설명과 옛 사전에 분산 | [스키마 기준서](../database-schema.md)에 13개 테이블·103개 컬럼, JSONB·event_data·가림·수집 규칙을 통합. 마지막 catalog 관찰일·digest는 유지 |
| 보안 문서의 공개 콘텐츠·직접 업로드·옛 코드 경로 | [Threat Model](../../threat_model.md)을 회원 전용 콘텐츠, 서버 경유 제한 업로드, OpenAI·수집 worker 경계와 실제 소스 경로에 맞춤. 현재 구현의 제한도 구분 |
| 관리자 게시글 화면 미구현·API/파일 목록 누락 | [계획서](../../planning_proposal.md)·[구조 문서](../project-structure.md)에 작성자 수정·삭제, 관리자 가리기, 정정 미리보기 API와 실제 관리 연결을 반영. 삭제된 파일을 보존 대상으로 두지 않음 |
| session 때문에 db:push가 항상 위험하다는 옛 메모 | [프로젝트 메모](../../.agents/memory/drizzle-push-session-table.md)·색인에 현재 session 제외 설정과 앱 PG*/Drizzle URL 차이를 명시. 과거 executeSql/rename/drop 설명은 당시 관찰로 표시 |

## 이력 보존과 정적 확인

기존 replit·DB 스키마·DB 런북·walkthrough·통합 전 부고 양식은 이 디렉터리의 보관본 5개에 보존했다. 원문 본문은 상대 링크 대상 변경을 제외하고 기존 HEAD와 일치한다. 보관본 머리말에서 당시의 “현재·최신·보류”와 명령을 현행 지시로 읽지 않도록 표시했다.

2026-11-09 Replit 개발 환경에서 실제 수행한 정적 확인:

- `node --import tsx --test server/tests/final-recheck-documentation-contract.test.ts`: 파일 기반 문서 계약 6건 통과. 앱 서버·DB 모듈을 실행하지 않는다.
- `eslint server/tests/final-recheck-documentation-contract.test.ts`: 오류·경고 없음. 수정한 검사 파일에만 적용했다.
- 상대 링크·제목 anchor 확인, 코드 경로 대조, Drizzle 12개 테이블의 100개 컬럼 이름·타입·NULL 대조와 runtime session 3개 컬럼 확인.
- `git diff --check`와 로컬/Replit 대상 파일 해시 대조. 최종 변경은 문서 19개와 문서 검사 1개이며 미커밋 상태로 남긴다.

검사 보조 파일·해시 manifest는 양쪽 개발 작업 경로의 ignored `.superpowers/documentation-cleanup-20261109/`에 둔다. 기존 DB·릴리스 실행 결과를 새로 확인한 것으로 표시하지 않았고, 운영 상태는 변경하지 않았다.
