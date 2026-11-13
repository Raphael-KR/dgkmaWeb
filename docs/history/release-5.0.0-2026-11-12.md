# 5.0.0 릴리스 수행 기록

- 목표: 인증 완료 회원의 관리자 정보 표시와 명부 가져오기 변경을 운영에 반영한다.
- 범위: 프로젝트 미커밋분 전체, 버전·변경 기록, 커밋·push·PR·main 병합, Replit 배포와 Git 마무리.
- 완료 조건: 후보 검사, 새 배포의 비로그인 HTTP·자산 확인, 버전 태그, 로컬·GitHub·Replit main 일치와 main 외 브랜치 정리.
- 제외: DB 구조·데이터·Secrets 변경, 실제 Sheets 동기화·카카오 호출·실계정 QA. 기존 stash·detached worktree·검증 기록은 보존한다.
- 검증: [검사 카탈로그](../runbooks/feature-checks.md)의 공통 필수 검사와 아래 영향별 검사. 실제 결과를 단계별로 기록한다.

## 후보와 버전

2026-11-12 사용자의 `릴리스 하라` 요청에 따른다. 시작 기준은 운영 `4.0.0` 후보 `696525def85aa8e4acd0c4f6a406b17aa64d9c82`, 세 환경 main `e58033fff31d878c86123e49da11c8dcf2f9df04`다. 로컬·Replit의 미커밋 30개 파일과 프로젝트 파일 596개가 일치했다. GitHub에는 열린 PR과 main 외 브랜치가 없었다.

`GET /api/admin/pending-registrations?status=approved`는 심사 후보 `review` 대신 회원 정보 `profile`과 실제 연결 명부 `linkedAlumni`를 제공한다. 응답 계약의 비호환 변경에 따라 MAJOR를 올려 `5.0.0`을 선택한다. 대기·거부 심사, 기존 회원 권한과 상태 전환은 유지한다.

DB 구조 변경은 없다. 개발 Helium·운영 Neon 구성을 유지하며 인프라 전환은 실행하지 않는다. 앞서 승인·실행한 명부 초기화는 [별도 기록](alumni-reset-2026-11-12.md)으로 보존하고 이번 릴리스에서 반복하지 않는다. Replit의 7일 복구를 기본으로 하고 별도 백업을 만들지 않는 결정도 지침·런북·릴리스 스킬에 포함한다. 실제 복구 설정을 새로 확인하거나 변경했다는 의미는 아니다.

## 코드·문서 사용처 검토

- 인증 완료 회원은 `matchedUserId`로 실제 연결된 명부만 조회한다. 이름·핸드폰 후보 검색은 대기·거부 심사에 유지한다. 회원 정보를 가상의 신청 정보로 바꾸던 `memberReviewRegistration`과 승인 목록에만 쓰던 대조 분기를 제거했다.
- 서버의 명부 조회 컬럼과 화면의 명부 항목 표시를 공통 모듈로 묶었다. 승인 목록에서 주소·전화번호를 조회·반환하지 않으며, 핸드폰을 포함한 나머지 10개 항목을 표시한다. 대기·거부 심사의 12개 관리 항목과 양쪽 값 대조는 유지한다.
- Google Sheets `통합주소록`의 10개 컬럼만 가져온다. 주소·전화번호의 추출·비교·쓰기만 제거하고 기존 DB 컬럼·값·회원 연결은 보존한다. 승인 취소에 쓰는 `memberRegistrationData`, 동기화 advisory lock·fingerprint 재확인·트랜잭션은 실제 사용처가 있으므로 유지한다.
- 제품 정책·API/구조·DB 계약·운영 절차와 현재/과거 기록을 대조한다. 실제 DB 전환용 과거 스크립트는 구체적인 사용 이력을 보존하며, 추가 백업을 만드는 과거 명령을 기본 릴리스 절차로 실행하지 않는다.
- 비밀정보·캐시·빌드·검사 로그 등 Git 제외 자료는 커밋하지 않는다. 기존 stash 15개·detached worktree·목업 서비스와 보존 태그는 이번 브랜치 정리 대상이 아니다.

## 검사 선택과 공백

