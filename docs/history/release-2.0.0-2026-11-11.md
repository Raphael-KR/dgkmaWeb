# 2.0.0 릴리스 — 2026-11-11

## 승인과 완료 조건

- 목표: 권리회원 단톡방, 공개홈 메뉴 개편과 현재 미커밋 문서·스킬을 하나의 릴리스로 반영한다.
- 범위: 전체 미커밋분 검토·정리, Replit 후보 검사, 버전·변경 기록, commit·push·PR·main 병합, Republish·비로그인 smoke, 태그와 세 환경 main·브랜치 마무리.
- 완료 조건: 검사한 후보와 실제 배포 소스를 대조하고 새 배포 성공·요청 범위의 smoke를 확인한다. 후속 기록까지 반영한 로컬·GitHub·Replit main의 SHA가 같고 Git 관리 대상 미커밋분과 main 외 브랜치가 없어야 한다. 실제 배포 후보·태그는 최종 문서 커밋과 구분한다.
- 제외: DB 구조·데이터·회비 판정 변경, 실계정 QA·실제 단톡방 가입, 사진·수상자 자료 반영, 외부 수집·유료 API 호출, 개발 서버 별도 재시작과 자동 롤백.
- 검증: Replit에서 변경 파일 lint·서식, 타입·의존 경계, 기존 라우팅·모듈 조립·파일 기반 문서 검사와 최종 버전 빌드를 수행한다. 동일 소스·조건의 유효한 결과는 재사용한다. 운영은 비로그인 HTTP·canonical·회원 API 차단·후보 자산을 확인한다.

## 시작 상태와 버전

로컬·GitHub main은 `31655216981de77b8f2d0594bfb1a1614d19863a`, Replit main은 같은 tree의 게시 메타데이터 커밋 `b1e39fbf88c47bb851236f3298953e465bc6fef9`다. 양쪽 미커밋 파일 25개의 상태와 해시가 일치했다. Replit의 `replit-agent`와 기존 detached 검사용 worktree·stash는 내용을 확인해 보존한다.

GitHub의 마지막 번호 태그는 `v1.1.0`이며 기존 패키지는 `1.0.0`이다. 과거 번호 불일치는 보존하고, `/about/intro`·`/history`의 리다이렉트 없는 제거를 포함하므로 확정된 규칙에 따라 이번 후보를 `2.0.0`으로 정한다. 새 배포 전 확인한 deployment ID는 `eb4a4e6a-1633-4882-8ee8-c1e1b9313e8b`이며 이 과거 success를 이번 배포 결과로 사용하지 않는다.

## 정리와 검사 범위

- 중복 소개 페이지·lazy export·라우트·공개 메타데이터·사이트맵 연결을 제거하고 내부 링크를 `/about`으로 맞췄다. `/history` 별칭은 제거했다. 앱·공통 정의·서버·스크립트에서 폐기된 연결의 잔존 여부를 확인했다.
- 명부의 준비 중 카드는 서버 권한 판정 후 단톡방 주소를 받는 카드로 대체했다. 공개 카카오 채널과 권리회원 초대 주소의 설정·표시를 분리하고 기존 회비 판정을 재사용했다.
- 실제 사용 중인 `/info`·`/executives`·`/officers`·`/bylaws` 별칭, 회원 접근 경계, 기존 본문·명부·수집기 저장 계약과 설계 미리보기 서비스는 유지한다.
- 라우팅 검사는 삭제된 페이지를 대상에서 제외하고 유지되는 임원명단 경로를 사용한다. 브라우저 복구 스크립트의 대상도 같은 경로로 맞췄다. 검사 자체를 삭제하거나 차단 조건을 낮추지 않았다.
- `check`에 포함된 경계 검사와 `build`에 포함된 청크 검사는 별도로 반복하지 않는다. 무관한 전체 회귀·모바일 측정·DB 시험은 추가하지 않는다. 기존 라우팅 대역은 재사용하며 새 시험 DB·시험 데이터는 만들지 않는다.
- 단톡방의 실제 회원별 화면·참여 결과와 브라우저 복구 동작은 이번 비로그인 smoke로 검증됐다고 보고하지 않는다. Secret은 값 노출 없이 설정 연결만 확인한다.

실행 증거는 ignored `.superpowers/release-2.0.0-20261111/`에 보존한다. 아래 결과에는 실제 완료한 단계만 기록한다.

## 후보 검사 결과

2026-11-11 Replit 개발 워크스페이스(Node 20.20.0, npm 10.8.2)에서 다음을 수행했다.

| 검사 | 결과 |
|---|---|
| 변경 JS/TS 15개 파일 ESLint·Prettier | 통과 |
| `npm run check` | 타입·의존 경계 통과 |
| 기존 라우팅·모듈 조립·문서 검사 | 12건 통과. 기존 메모리 대역을 사용하며 실제 회원·DB 조회는 하지 않음 |
| `npm run build` | 버전 2.0.0의 Vite·청크 예산·서버 번들 통과 |
| `git diff --check` | 통과 |

`check:tests`는 기대 URL만 바뀌고 테스트 타입 계약은 바뀌지 않아 별도로 실행하지 않았다. 브라우저 복구·모바일 측정·전체 회귀·실계정 QA는 미실행이다. 빌드 중 `LC_ALL` locale 경고가 있었으며 명령은 종료 코드 0으로 완료됐다. 검사 도구 버전·명령·소스 해시와 원본 로그는 위 증거 디렉터리에 보존한다.

