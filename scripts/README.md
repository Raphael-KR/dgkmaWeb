# 실행 스크립트 안내

기존 실행 경로를 유지하고 용도별로 분류한다. 이 목록을 차례로 실행하지 않는다. 환경·승인·필요한 검사 범위는 루트 [AGENTS.md](../AGENTS.md)와 [replit.md](../replit.md)를 따른다.

| 목적 | 파일·안내 | 실행 효과 |
|---|---|---|
| DB 조회·개발/운영 전환·과거 seed | [DB 스크립트 분류](../docs/reference/database-scripts.md) | 실제 DB 접속·변경 여부와 완료된 전환을 개별 구분 |
| 코드 경계 | [check-boundaries.mjs](check-boundaries.mjs) | 소스 import·의존 방향 정적 확인 |
| 역사관 자료 | [check-heritage-content.mjs](check-heritage-content.mjs) | 공개 JSON·ID 참조·날짜·공개 파일 존재 확인. 앱·DB·외부 서비스 실행 없음 |
| 코드 서식 | 루트 `npm run format`, `npm run format:check` | 고정 버전 Prettier로 JS/TS/TSX·CSS 정리 또는 읽기 전용 검사. 실행 경계는 [구조 기준](../docs/architecture/project-structure.md#파일명테스트-규칙과-명령)을 따름 |
| 배포 산출물 | [check-route-chunks.mjs](check-route-chunks.mjs) | 생성된 번들 구조 확인; 앱 타입 검사와 구분 |
| 테스트 탐색·실행 | [run-tests.mjs](run-tests.mjs) | `--list`는 목록, 일반 실행은 실제 테스트 실행 |
| 수집 런타임 | [collector/worker.mjs](collector/worker.mjs) | 앱의 통제 아래 Playwright·OCR를 실행하는 별도 프로세스; 독립 설정/DB 작업 도구가 아님 |
| 모바일 측정 | [measure-mobile-home.mjs](measure-mobile-home.mjs), [mobile-home-regression.mjs](mobile-home-regression.mjs), [mobile-home-regression.test.mjs](mobile-home-regression.test.mjs), [mobile-home-baseline.json](mobile-home-baseline.json) | 측정·회귀·기준 자료. 일상 정적 검사 묶음에 포함하지 않음 |
| 브라우저 복구 흐름 | [test-route-recovery-browser.mjs](test-route-recovery-browser.mjs) | 실제 브라우저 실행이며 별도 요청 범위에서 사용 |
| 브라우저 공통 통신 | [lib/browser-cdp.mjs](lib/browser-cdp.mjs) | 위 측정·복구 스크립트의 CDP 연결·명령·대기 보조; 단독 실행 항목이 아님 |
| 기존 병합 보조 | [post-merge.sh](post-merge.sh) | 실행하면 `npm install` 수행. 존재 자체가 Git hook 설치를 뜻하지 않음 |

새 개발 작업의 시작은 [Replit 개발 시작 안내](../docs/runbooks/development.md)를 따른다. 완료된 SQL이나 과거 측정을 배포·개발마다 자동 반복하지 않는다.

모바일 회귀의 `largestAssetIncreases`는 현재 자산과 기준 자산에 같은 scope를 적용한다. `all`은 local·external을 모두 포함하고 실제 차이를 계산한다. 이 진단 목록과 지표의 합격·실패 임계 판정은 별개이며, 진단 수정으로 측정 실행이나 baseline 갱신을 자동 수행하지 않는다.