| 검사 | 선택 이유·환경·부수 효과 |
|---|---|
| 변경 소스 ESLint·Prettier, `npm run check`, `npm run check:tests` | Replit에서 변경 코드·공유 계약·테스트 타입 및 의존 경계를 분석. 앱·DB 실행 없음 |
| `npm run build` | 5.0.0 버전을 포함한 실제 배포 산출물 생성. 서버 시작·DB 작업 없음 |
| `server/integrations/google-sheets.test.ts`, `server/modules/registry/alumni-sync-plan.test.ts` | 10개 컬럼 추출·비교와 기존 주소/전화 제외, 오류·중복·fingerprint 보존. 기존 메모리 자료·Sheets 대역만 사용 |
| `client/src/features/admin/__tests__/admin-pending-registration-contract.test.ts` | 공통화로 영향받은 대기 심사 DTO·개인정보 응답 범위. 기존 메모리 자료·loopback HTTP, 실제 계정/DB 없음 |
| `server/tests/module-composition.test.ts` | 조회 모듈 분리 후 저장소 facade의 메서드·descriptor 보존 확인. 모듈만 로드하고 실제 쿼리 없음 |
| `server/tests/privacy-logging.test.ts` | 보호 대상 명부·회원 경로의 로그 소스/AST 분석 |
| 릴리스 스킬 형식, 문서 링크·내용, `git diff --check` | 로컬 파일 읽기. 새 백업 정책과 지침·현재/과거 구분 확인 |
| 운영 smoke | Republish 성공 후 공개 HTML·canonical·회원/관리자 API 401·후보 자산 해시를 비로그인 GET으로 확인 |

위 실행형 테스트는 `node --import tsx --test <위 다섯 파일>`로 실행한다. 정적 검사와 구분한다. 12개 원본 컬럼을 기대하던 기존 검사를 현재 10개 계약에 맞추고 DB 저장 검사의 입력 타입도 맞췄다. 원본 오류·중복·비식별 fingerprint 검사는 실제 회귀를 보호하므로 유지한다. 실패를 감추는 검사 삭제나 무관한 CI 개편은 하지 않는다.

동기화 API의 HTTP 계약·로그인·본문·수집기·브라우저 복구·목업 산출물은 변경하지 않아 관련 전체 회귀를 추가하지 않는다. 실제 개발 DB 쓰기 검사는 실행하지 않는다. 신규 승인 목록의 실제 DB 조회·브라우저 표시, Sheets 실동기화·자료 보존과 실계정 QA는 미검증으로 남기며 대기 DTO 검사나 운영 비로그인 401로 대신하지 않는다.

## 후보 검사 결과

2026-11-12 17:21–17:22 KST Replit 개발 워크스페이스에서 `5.0.0` 후보를 검사했다. 원시 결과·명령·입력 및 산출물 해시는 Git 제외 경로 `.superpowers/release-5.0.0-20261112/`에 보존한다.

- 변경 소스 17개 ESLint·Prettier 통과. `npm run check`의 앱 타입·의존 경계 276개 파일과 `npm run check:tests` 통과.
- 위 다섯 파일의 선택 검사 18건 통과, 실패·skip 0건. Sheets는 대역, 관리자 DTO는 메모리 자료·loopback HTTP로 확인했으며 DB·실계정 검사가 아니다.
- `npm run build` 통과. 클라이언트 entry는 `/assets/index-VA3_RgA3.js`다. 파일 597개의 검사 전후 해시가 같았다. 셸의 기존 `C.UTF-8` locale 경고 외 차단 오류는 없다.
- Node.js `20.20.0`, npm `10.8.2`, TypeScript `5.6.3`, ESLint `10.14.0`, Prettier `3.9.10`, Vite `6.4.3`, tsx `4.23.13`을 사용했다. 의존성 변경 없이 루트 패키지·lockfile의 버전만 갱신했다.
- 로컬 공식 검사기의 릴리스 스킬 형식 검사 통과. 변경 Markdown 15개의 로컬 링크 460개·앵커 158개와 `git diff --check`에서 누락·오류가 없었다.
- GitHub main protection은 설정되지 않았고 ruleset·Actions workflow는 0개였다. 이 상태를 필요한 검사 생략 근거로 사용하지 않았다.

같은 검사 입력을 반복 실행하지 않았다. 검사 후 후보 커밋까지 달라진 파일은 CHANGELOG와 이 수행 기록뿐이며 앱 소스·설정·의존성은 동일했다. 후속 Markdown 기록에는 앱 검사·빌드를 재사용하고 아래 Git·배포 대조를 별도로 수행했다.

## Git 통합과 개발 사본

