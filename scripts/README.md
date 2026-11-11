# 실행 스크립트 안내

기존 실행 경로를 유지하고 용도별로 분류한다. 이 목록을 차례로 실행하지 않는다. 환경·승인·필요한 검사 범위는 루트 [AGENTS.md](../AGENTS.md)와 [replit.md](../replit.md)를 따른다.

검사의 선택 조건·실제 명령·환경·부수 효과와 결과 재사용은 [검사 카탈로그](../docs/runbooks/feature-checks.md)에서 관리한다. 아래는 스크립트 위치와 용도를 찾기 위한 색인이다.

| 목적 | 파일·안내 | 실행 효과 |
|---|---|---|
| DB 조회·개발/운영 전환·과거 seed | [DB 스크립트 분류](../docs/reference/database-scripts.md) | 실제 DB 접속·변경 여부와 완료된 전환을 개별 구분 |
| 브라우저 경계 | [check-boundaries.mjs](check-boundaries.mjs) | 브라우저·공용 코드의 서버/DB 참조와 앱의 sandbox 참조 금지. 폴더 구조·순환 참조를 일괄 차단하지 않음 |
| 역사관 자료 | [check-heritage-content.mjs](check-heritage-content.mjs) | 공개 JSON·ID 참조·날짜·공개 파일 존재 확인. 앱·DB·외부 서비스 실행 없음 |
| 코드 서식 | 루트 `npm run format`, `npm run format:check` | 고정 버전 Prettier로 JS/TS/TSX·CSS 정리 또는 읽기 전용 검사. 실행 경계는 [구조 기준](../docs/architecture/project-structure.md#파일명테스트-규칙과-명령)을 따름 |
| 배포 산출물 | 루트 `npm run build` | Vite·서버 번들 생성. 과거 고정 청크 용량 검사 없음 |
| 테스트 탐색·실행 | [run-tests.mjs](run-tests.mjs) | `--list`는 목록, 일반 실행은 실제 테스트 실행. DB 사례는 기본 skip이며 승인된 `test:development-db`로 별도 선택 |
| 수집 런타임 | [collector/worker.mjs](collector/worker.mjs) | 앱의 통제 아래 Playwright·OCR를 실행하는 별도 프로세스; 독립 설정/DB 작업 도구가 아님 |
| 브라우저 복구 흐름 | [test-route-recovery-browser.mjs](test-route-recovery-browser.mjs) | 실제 브라우저 실행이며 별도 요청 범위에서 사용 |
| 브라우저 통신 | [lib/browser-cdp.mjs](lib/browser-cdp.mjs) | 위 복구 스크립트의 CDP 연결·명령·대기 보조; 단독 실행 항목이 아님 |
| 기존 병합 보조 | [post-merge.sh](post-merge.sh) | 실행하면 `npm install` 수행. 존재 자체가 Git hook 설치를 뜻하지 않음 |

새 개발 작업의 시작은 [Replit 개발 시작 안내](../docs/runbooks/development.md)를 따른다. 완료된 SQL이나 과거 측정을 배포·개발마다 자동 반복하지 않는다.

과거 모바일 비교 도구와 고정 청크 검사·연결 명령은 [필수 검사만 유지하는 결정](../docs/history/essential-checks-2026-11-11.md)에 따라 제거했다. 당시 측정과 릴리스 기록은 이력이며 재실행 명령이 아니다.
