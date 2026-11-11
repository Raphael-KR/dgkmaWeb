# 2.0.3 릴리스 기록

- 목표: 확정된 공개·회원 탐색과 소개 페이지 변경을 운영에 반영한다.
- 범위: 로컬·Replit의 프로젝트 미커밋분 전체, 버전·변경 이력, 커밋·push·PR·main 병합·Replit 배포·태그와 Git 마무리.
- 완료 조건: 후보 검사와 새 배포·운영 smoke 확인, 후속 기록 반영, 로컬·Replit·GitHub main SHA 일치와 main 외 브랜치 정리.
- 제외: DB·Secret 변경, 실제 회원·외부 provider QA, 무관한 기능 개발과 원본·보존 worktree·stash 삭제.
- 검증: [검사 카탈로그](../runbooks/feature-checks.md)의 공통 필수 항목과 이번 라우트 등록에 해당하는 기존 router 검사를 선택한다.

## 기준과 변경 범위

마지막 운영 후보는 `v2.0.2`의 `3c963e9a842035d5a9d8ba8989db4407088a00d0`이며 시작 시 세 환경 main은 `b5a63aacde1321b1f646f86b6669e6b1fafb9504`다. 로컬·Replit 작업 사본 547개 경로의 파일 해시가 일치했다. 원격에는 main만 있고 열린 PR은 없었다. 기존 Replit stash 12개와 detached `unified-posts-check` worktree는 보존한다.

버전은 `2.0.3`으로 준비한다. 기존 소개 내용을 별도 주소에 배치하고 탐색·표시와 개발 캐시를 정리하며 업무 기능·서비스 API·회원 권한·저장 계약을 바꾸지 않으므로 PATCH다. [제품 기준](../product/planning-proposal.md)의 공개 랜딩·소개·역사관 정책과 [Replit 운영 규칙](../../replit.md)을 따른다.

## 사용처 검토와 제거·보존

- 공개·회원 메뉴와 이름 버튼을 `SiteNavLink`, 로그아웃을 `HeaderLogoutButton`으로 공통화했다. 두 헤더의 실제 소비자를 확인하고 대체된 `header-profile-link.tsx`와 공개 메뉴 화살표, 이름 버튼에만 적용하던 스타일 차이를 제거했다.
- `site-header-action`은 공통 Button의 `onBrand`·`onBrandOutline`에서 사용하므로 보존한다. 회원 하단 메뉴, 로그인 모달의 회원 전용 목적지 처리, 로그인·로그아웃 서비스 코드는 유지한다.
- 공개 메뉴와 바로가기의 목적지·아이콘을 공통 자료로 연결한다. 역사관 첫 목적지는 사진첩이며 기존 연혁 URL과 기록 앵커·자료는 유지한다.
- `/about/intro`에는 기존 소개·주요 사업·조직 및 임원 세 섹션을 옮겼다. 공개홈의 네 섹션과 이동 본문은 앞선 내용 대조 결과 및 현재 소스 해시로 보존을 확인했다. 소개 메뉴·바로가기·lazy route·공통 SEO 정의를 연결하며 `/`·`/about` canonical과 회원 권한은 유지한다.
- 개발 진입 URL의 요청별 난수와 유일한 사용처가 사라진 `nanoid` 직접 의존성을 제거했다. PostCSS의 간접 `nanoid`, 기존 Vite 변경 감지와 운영 정적 파일 처리는 유지한다. [개발 캐시 기록](vite-entry-cache-2026-11-11.md)의 시간 비교를 운영 성능 개선으로 해석하지 않는다.
- 제품·구조·개발 운영 문서와 변경 이력의 설명·참조를 맞췄다. 과거 개발·릴리스 기록은 당시 상태로 보존하며 이번 릴리스 완료 연결을 별도로 추가한다.

## 검사 선택과 재사용

