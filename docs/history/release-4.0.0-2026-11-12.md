# 4.0.0 릴리스 수행 기록

- 목표: 가입 심사·회원 표시의 누적 변경을 운영에 릴리스한다.
- 범위: 전체 프로젝트 미커밋분, 버전·변경 기록, 커밋·push·PR·main 병합, Replit Republish와 Git 마무리.
- 완료 조건: 후보 검사와 새 배포의 비로그인 확인, 버전 태그, 로컬·GitHub·Replit main 일치 및 main 외 브랜치 정리.
- 제외: DB 구조·실제 회원 상태·Secrets 변경, 실제 카카오 연결 해제, 실계정 QA. 기존 stash·detached worktree·목업 서비스와 로컬 증거를 보존한다.
- 검증: [검사 카탈로그](../runbooks/feature-checks.md)의 공통 필수 검사와 아래 변경 영향 검사. 실제 배포·실행 결과는 단계 완료 후 기록한다.

## 후보와 버전

사용자의 2026-11-12 `릴리스 하라` 요청과 [전체 릴리스 범위](../../replit.md#전체-미커밋분과-git-마무리)에 따른다. 시작 시 운영은 `3.0.0`, 실제 후보·태그 커밋은 `342f57b2121f47fde77fbfba31db7a2bf11d00aa`이고 deployment는 `eb4a4e6a-1633-4882-8ee8-c1e1b9313e8b`였다. 세 사본의 main은 `e5f167d20623f2274881ac70edbcd1e4c936385e`였으며 로컬·Replit 파일 588개가 일치했다.

가입 거부 PATCH의 계약을 즉시 unlink·신청 삭제에서 `rejected` 상태 보존으로 바꾸고, 명시적인 거부 신청 DELETE로 분리했다. 기존 클라이언트가 기대한 응답·처리가 달라지므로 MAJOR를 올려 `4.0.0`을 선택했다. 명부 대조·승인 취소·재심사, 전체 폭 레이아웃·프로필 사진·회원 인증 배지 정리도 포함한다. DB 테이블·컬럼·제약·마이그레이션 변경은 없다.

## 코드·문서 사용처 검토

- 거부 시 탈퇴와 같은 정리를 하던 분기를 상태 전환으로 대체했다. 라우트 → `RouteContext` 주입 → `RegistryStorage` descriptor 조립 → 상태 저장 모듈의 호출을 확인한다. `removeLocalUsers`는 실제 회원 탈퇴에서 사용하므로 보존한다.
- 신청 조회·정규화·명부 대조·관리자 결정·재승인을 각 책임 모듈로 분리했다. 현재 회원 ID·콘텐츠·회비·명부 연결과 신원·전화번호 잠금, 로그인 완료 전 승인 상태 확인을 유지한다. 기존 신청 JSON의 누락·레거시 식별자 처리는 현재 저장 자료를 읽으므로 보존한다.
- 폭 제한 토큰 두 개와 불필요해진 태블릿 최대 폭 분기, 회원 화면의 인증 배지·홈의 별도 이름 원을 제거했다. 공통 컨테이너·Avatar·긴 본문 읽기 폭과 실제 CSS 소비자를 대조한다. 공유 하단 메뉴·테마·공식 Avatar fallback은 유지한다.
- 제품·운영·DB 계약·개인정보 안내·카카오 운영 지침의 거부/삭제 설명을 맞췄다. 구조 문서의 관리자 API 목록에도 새 DELETE·승인 취소 경로를 반영한다. 과거 릴리스·개발 기록은 당시 확인 범위로 보존한다.
- 비밀정보·캐시·빌드·검사 로그를 담은 `.superpowers/`, `node_modules/`, `dist/` 등 Git 제외 자료는 커밋하지 않았다. Replit의 기존 stash 14개와 보존 태그가 있는 detached worktree는 유지했다.

## 검사 선택과 정리

| 검사 | 선택 이유·환경·부수 효과 | 처리 |
|---|---|---|
| 변경 소스 lint·서식, 앱/검사 타입·의존 경계 | Replit의 파일 분석, DB·앱 실행 없음 | 기존 소스·설정·도구가 같은 결과만 재사용. 버전 변경에 영향받는 앱 타입·빌드는 후보에서 확인 |
| `npm run build` | 변경 CSS·클라이언트·서버·APP_VERSION의 실제 배포 산출물, Replit `dist` 생성 | 4.0.0 최종 후보에서 수행 |
| `server/middleware/auth-middleware.test.ts`, `server/modules/registry/admin-pending-rejection-routes.test.ts`, `client/src/features/admin/__tests__/admin-pending-registration-contract.test.ts` | 승인 가드·거부 보존/삭제·응답 개인정보 범위. 기존 메모리 자료·HTTP/Kakao 대역 | 06:01 KST 25건 통과를 입력 일치 확인 후 재사용 |
| `server/tests/route-security.test.ts`, `server/modules/identity/kakao-oauth-routes.test.ts` | 관리자 권한·OAuth 세션과 재로그인 흐름 영향. 기존 메모리 자료·loopback HTTP, 실제 provider/DB 호출 없음 | 변경 영향 선택 실행 |
| `server/tests/module-composition.test.ts`, `shared/contracts/parity.test.ts` | 분리한 저장소 메서드의 facade 연결·공유 계약 | 변경 영향 선택 실행, 모듈/순수 함수만 실행 |
| `server/tests/privacy-logging.test.ts` | 변경 인증·명부 경로의 원문 로그 방지 | 파일·AST 정적 검사 |
| 문서·링크·`git diff --check` | 설명·경로와 현재/이력의 일치 | 변경 문서와 최종 diff 확인 |
| 운영 smoke | 새 deployment의 공개 HTML·canonical·회원 API 401·후보 자산 일치 | Republish 성공 후 비로그인 HTTP만 실행 |

거부 즉시 삭제를 기대하던 검사 소스는 확정된 상태 보존·재심사·별도 삭제 계약으로 수정했다. 승인 가드와 HTTP 권한 검사는 다른 경계이므로 유지한다. 무관한 본문·수집기·명부 동기화 전체 회귀와 변경 없는 브라우저 복구·목업 빌드는 선택하지 않는다. 현재 범위에서 추가 삭제·통합할 중복 검사나 CI 개편은 없다. 같은 후보의 이미 통과한 검사를 반복하지 않는다.

실제 DB 잠금·경쟁·기존 회원 재승인/삭제 보존은 실행 검증하지 않는다. 해당 DB 사례는 신규 fixture를 쓰므로 일반 릴리스 승인으로 실행하지 않으며, 미검증으로 남긴다. 화면 상호작용·실제 카카오·실계정 QA도 보류한다. 대역 테스트나 비로그인 HTTP를 이 경로의 통과로 해석하지 않는다.

## 후보 검사 결과

2026-11-12 Replit 개발 워크스페이스의 `4.0.0` 후보에서 다음 결과를 확보했다. 실행 명령·입력 해시·원시 결과는 `.superpowers/release-4.0.0-20261112/`에 보관한다.

- 06:29 KST `npm run check` 통과: 앱 타입·의존 경계 272개 파일. 테스트 타입은 소스·설정이 동일한 05:51 KST `npm run check:tests` 결과를 재사용했다.
- 06:29 KST 위 다섯 파일의 선택 검사 37건 통과, 실패·skip 0건. 06:01 KST 가입 가드·결정 API·DTO 세 파일의 25건은 동일 입력으로 재사용했다. 새 실행 37건과 재사용 25건을 구분하며 실제 DB 검사는 포함하지 않는다.
- 06:29 KST `npm run build` 통과. 클라이언트 entry는 `/assets/index-DeFEIhri.js`, 서버 번들은 `dist/index.js`, 정적 산출물은 89개다. 입력 해시는 검사 전후 동일했다. 셸의 기존 `C.UTF-8` locale 경고 외 빌드 오류는 없다.
- 변경 소스 35개 중 33개는 파일 해시와 기존 lint·서식 결과를 대조해 재사용했다. 이전 입력 증거를 이 기록에 연결하지 못한 `compare-registration-values.ts`와 `client/src/index.css`는 06:30 KST 필요한 lint·Prettier를 실행해 통과했다. 코드 수정은 없었다.
- 변경 Markdown 15개의 로컬 링크 452개·앵커 139개와 `git diff --check`를 확인했고 누락이 없었다. GitHub의 열린 PR은 없었고 main branch protection·ruleset 및 저장소 내 CI workflow도 없음을 확인했다. 이를 검사 생략 근거로 사용하지 않았다.

재사용 출처는 [가입 상태 개발 기록](registration-states-2026-11-12.md), [프로필 표시 기록](profile-avatar-2026-11-12.md), [전체 폭 기록](fluid-layout-2026-11-12.md)이다. `reused-checks.json`에 파일별 근거를 연결했다. 의존성·검사 설정은 같고 package/lockfile은 루트 버전만 변경했다. Replit Node.js `20.20.0`, TypeScript `5.6.3`, ESLint `10.14.0`, Prettier `3.9.10`, Vite `6.4.3`, tsx `4.23.13`을 사용했다. 새 릴리스 빌드는 이전 산출물로 대체하지 않았다.

## Git 통합과 개발 사본

프로젝트 미커밋 52개 파일을 `08e951f28dbd39a8beee2dae9a57c6d26152550e`로 커밋·push하고 [PR #37](https://github.com/Raphael-KR/dgkmaWeb/pull/37)을 생성·검토·main 병합했다. 병합 후보는 `696525def85aa8e4acd0c4f6a406b17aa64d9c82`, tree는 `fdf68461b189401023b372ca0faaac5698b2bb8f`다. 병합 전 리뷰·코멘트·CI check가 없음을 조회했으며 작업자가 검토한 코드·권한·저장소 주입·문서와 위 검사 결과를 근거로 병합했다.

06:34:43 KST 로컬·GitHub·Replit main을 후보 커밋에 맞추고 Git 관리 파일 589개와 빌드 파일 89개를 대조했다. Replit의 직접 개발 변경은 파일 해시를 확인한 뒤 복구용 stash `d789cf329f5e15bcbd265495377d8bbdad42d704`로 보존하고 GitHub main을 fast-forward했다. 기존 14개와 새 복구용 1개를 합한 stash 15개를 유지한다.

## 운영 배포와 smoke

Replit 연결 도구로 앱 이름·ID를 확인하고 Republish를 한 번 실행했다. deployment ID는 `eb4a4e6a-1633-4882-8ee8-c1e1b9313e8b`를 재사용했으며 `pending → building → running → promoting → success`를 관찰했다. **2026-11-12 06:42:47 KST** 성공 상태와 `https://dgkma.org`를 확인했다. ID가 같다는 이유만으로 새 배포 성공을 판단하지 않았다.

06:43:18 KST 비로그인 HTTP 요청 114건이 통과했다.

- 공개 페이지 17개: HTTP 200·HTML·제목·canonical과 후보 entry `/assets/index-DeFEIhri.js` 일치. `/`와 `/about`의 canonical은 `https://dgkma.org/`다.
- 사이트맵 1개: 현재 공개 페이지의 canonical 목록 일치.
- 회원·관리자 경로 8개: 게시글·명부·댓글·업로드 객체·현재 회원·가입 상태별 세 목록의 비로그인 GET이 401 JSON으로 차단.
- 정적 자산 88개: 운영 응답의 SHA-256과 후보 산출물 일치. 빌드 파일 89개 중 서버가 메타데이터를 주입하는 `index.html`은 위 HTML 검사로 구분했다.

실제 관리자 승인·승인 취소·거부·재심사·삭제, DB 잠금·경쟁·기존 자료 보존과 Kakao unlink는 실행하지 않았다. 사진·레이아웃의 브라우저 대조와 실계정 QA도 보류한다. API의 비로그인 401을 인증된 관리 동작의 성공으로 해석하지 않는다. 이번 릴리스에서 DB 전환·Secrets 변경·데이터 초기화·실제 회원 상태 변경은 하지 않았다. 개발 서버는 앞선 06:02 KST 재시작을 유지하고 릴리스만을 위한 추가 재시작은 하지 않았다.

## 태그·게시 이력과 Git 마무리

성공·smoke 후 annotated tag `v4.0.0`을 실제 운영 후보 `696525def85aa8e4acd0c4f6a406b17aa64d9c82`에 생성·push했다. 패키지·lockfile 버전도 `4.0.0`이다. 태그 객체는 `460f2120b1a1716cdcbca6d977df52518e03b13d`이며 기존 태그를 옮기거나 보존 태그를 일괄 push하지 않았다.

Replit 게시 커밋 `2b7940360c46daea1b6277e9dbffbbe81fd2fea4`·`9f2c3c8cf678668c8e9e8b8c2cdf132ed31d0b5c`의 부모·tree가 후보와 연결됨을 확인했다. 두 커밋 모두 후보와 tree가 같으며 bundle로 가져와 로컬·GitHub main에 fast-forward로 보존했다. 로컬·GitHub의 병합된 `codex/release-4.0.0`과 Replit의 `replit-agent`를 삭제했다. 세 곳의 브랜치는 main만 남겼으며 stash 15개·detached `unified-posts-check` worktree·기존 보존 태그·설계 미리보기 서비스는 유지했다.

CHANGELOG·제품 계획·구조 문서·Replit 현재 상태와 이 완료 기록은 Markdown만 바꾸는 후속 커밋으로 반영한다. 최종 main은 이 기록 커밋을 포함하므로 실제 운영 태그의 SHA와 구분한다. 문서 마무리를 위해 다시 빌드·배포하거나 태그를 옮기지 않는다. 최종 세 환경 SHA·clean 상태·태그 대상과 파일·산출물 일치의 원시 근거는 `.superpowers/release-4.0.0-20261112/completion.json`에 남긴다.

06:48 KST 완료 문서 5개의 로컬 링크 239개·앵커 96개와 `git diff --check`가 통과했다. 후보 이후 차이는 이 Markdown 파일들뿐이므로 앱 코드·의존성·설정 검사는 위 결과를 재사용한다.
