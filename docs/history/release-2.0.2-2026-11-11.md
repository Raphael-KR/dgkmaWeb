# 2.0.2 릴리스 기록

- 목표: 공개·회원 공통 헤더와 이름 버튼·상단 메뉴 변경을 운영에 반영한다.
- 범위: 전체 미커밋분과 미게시 커밋, 버전·변경 기록, PR·main 병합, Replit 배포·태그와 세 환경 Git 마무리.
- 완료 조건: 새 배포의 성공 전환·비로그인 smoke·후보 자산 일치, 로컬·GitHub·Replit main 일치, Git 관리 대상 미커밋분과 main 외 브랜치 0개.
- 제외: DB·Secret 변경, 실계정 QA·브라우저 상호작용, 실제 카카오·Sheets·OpenAI 호출, 사진·수상자 자료 반영.
- 검증: 검사 카탈로그에서 변경 영향에 맞는 공통 필수 검사를 적용한다. 소스·의존성·설정·도구가 같은 개발 결과는 재사용하고 새 버전 빌드와 배포 후 HTTP 확인을 수행한다.

## 승인·시작 상태

2026-11-11 사용자의 “릴리스 하라” 요청을 [프로젝트 릴리스 스킬](../../.agents/skills/dgkma-release/SKILL.md)과 [전체 릴리스 기준](../../replit.md#전체-미커밋분과-git-마무리)에 따라 수행한다. 이전 개발 작업의 배포 제외는 이번 전체 릴리스 승인으로 종료하고 실계정 QA 보류는 유지한다.

마지막 운영 버전·태그는 `2.0.1`, 소스 후보는 `bbcd4d6ccdd4e19cada072896086a5b6451c9031`, tree는 `d6bfcc4d9992ec0c0926ec0081f3b0dcfa016582`다. 시작 시 Replit 커넥터가 반환한 deployment `eb4a4e6a-1633-4882-8ee8-c1e1b9313e8b`는 기존 success이며 새 배포의 증거가 아니다.

로컬 main은 `788539fd1070fac3779471f9240e2108a92c31f0`으로 공개 헤더 변경 커밋 1개가 미게시 상태였다. GitHub·Replit main은 `d5db0090e988fe910af465aa41d459dd7e618d5b`다. 양쪽 작업 사본의 소스·문서 542개 파일이 해시로 일치했으며 로컬에는 후속 변경 12개 파일이 미커밋 상태였다. 세 곳 모두 main만 있고 열린 PR은 없었다. Replit의 기존 stash 11개, detached 보존 worktree와 gitsafe-backup 참조는 유지한다.

## 변경·정리·보존 판단

기존 주소·권한·저장 계약을 유지하는 표시 수정이므로 PATCH `2.0.2`로 올린다. 루트 패키지·lockfile·CHANGELOG를 같은 PR에 포함하며 별도 설계 미리보기 패키지는 변경하지 않는다.

- `SiteHeader`의 두 소비자 `AppHeader`·`PublicLayout`에 같은 한 줄 CSS와 DOM 순서를 적용한다. 기존 두 줄 grid와 공개 전용 덮어쓰기를 제거했다.
- 두 헤더의 이름 span을 `HeaderProfileLink`로 대체했다. 공통 Button·테마 CSS·기존 `/profile` AuthGate를 사용하며 개인 이름을 정적으로 저장하지 않는다.
- 회원 상단의 홈·내정보만 제외한다. 전체 `memberNavItems`는 실제 소비자인 `BottomNavigation`을 위해 유지한다. 하단 메뉴 파일·스타일·권한 조건, 로고 홈 이동, 검색·최근 글·로그아웃은 유지한다.
- 공통 표시 정책·구조·Replit 개발 범위와 개발 이력을 맞췄다. 이전 릴리스·개발 원본 기록은 당시 상태로 보존한다. 저장 데이터·호환 export·API·외부 주입 계약은 이번 변경 대상이 아니다.
- 관련 UI에 고정된 폐기 검사나 중복 검사는 없었다. lint·서식·타입/의존 경계·빌드는 서로 다른 위험을 확인하므로 유지한다. 검사 코드·조건·CI를 바꾸지 않는다. 저장소에는 workflow 파일이 없으며 외부 상태 검사는 병합 전 해당 후보에서 확인한다.

## 검사 선택과 재사용

| 검사 | 목적·선택 이유·명령·환경·부수 효과 |
|---|---|
| 문서·사용처·공백 | 마지막 배포와 변경 전후, 직접 소비자와 링크·절 제목, `git diff --check` 확인. 로컬/Replit 파일 읽기 |
| Lint·서식·CSS | [20:00 KST 개발 검사](header-navigation-2026-11-11.md#후속-구현검사-결과)의 TS/TSX 5개·CSS 1개 해시와 설정·도구·의존성 일치를 대조해 재사용. 정확한 명령·출력은 `.superpowers/header-navigation-20261111/checks.json` |
| 앱 타입·경계 | 버전 파일을 포함한 후보에서 `npm run check`. Replit 파일/타입 분석이며 앱·DB를 실행하지 않음. 포함된 경계 검사는 따로 반복하지 않음 |
| 배포 빌드 | `npm run build`. Replit의 최종 버전·lockfile로 `dist`를 갱신하며 서버 시작·DB 변경은 없음 |
| 운영 smoke | 새 배포 후 현행 공개 페이지·canonical, 보호 API 401, 후보 정적 자산 SHA-256 확인. 비로그인 GET과 서버 접근 로그만 발생 |

라우트 등록·AuthGate·lazy import·저장·API는 바뀌지 않았고 기존 router 검사는 화면 본문을 대역으로 바꾸므로 헤더 동작 확인을 대신하지 않는다. 이번 후보에는 실행형 기능 검사·테스트 타입·전체 회귀·브라우저 복구·DB 검사의 적용 조건이 없다. 기존 검사와 명령은 보존한다. 실제 이름 버튼 클릭·로그인 상태별 화면·반응형 시각 확인은 미검증으로 남기며 정적 검사나 HTTP 성공으로 대체하지 않는다.

## 실행 결과

### 최종 후보 검사

2026-11-11 20:13 KST Replit Linux·Node `v20.20.0`·ESLint `10.14.0`·Prettier `3.9.10`·TypeScript `5.6.3`에서 확인했다. 로컬·Replit 후보 파일 543개의 해시가 같고 패키지·lockfile의 세 버전은 `2.0.2`다. 버전 필드를 제외한 의존성 내용은 바뀌지 않았다.

| 검사 | 결과 |
|---|---|
| Lint·서식·CSS | 20:00 KST 개발 결과 재사용. 변경 TS/TSX 5개와 CSS 1개, 검사 설정·도구·의존성 일치 확인. CSS 경고 없음 |
| 앱 타입·경계 | 최종 버전에서 `npm run check` 통과. 포함된 경계 검사는 별도 반복하지 않음 |
| 배포 빌드 | `npm run build` 통과. 정적 파일 86개 생성, 진입 자산 `/assets/index-Dc3o7ssa.js` |
| 문서·공백 | 변경 문서 7개의 상대 파일 링크 226개·새 절 참조와 `git diff --check` 확인 |

셸 `LC_ALL` locale 안내가 있었으며 타입·번들 오류는 없었다. 기존 검사·CI의 삭제나 기준 변경은 없으며 실행형 테스트·브라우저·DB 검사를 수행한 것으로 보고하지 않는다. 검사 입력·명령·설정·출력·자산 해시와 변경 전 `dist`는 `.superpowers/release-2.0.2-20261111/`에 보존한다. 검사 후 문서 결과만 추가했으며 앱 입력은 변경하지 않았다.

## 운영 배포와 smoke

- [PR #34](https://github.com/Raphael-KR/dgkmaWeb/pull/34)의 후보는 `d80ff90a393299c1a8f37626f682b813e13f3acc`, 병합·실제 배포 후보는 `3c963e9a842035d5a9d8ba8989db4407088a00d0`이다. 두 tree는 `f438231f0f463e7798a7144e303936b997d40239`로 같다. 병합 직전 리뷰·등록된 status·PR workflow 결과가 없었으며 이를 CI 통과로 계산하지 않았다.
- GitHub main을 로컬·Replit에 fast-forward한 뒤 후보 파일 543개와 빌드 파일 86개의 해시 일치를 확인했다. 직접 반영한 개발 작업은 모두 PR에 포함됐음을 대조한 뒤 snapshot `cb4a2d62be25870af6212e5ec36eb9879d08db9e`로 보존했다.
- Replit `publish_app`의 `pending → building → running → promoting → success`를 관찰했고 **2026-11-11 20:21:42 KST**에 [dgkma.org](https://dgkma.org/) 배포 성공을 확인했다. 커넥터 deployment ID `eb4a4e6a-1633-4882-8ee8-c1e1b9313e8b`는 이전과 같아 새 ID로 기록하지 않는다. 이번 상태 전환·게시 커밋·새 자산 해시로 새 배포를 식별한다.
- **20:22:31 KST 비로그인 HTTP 104건 통과**: 현행 `PUBLIC_PAGES`의 공개 페이지 16개·사이트맵 1개·게시판/명부 API 2개·정적 자산 85개. `/`·`/about` canonical은 `https://dgkma.org/`, 하위 페이지는 각자의 주소이며 사이트맵은 현행 canonical과 일치했다. `/api/posts`·`/api/alumni`는 401이고 모든 자산 SHA-256이 검사한 후보 빌드와 같았다.
- 실제 이름 버튼 클릭·회원 화면·브라우저 반응형·실계정 QA는 수행하지 않았다. DB·Secret 변경, 개발 서버 별도 재시작, 실제 수집·OpenAI·카카오·Sheets 호출도 없었다. 공개 GET 결과를 이러한 기능의 검증으로 대신하지 않는다.

## Git 통합·태그와 보존

- annotated tag `v2.0.2`는 실제 배포 후보 `3c963e9a842035d5a9d8ba8989db4407088a00d0`를 가리킨다. 이 태그만 push하고 로컬·GitHub·Replit에서 같은 대상을 확인했다. 완료 문서 때문에 태그를 옮기거나 재배포하지 않는다.
- Replit 게시 커밋 `354650dcec2b08f654b145d1dd49f22e35220ba8`와 `0d9b9fdd5d2d638ad484fe5c50c579fb78a1559d`는 후보와 같은 tree다. Git 번들의 복구 가능성을 검증하고 두 커밋을 main에 fast-forward해 GitHub에도 보존했다.
- PR 병합·고유 커밋·활성 worktree를 확인하고 로컬·GitHub의 `codex/release-2.0.2`, Replit의 `replit-agent`를 삭제했다. 모두 main에 포함된 커밋이며 강제 push·hard reset·강제 브랜치 삭제를 사용하지 않았다. origin의 stale 추적 참조도 prune했다.
- 브랜치 정리 시점에 로컬·GitHub·Replit main은 `0d9b9fdd5d2d638ad484fe5c50c579fb78a1559d`로 일치하고 Git 관리 대상 미커밋분과 main 외 브랜치는 없었다. 이후 완료 기록을 문서 전용 커밋으로 반영한다. 최종 main SHA·dirty·브랜치·태그 대조는 `.superpowers/release-2.0.2-20261111/completion.json`에 보존한다.
- 기존 stash 11개와 이번 후보 snapshot 1개, detached `unified-posts-check` worktree(`f8743fa`), gitsafe-backup·archive 참조를 유지했다. `.superpowers/`의 원본·검사·빌드·Git 번들, Git에서 제외된 의존성·캐시·빌드를 삭제하거나 강제 추적하지 않았다. 제외한 Git 관리 대상 코드·문서는 없다.
- 완료 문서 5개의 상대 링크 165개(절 참조 83개 포함)와 `git diff --check`를 확인했다. 배포 후 변경은 문서뿐이므로 앱 검사·빌드·운영 배포는 반복하지 않는다.