| 검사 | 목적·명령·환경·부수 효과와 재사용 판단 |
|---|---|
| 코드·문서·사용처·공백 | 마지막 배포와 후보의 변경 전후, 실제 소비자·링크·참조와 `git diff --check`. 로컬/Replit 파일 읽기 |
| Lint·서식 | 기존 개발 검사의 변경 TS/TSX 12개·CSS 1개 해시, 설정·도구와 관련 의존성 일치를 대조해 재사용. 일치하지 않는 입력만 해당 파일 검사 |
| 앱 타입·경계 | 최종 버전 파일을 포함한 후보에서 Replit `npm run check`. 앱·DB 실행 없음, 포함된 경계 검사를 따로 반복하지 않음 |
| router | `node --import tsx --test client/src/app/routing/router.test.ts`. 기존 공개/회원/관리자 분기와 lazy route·오류 fallback 보호. 실제 router와 메모리 대역 화면을 렌더링하며 새 fixture·DB·외부 연결 없음 |
| 배포 빌드 | Replit `npm run build`. 기존 dist를 보존한 뒤 최종 후보의 정적 파일·서버 번들 생성. 서버 시작·DB 변경 없음 |
| 운영 smoke | 새 Republish 이후 현행 공개 페이지·canonical·사이트맵, 회원 API 401과 후보 정적 자산 SHA-256 확인. 비로그인 GET 및 서버 접근 로그만 발생 |

현재 router 검사는 기존 접근 분기와 오류 복구를 확인하며 새 소개 페이지 본문·실제 클릭·CSS를 확인하지 않는다. 소개 URL의 HTTP·SEO는 배포 후 별도로 확인한다. 테스트 파일·타입과 운영 자산 복구·인증·DB 처리는 변경하지 않았으므로 테스트 타입·브라우저 복구·DB·전체 회귀를 추가하지 않는다.

변경 경로에 해당하는 폐기·중복 검사는 발견하지 못했다. 기존 router·lint·서식·타입/경계·빌드는 각각 다른 위험을 보호하므로 유지하며 검사 기준이나 CI를 변경하지 않는다. 저장소에는 workflow 파일이 없고 GitHub의 해당 후보 상태 검사는 병합 전에 별도로 확인한다. 개발 결과 재사용은 `.superpowers/release-2.0.3-20261111/`의 파일별 기록에 연결한다.

## 최종 후보 검사

2026-11-11 22:16:20 KST Replit에서 `2.0.3` 후보를 확인했다. 패키지·lockfile의 버전 세 곳이 일치하고, 548개 소스 경로 해시는 `candidate-inputs.json`에 보존했다.

- `npm run check`: 통과. TypeScript와 앱 243개 파일의 브라우저·서버/수집 경계를 확인했다.
- `node --import tsx --test client/src/app/routing/router.test.ts`: 2건 통과, 실패·skip 없음.
- `npm run build`: 통과. 이전 dist를 보존하고 공개 산출물 88개의 해시를 기록했다.
- `git diff --check`: 통과. 로컬 기준 문서 8개의 상대 링크 256개·앵커 97개도 확인했다.
- Lint·서식: 앞선 Replit 검사에서 통과한 TS/TSX 12개·CSS 1개의 동일 소스 결과를 재사용했다. `static-reuse.json`에 파일별 원본 기록과 해시, 변경되지 않은 도구·설정·의존성 근거를 남겼다.

실행 환경은 Node 20.20.0·npm 10.8.2·TypeScript 5.6.3·Vite 6.4.3이며 재사용한 도구는 ESLint 10.14.0·Prettier 3.9.10이다. 셸의 `C.UTF-8` locale 경고가 있었으나 검사 명령은 모두 종료 코드 0이며 빌드 실패·번들 크기 경고는 없었다. 기록은 `.superpowers/release-2.0.3-20261111/`에 보존한다.

## Git 통합·태그와 보존