서버 전용 `KAKAO_RIGHTS_GROUP_INVITE_URL`의 존재와 기존 검증 함수의 형식 통과를 값 출력 없이 확인했다. 실제 권리회원의 주소 수신·단톡방 가입은 확인하지 않았다. 새로운 Secret 값이나 DB 변경은 추가하지 않았다.

검사 도구는 ESLint 10.14.0, Prettier 3.9.10, TypeScript 5.6.3, Vite 6.4.3, tsx 4.23.13, esbuild 0.25.12였다. 명령은 `npx --no-install eslint <변경 파일 15개>`, `npx --no-install prettier --check <같은 파일>`, `npm run check`, `node --import tsx --test client/src/app/routing/router.test.ts server/tests/module-composition.test.ts server/tests/final-recheck-documentation-contract.test.ts`, `npm run build`, `git diff --check`다. 전체 인수와 파일별 소스 해시는 `checks.json`, 빌드 manifest·자산 해시는 `candidate.json`에 보존했다. 문서 마감 수정 후에는 파일 기반 문서 6건만 재검사했고 후보 문서 9개의 상대 링크·앵커 252개를 확인했다. 앱 검사와 빌드는 같은 소스의 결과를 재사용했다.

## 운영 배포와 smoke

- [PR #32](https://github.com/Raphael-KR/dgkmaWeb/pull/32)의 앱 후보는 `613b084daeb96841747a63c23b722fc714cf2c5c`, 병합·실제 배포 후보는 `5fb11deb7c1aa3c99f3baabc07979a76693b09eb`다. tree는 `9f76b4f1d1235df549d2fad60c5e518ead15e07a`로 같다. 병합 시 충돌·리뷰 지적·등록된 status/check-run·PR workflow 실행은 없었으며, 이를 CI 통과 건수로 계산하지 않았다.
- GitHub main을 로컬·Replit에 fast-forward한 뒤 소스 파일 550개의 SHA-256을 대조했다. 후보에 포함된 Replit 직접 반영본은 이미 PR에 커밋됐음을 확인하고 snapshot `72d4b5ef6ffa60f641f6626c5a54555eba8bef1d`로 추가 보존했다. 제외할 변경을 숨긴 것은 없다.
- Replit `publish_app` 후 `pending → building → running → promoting → success`를 관찰했다. 성공 확인은 **2026-11-11 05:12:31 KST**, 운영 주소는 [dgkma.org](https://dgkma.org/)다. 커넥터가 반환한 deployment ID `eb4a4e6a-1633-4882-8ee8-c1e1b9313e8b`는 이전 배포와 같았다. 새 ID로 잘못 기록하지 않고 이번 상태 전환·새 게시 커밋·후보 자산 일치로 새 소스의 운영 반영을 확인했다.
- **05:12:58 KST 비로그인 smoke 114건 통과**: 현재 `PUBLIC_PAGES`의 공개 페이지 16개와 연도 선택 사진첩 URL 1개, 사이트맵 1개, 회원·관리자 API 401 응답 11개, 정적 자산 SHA-256 85개. `/`·`/about`의 canonical은 `https://dgkma.org/`, 다른 공개 페이지는 각자 주소였다. 사이트맵은 현행 canonical 15개와 일치하며 삭제된 두 주소가 없었다.
- 단톡방과 등급 API의 비로그인 응답은 401, `private, no-store`였고 초대 URL을 반환하지 않았다. 회원 권한별 실제 요청·주소 수신, 단톡방 가입, 화면 상호작용·브라우저 복구, 외부 수집·OpenAI 호출은 확인하지 않았다. 실계정 QA·사진·수상자 자료 반영은 계속 보류한다.
- DB·Secret 변경과 개발 서버 별도 재시작은 하지 않았다. 기존 App Secret의 존재·형식 확인과 배포 적용을 실제 권리회원의 링크 수신 검증으로 대신하지 않는다.

## Git 통합·태그와 보존

- annotated tag `v2.0.0`은 실제 배포 후보 `5fb11deb7c1aa3c99f3baabc07979a76693b09eb`를 가리킨다. GitHub에 이 태그만 push했고 로컬·GitHub·Replit의 같은 대상을 확인했다. 완료 문서 커밋으로 태그를 옮기지 않는다.
- Replit이 만든 `4129e9ed9c0cba74bc5db79331ba38906f30b09f`와 `09eee0094cbb49304732d27313c6f29d5bdcda9e`는 같은 후보 tree의 게시 이력이다. 번들을 검증하고 main에 fast-forward해 push했다. 배포 이전의 `b1e39fb`·`ecefee1`도 PR 이력에 보존했다.
- 열린 PR과 활성 worktree, 미병합 커밋을 확인한 뒤 로컬·GitHub의 `codex/release-2.0.0`, Replit의 `replit-agent`를 제거했다. 모두 main에 보존된 커밋이며 강제 삭제·hard reset·force push는 사용하지 않았다. 원격 ref를 prune하고 서버의 실제 refs를 다시 조회했다.
- 브랜치 정리 시점의 세 환경 main은 `09eee0094cbb49304732d27313c6f29d5bdcda9e`로 같고 main만 남았다. 이 완료 기록은 앱에 영향 없는 후속 문서 커밋으로 관리하며 재배포하지 않는다. 마지막 main·dirty·태그·브랜치 대조는 증거 디렉터리의 `completion.json`에 기록한다.
- Replit의 기존 stash 8개와 이번 후보 snapshot 1개, detached `unified-posts-check` worktree(`f8743fa`)를 보존했다. `.superpowers/`의 원본·검사 기록·Git 번들, 무시된 의존성·캐시·빌드는 소스 커밋 대상에서 제외하고 삭제하지 않았다. Git 관리 대상 코드·문서의 제외 항목은 없다.
