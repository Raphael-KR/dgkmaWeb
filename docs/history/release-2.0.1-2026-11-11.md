# 2.0.1 릴리스 기록

- 목표: 커뮤니티 노란색 테마와 누적 미게시 변경을 운영에 반영한다.
- 범위: 전체 미커밋분·미게시 커밋, 버전·변경 이력, PR·main 병합, Replit 배포·태그와 세 환경 Git 마무리.
- 완료 조건: 새 배포 성공과 비로그인 smoke·후보 자산 일치, 로컬·GitHub·Replit main 일치, 프로젝트 미커밋분과 main 외 브랜치 정리.
- 제외: DB·Secret 변경, 실계정 QA, 사진·수상자 자료 반영, 실제 카카오·Sheets·OpenAI 호출.
- 검증: 검사 카탈로그의 공통 필수와 아래 영향별 선택 검사. 동일 입력의 정적 결과는 해시·설정·도구 일치를 확인해 재사용한다.

## 승인·시작 상태

2026-11-11 사용자의 “릴리스 하라” 요청을 [프로젝트 릴리스 스킬](../../.agents/skills/dgkma-release/SKILL.md)과 [운영 기준](../../replit.md#전체-미커밋분과-git-마무리)의 전체 릴리스 범위로 수행한다. 실계정 QA 보류는 유지한다.

마지막 운영 버전은 `2.0.0`, 태그 후보는 `5fb11deb7c1aa3c99f3baabc07979a76693b09eb`, tree는 `9f76b4f1d1235df549d2fad60c5e518ead15e07a`다. 시작 시 Replit API에서 기존 deployment `eb4a4e6a-1633-4882-8ee8-c1e1b9313e8b`의 success를 확인했다. 이는 새 배포 결과가 아니다.

로컬 main `3e93527`에는 미게시 정리 커밋 1개와 테마 관련 미커밋 파일 8개가 있었다. GitHub·Replit main은 `51ead53`이며, Replit의 누적 작업 사본과 로컬 소스 539개 파일의 해시가 같았다. 양쪽 로컬 브랜치와 GitHub 원격 브랜치는 main뿐이다. Replit의 기존 보존 stash 10개, detached 보존 worktree와 gitsafe-backup 추적 참조는 삭제 대상 브랜치와 구분해 유지한다.

## 변경·정리·보존 판단

표시 수정과 기존 계약을 유지하는 정비를 묶어 PATCH `2.0.1`로 올린다. 패키지·lockfile·CHANGELOG를 같은 릴리스 후보에 포함한다.

- 회원 테마는 `AppShell`의 기존 회원 화면 판정을 재사용한다. 공통 헤더·메뉴는 CSS 변수로 노란색과 주황색을 구분한다. 공개 `/about` 화면·반응형 배치·회원 권한은 유지한다.
- 공개 테마 클래스의 선언·TSX 소비자를 함께 이름 변경했다. 이전 색상명 별칭의 현재 참조는 없으며 호환 클래스는 남기지 않는다.
- 테스트 전용 `createInMemoryEventParseQuota`와 호출을 함께 제거했다. 앱의 `consumePostgresEventParseQuota` 기본값과 테스트용 quota 함수 주입·429·동시 처리 해제 계약은 유지한다.
- 폐기한 UI 문자열·문서 제목·중복 assertion, 모바일 측정/과거 baseline 검사와 고정 청크 차단은 현재 기능·회귀를 보호하지 않아 제거했다. 남은 입력·권한·DTO·개인정보·OAuth·저장 호환·DB 경쟁 검사는 서로 다른 위험을 보호한다. Vite 기본 경고는 유지한다.
- CDP 보조의 유일 소비자인 오래된 탭 복구 스크립트가 callback·timeout을 명시적으로 전달함을 확인했다. 사용하지 않던 기본 인수만 제거했고 실제 브라우저 복구 검사는 유지한다.
- 공개 규정 원문·마이그레이션·릴리스 이력, `shared/schema.ts` 서버 호환 export, Replit에서 실행 중인 설계 미리보기와 외부 주입 Umami 계약은 보존한다. 이번 변경으로 추가 제거할 무관한 기능은 발견하지 않았다.

자세한 검사 정리 근거는 [첫 정리](check-audit-2026-11-11.md), [후속 축소](essential-checks-2026-11-11.md), [스타일·문서 정리](readability-cleanup-2026-11-11.md), [회원 테마](community-theme-2026-11-11.md)를 따른다. 해당 문서의 미배포·미커밋 표현은 당시 상태이며 이번 결과와 구분한다.

## 후보 검사 선택

Replit 개발 환경에서 수행한다. 기존 합성 fixture·메모리 대역·loopback HTTP만 사용하고 새 시험 DB나 실제 회원 데이터를 만들지 않는다. DB opt-in 변수가 없는지 값 노출 없이 확인하며 혼합 파일의 DB 사례는 skip으로 보고한다.

| 범위 | 선택 이유·명령·부수 효과 |
|---|---|
| 문서·사용처·공백 | 변경 전후·현재 참조·링크와 `git diff --check`. 파일 읽기 |
| 변경 코드 lint·서식 | 이전 검사 로그와 파일/설정 해시가 일치하는 결과 재사용. 일치하지 않는 파일만 설치된 ESLint·Prettier로 검사 |
| 앱 타입·경계 | 변경 AppShell·공통 스타일 소비자를 포함한 `npm run check`. 경계 검사 별도 반복 없음 |
| 테스트 타입 | `npm run check:tests`의 기존 입력과 이번 실제 import 의존성을 대조해 재사용 가능 여부 판단 |
| 기능·검사 정비 | 변경한 실행형 검사와 수정한 보조 파일의 소비자인 OAuth 흐름·개발 DB 대상 대역 검사를 선택. `node --import tsx --test <선택 파일>` |
| 릴리스 빌드 | 버전·lockfile·최종 후보로 `npm run build`. `dist` 갱신, 서버 시작 없음 |
| 운영 smoke | 새 배포의 공개 페이지 HTTP·canonical, 회원 API 401, 후보 정적 자산 해시 확인. 비로그인 GET만 사용 |

선택한 테스트는 router, category-policy, kakao-admin-config, korea-date, auth-middleware, event-parse-limiter, event-source-reader, obituary-parser, client-user, kakao-oauth-routes, kakao-oauth-state, alumni-sync-plan, alumni-sync-routes, development-db-target, module-composition, privacy-logging, route-security, security-source-contract, shared/contracts/parity의 기존 19개 파일이다. 정확한 명령·파일 목록은 `.superpowers/release-2.0.1-20261111/selection.json`과 검사 로그에 보존한다.

실제 DB 6개 전용 파일과 혼합 파일의 DB 사례, 브라우저·실계정 QA는 미실행으로 둔다. DB 구현·저장 계약은 바뀌지 않았고 수정한 DB fixture·opt-in은 타입/대역 검사 범위로만 확인한다. 이번 변경과 무관한 전체 회귀, 역사관 자료·sandbox 빌드는 추가하지 않는다. 화면 표시의 실계정 확인과 실제 DB 경쟁/보존의 공백을 다른 검사 통과로 대신하지 않는다.

## 실행 결과

### 첫 후보 검사와 정정

18:30 KST Replit 앱 타입·경계는 통과했다. 테스트 타입 검사의 실제 소스·설정 입력 161개가 11:08 KST 통과 기록과 같아 재사용했다. 선택한 19개 파일의 109개 사례 중 104개 통과, 3개 실패, 실제 DB 2개 skip이었다. 실패는 `event-source-reader.test.ts`의 정상 수집·삭제된 링크·비공개 주소 차단 사례에 한정됐다.

현재 `EventSourceStatus`의 선택 필드 `diagnostics`는 값이 없으면 JSON 응답에 포함되지 않는다. 세 사례는 객체의 `diagnostics: undefined` 보유 여부까지 비교해 실패했다. 실패를 삭제하거나 수집 코드를 바꾸지 않고, 세 결과를 응답 JSON 표현으로 비교하도록 수정한다. URL·상태·메서드·안내·원문과 fetch 미호출 검증은 유지하며 값이 있는 진단 정보도 비교에서 제거하지 않는다. 수정 파일의 lint·서식·테스트 타입과 해당 테스트만 재실행하고 통과한 다른 사례는 반복하지 않는다.

이 첫 검사 시점에는 Git 통합·새 배포·태그와 운영 smoke를 수행하기 전이었다. 이후 결과는 아래에 구분한다.

### 최종 후보 검사

Replit Linux·Node `v20.20.0`·ESLint `10.14.0`·Prettier `3.9.10`·TypeScript `5.6.3`에서 18:30~18:33 KST에 확인했다. 패키지·lockfile 세 버전은 `2.0.1`로 같고 lockfile의 의존성 내용은 바뀌지 않았다.

| 검사 | 최종 결과·재사용 근거 |
|---|---|
| Lint·서식 | 변경 코드 44개 lint·45개 서식의 기존 통과와 파일 해시·설정·도구 버전 일치 확인. 이후 수정한 `event-source-reader.test.ts`만 두 검사 재실행·통과 |
| 앱 타입·의존 경계 | `npm run check` 통과. 이후 변경은 테스트·문서뿐이므로 결과 재사용 |
| 테스트 타입 | 최초 입력 161개 일치로 11:08 KST 결과를 재사용했으나 검사 파일 수정 뒤 `npm run check:tests` 재실행·통과 |
| 선택 기능 검사 | 최초 19개 파일 104 통과·3 실패·2 DB skip. 정정한 수집 파일 재실행 후 최종 고유 사례는 107 통과·2 DB skip. 다른 18개 파일 결과는 재사용 |
| 빌드 | `npm run build` 통과, 정적 파일 86개 생성. 셸의 `LC_ALL` locale 안내 1건이 있었으며 Vite·서버 번들 오류는 없음 |
| 문서·스킬 | 변경 문서 19개·상대 링크 423개 확인. 변경 없는 스킬은 11:58 KST 형식 검사 이력과 해시 일치를 확인해 재사용 |
| 공백·소스 | 로컬·Replit `git diff --check` 통과. 검사한 소스·선택 파일·명령·설정과 빌드 자산 해시를 `.superpowers/release-2.0.1-20261111/`에 보존 |

첫 실패 로그는 보존하며 기능 테스트 결과를 정적 검사로 보고하지 않는다. 새 DB·시험 fixture 파일·외부 provider 호출을 추가하지 않았다. 저장소의 기존 테스트 대역은 메모리/loopback에서만 사용했다.

## 운영 배포와 smoke

- [PR #33](https://github.com/Raphael-KR/dgkmaWeb/pull/33)의 후보는 `d07d4d5cc855be4ae7092c8d01012951c1b362e6`, 병합·실제 배포 후보는 `bbcd4d6ccdd4e19cada072896086a5b6451c9031`이다. 두 tree는 `d6bfcc4d9992ec0c0926ec0081f3b0dcfa016582`로 같다. 병합 직전 리뷰 지적·등록된 status·PR workflow 결과가 없었으며 이를 CI 통과로 계산하지 않았다.
- GitHub main을 로컬·Replit에 fast-forward한 뒤 후보 파일 540개 해시가 일치했다. 직접 반영한 Replit 작업본은 이미 PR에 포함됐음을 대조하고 snapshot `7d9b6f287f13950ee281291f3b0fcc1d44b4f2b5`로 보존했다. 제외할 소스 변경을 숨긴 것은 없다.
- Replit `publish_app` 요청 후 `pending → building → running → promoting → success`를 관찰했다. **2026-11-11 18:47:11 KST**에 운영 주소 [dgkma.org](https://dgkma.org/)의 배포 성공을 확인했다. 커넥터의 deployment ID `eb4a4e6a-1633-4882-8ee8-c1e1b9313e8b`는 이전과 같았다. 새 ID로 기록하지 않고 이번 상태 전환·게시 커밋·새 후보 자산의 일치로 운영 반영을 확인했다.
- 비로그인 GET으로 현행 `PUBLIC_PAGES`의 공개 페이지 16개, 사이트맵 1개, 보호 API 4개와 정적 자산 85개를 확인했다. `/`·`/about` canonical은 `https://dgkma.org/`, 하위 페이지는 각자의 주소이며 사이트맵은 현행 canonical 15개와 일치했다. `/api/posts`·`/api/alumni`·`/api/admin/statistics`·`/api/membership/kakao-group`는 401이었다. 단톡방 응답은 `private, no-store`이며 초대 주소를 노출하지 않았다.
- 18:47:50 KST 첫 smoke에서 HTTP·자산 해시는 모두 맞았지만, CSS 확인 보조의 공백 없는 문자열 가정 1건이 실패했다. 운영 CSS의 실제 선언 `--site-brand-background: var(--kakao)`를 확인하고 선언값의 공백을 정규화해 비교했다. 최초 결과를 보존하고 CSS 한 건만 다시 조회했다. 나머지 105건은 같은 배포 결과를 재사용해 **18:48:48 KST 최종 106건 통과**로 기록한다.
- 운영 주 CSS에 `.theme-member`의 노란색 `#fee500` 연결과 짙은 글자 테마가 포함됐고 모든 정적 자산 SHA-256이 Replit 후보 빌드와 같았다. 이는 회원 로그인 화면·Safari 도구 막대·반응형 상호작용의 실제 확인을 대신하지 않는다. 실계정 QA·사진·수상자 자료 반영과 실제 수집·OpenAI·카카오·Sheets 호출은 보류했다.
- DB·Secret 변경과 개발 서버 별도 재시작은 수행하지 않았다. 배포 성공·HTTP 결과·선택 검사·해시 원본은 `.superpowers/release-2.0.1-20261111/`에 보존한다. 오래된 smoke의 고정 경로·검사 건수는 재사용하지 않고 현재 페이지 정의와 이번 변경 범위로 대상을 정했다.

## Git 통합·태그와 보존

- annotated tag `v2.0.1`은 실제 배포 후보 `bbcd4d6ccdd4e19cada072896086a5b6451c9031`를 가리킨다. 이 태그만 push했으며 로컬·GitHub·Replit의 같은 대상을 확인했다. 완료 문서 커밋으로 태그를 옮기지 않는다.
- Replit 게시 커밋 `d5b3f076e33f0ecb60e55dfcd800370174bbc3f9`와 `55922c061b9abdc6724c256a3e0453af9d2156bc`는 후보와 같은 tree다. Git 번들을 검증하고 두 게시 이력을 main에 fast-forward해 GitHub에도 보존했다.
- PR 병합·고유 커밋·활성 worktree를 확인하고 로컬·GitHub의 `codex/release-2.0.1`과 Replit의 `replit-agent` 브랜치를 제거했다. 두 브랜치의 커밋은 main에 모두 포함돼 있으며 강제 push·hard reset·강제 브랜치 삭제는 사용하지 않았다. 원격 추적 참조도 prune했다.
- 브랜치 정리 직후 로컬·GitHub·Replit main은 `55922c061b9abdc6724c256a3e0453af9d2156bc`로 일치했고 main 외 브랜치와 Git 관리 대상 미커밋분은 없었다. 완료 기록은 앱에 영향 없는 후속 문서 커밋으로 반영한다. 이 문서 커밋은 재배포하지 않으며 마지막 main·dirty·태그·브랜치 대조를 증거 디렉터리의 `completion.json`에 기록한다.
- 완료 문서 6개의 상대 링크·문서 앵커 193개와 `git diff --check`를 확인했다. 운영 적용 이후 추가 코드 변경은 없으며 완료 문서 때문에 앱 검사·빌드를 반복하지 않는다.
- 기존 Replit stash 10개와 이번 후보 snapshot 1개, detached `unified-posts-check` worktree(`f8743fa`), `gitsafe-backup` 보존 참조를 유지했다. `.superpowers/`의 원본·검사·Git 번들과 무시된 의존성·캐시·빌드는 커밋 대상에서 제외하고 삭제하지 않았다. Git 관리 대상 코드·문서의 제외 항목은 없다.