- 후보 커밋 `4bf1c1fb0d65d40e5e02bc4b122b7240aff308b8`의 전체 24개 변경 파일을 [PR #35](https://github.com/Raphael-KR/dgkmaWeb/pull/35)에 포함했다. GitHub 상태 검사는 없었으며 자동 코드 리뷰는 해당 SHA에서 지적 없이 완료됐다. 22:23:57 KST main `7062b7c9df5f498ce0b9c775212141aac06425db`에 병합했다.
- 22:26:17 KST Replit을 GitHub main으로 fast-forward했다. 기존 직접 반영본은 stash `39b13868a2b13125174c5b3185871192f745f2ce`로 보존했으며 제외된 변경을 숨긴 것이 아니다. 검사 목록의 삭제 경로 1개를 구분한 실제 파일 547개와 빌드 산출물 88개의 해시가 일치했다. 최초 대조는 삭제 경로의 `null` 표현 차이로 변경 전에 멈췄고, 경로를 구분한 재대조로 확인했다.
- 실제 배포 후보와 태그 대상은 `7062b7c9df5f498ce0b9c775212141aac06425db`, tree는 `0382361e80f257cc76a8391a0f1ba0abe69c6720`이다. 운영 성공·smoke 이후 annotated `v2.0.3`을 생성·push했다.
- Replit 게시 커밋 `576ded69ab06d604a5d72223e860cd0414b718b9`와 `0e1bebce87f93fce656d33eeb67fce6be2108df4`는 같은 tree다. 원본 부모 관계를 번들에 보존하고 fast-forward로 GitHub main에 연결했다. 이력을 다시 작성하거나 강제 push하지 않았다.
- 22:33:57 KST 로컬·GitHub·Replit main이 `0e1bebc`로 일치했다. 열린 PR·고유 변경·worktree를 확인한 뒤 병합된 `codex/release-2.0.3`과 `replit-agent` 브랜치를 정리했다. 세 곳에 main만 남았으며 기존 stash 12개와 이번 보존본 1개, detached `unified-posts-check` worktree와 보존 태그는 유지했다.

완료 기록은 앱 산출물을 바꾸지 않는 문서 전용 후속 커밋으로 main에 반영한다. 그 이후의 최종 세 환경 SHA·미커밋·브랜치·태그 확인은 `.superpowers/release-2.0.3-20261111/completion.json`에 기록하며 운영 후보나 태그를 이동하지 않는다. 캐시·빌드·검증 증거와 `attached_assets/` 등 기존 Git 제외 자료는 커밋·삭제하지 않았다.

22:37 KST 후속 문서 6개의 상대 링크 160개·앵커 79개와 `git diff --check`를 확인했다. 실제 배포 후보 이후의 차이가 Markdown 문서뿐이며 앱 코드·설정·의존성이 같으므로 코드 검사와 배포를 반복하지 않는다.

## 운영 배포와 smoke

Replit `publish_app`으로 Republish를 요청했다. deployment ID `eb4a4e6a-1633-4882-8ee8-c1e1b9313e8b`는 이전 배포와 재사용되므로 ID만으로 새 배포를 판단하지 않았다. `pending → building → running → promoting → success` 전환과 2026-11-11 22:31:17 KST 성공 상태, 새 후보 자산 일치를 확인했다.

22:31:54 KST [운영 홈페이지](https://dgkma.org)의 비로그인 HTTP 확인 107건이 통과했다.

- 공통 `PUBLIC_PAGES`의 현행 공개 페이지 17개: HTTP 200·HTML·제목·canonical·새 진입 자산 확인. `/about/intro`는 자신의 주소, `/`·`/about`은 `https://dgkma.org/` canonical을 확인했다.
- 사이트맵 1개: 현행 공개 주소를 canonical 기준으로 중복 없이 포함했다.
- 게시판·명부 API 2개: 비로그인 요청에 JSON 401을 반환했다.
- 정적 자산 87개: 검증한 후보의 SHA-256과 모두 일치했다. 동적 SEO가 적용되는 index HTML은 원본 해시 대신 위 HTML 검사로 확인했다.

DB·Secret 변경과 실계정 QA는 수행하지 않았다. 소개 본문·드롭다운·사진첩 첫 진입·회원 헤더의 실제 클릭이나 CSS 렌더링은 이번 HTTP 검사로 확인하지 않았다. 개발 캐시 로딩 비교는 앞선 개발 기록이며 운영 속도 측정으로 주장하지 않는다. 후속 문서 기록만을 위한 추가 빌드·배포는 수행하지 않는다.