전체 변경 33개 파일을 `e203a9d5e8edb607b3642e9685ab7d8610449951`로 커밋·push하고 [PR #38](https://github.com/Raphael-KR/dgkmaWeb/pull/38)을 생성했다. 작성자의 코드·문서 사용처 검토와 후보 검사에 더해 GitHub 자동 코드 리뷰가 해당 커밋에서 지적 없이 완료된 것을 확인하고 17:27:11 KST main에 병합했다. 별도 security review·CI check는 실행되지 않았으므로 코드 리뷰 완료와 구분한다.

운영 후보는 `e0034203452c9db3d8d6d2d9872a31681d00143e`, tree는 `fc1ec78f461314899b900b1cae4ca8cb1584b6f5`다. 17:28:15 KST Replit의 직접 개발 변경을 검사한 파일과 대조한 뒤 코드 snapshot stash `eb481f37ff1b54ea7c75d21e185460855fafaa39`로 보존하고 GitHub main을 fast-forward했다. 로컬·GitHub·Replit 후보 SHA, 소스 597개·빌드 산출물 90개와 서버 번들의 해시 일치를 확인했다. 이 stash는 코드 보존이며 DB 백업을 생성한 것이 아니다.

## 운영 배포와 smoke

Replit 연결 도구로 Republish를 한 번 실행했다. 기존 deployment ID `eb4a4e6a-1633-4882-8ee8-c1e1b9313e8b`를 재사용했으며 `pending → building → running → promoting → success` 전환과 **2026-11-12 17:33:43 KST** 성공 상태·`https://dgkma.org`를 확인했다. 기존 ID나 게시 커밋 생성만으로 새 배포 성공을 판단하지 않았다.

17:34:22 KST 운영 비로그인 HTTP 115건이 통과했다.

- 공개 페이지 17개: HTTP 200·HTML·제목·canonical과 후보 entry `/assets/index-VA3_RgA3.js` 일치. `/`·`/about`의 canonical은 `https://dgkma.org/`다.
- 사이트맵 1개: 현재 공개 페이지 canonical 목록 일치.
- 회원·관리자 API 8개: 게시글·명부·댓글·업로드 객체·현재 회원과 가입 상태별 세 목록의 비로그인 GET이 401 JSON으로 차단.
- 정적 자산 89개: 응답의 SHA-256과 후보 빌드 일치. 서버가 메타데이터를 주입하는 `index.html`은 위 HTML 검사로 구분했다.

실제 승인 회원 자료 조회·브라우저 표시·Sheets 동기화·DB 보존/경쟁과 실계정 QA는 실행하지 않았다. DB 구조·데이터·인프라·Secrets 변경도 없다. 개발 서버는 앞선 09:20 KST 재시작을 유지하고 이번 릴리스만을 위한 추가 재시작은 하지 않았다.

## 태그·게시 이력과 Git 마무리

성공·smoke 후 annotated tag `v5.0.0`을 실제 배포 후보 `e0034203452c9db3d8d6d2d9872a31681d00143e`에 생성·push했다. 태그 객체는 `2f9eecedac115f267c04b36838fa160282e4d12e`이며 패키지·lockfile 버전도 `5.0.0`이다. 기존 태그를 이동하거나 보존 태그를 일괄 push하지 않았다.

Replit 게시 커밋 `fefea349226f6ab2fd888555dc68966d0cde8864`·`a02c4ed42f332deced8b2c07f6d563879f343132`의 부모·tree가 후보와 연결되고 소스 변경이 없음을 확인했다. 두 커밋을 bundle로 가져와 로컬·GitHub main에 fast-forward로 보존하고 Replit main도 맞췄다. 병합된 로컬·GitHub의 `codex/release-5.0.0`과 Replit의 `replit-agent`를 삭제했다. main 외 브랜치는 없고 stash 16개·detached worktree·기존 보존 태그·설계 미리보기 서비스는 유지한다.

완료 기록은 Markdown만 바꾸는 후속 커밋으로 반영한다. 최종 main은 이 기록 커밋을 포함하므로 운영 후보·태그와 SHA를 구분하며 다시 빌드·배포하거나 태그를 옮기지 않는다. 후속 기록까지 반영한 로컬·GitHub·Replit 최종 SHA·clean 상태·실제 브랜치 refs·태그 대상·파일 해시 대조의 원시 근거는 `.superpowers/release-5.0.0-20261112/completion.json`에 둔다. 비밀정보·캐시·빌드·검사 로그 등 Git 제외 자료는 커밋하지 않고 로컬에 보존한다.

17:40 KST 후속 문서 5개의 로컬 링크 250개·앵커 98개와 `git diff --check`를 확인했고 오류가 없었다. 코드·설정·의존성은 동일하므로 위 앱 검사·선택 테스트·빌드 결과를 재사용했다.
