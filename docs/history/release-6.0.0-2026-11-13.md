# 6.0.0 릴리스 — 2026-11-13

현재 정책은 [제품 계획](../product/planning-proposal.md), [본문 편집기](../reference/post-editor.md), 실행 절차는 [Replit 기준](../../replit.md#릴리스-버전-관리-규칙)과 [검사 카탈로그](../runbooks/feature-checks.md)를 따른다. 이 문서는 이번 릴리스의 실행 기록이다.

## 목표와 범위

- 목표: 승인된 편집기 간소화·Markdown 입력 규칙·Safari 글꼴 수정과 전체 미커밋분을 운영에 반영한다.
- 범위: 로컬·Replit의 프로젝트 파일 전체 대조, 후보 정리·검사, 버전·변경 기록, commit·push·PR·main 병합·Republish·태그·Git 마무리.
- 완료 조건: 새 배포 성공과 비로그인 HTTP·자산 일치, 실제 배포 후보의 태그, 세 환경 main SHA 일치·프로젝트 미커밋분 0건·main 외 브랜치 정리.
- 제외: DB 조회·변환·초기화·백업, Secrets·인프라 변경, 파일 업로드·외부 provider 호출, 실계정 QA.
- 검증: Replit에서 변경 파일 lint·서식, 앱/테스트 타입·의존 경계, 본문 변환에 필요한 선택 테스트와 최종 후보 빌드. 배포 후 공개 HTTP smoke.

## 비교 기준과 버전

마지막 실제 배포는 `v5.0.0`, 후보 `e0034203452c9db3d8d6d2d9872a31681d00143e`, tree `fc1ec78f461314899b900b1cae4ca8cb1584b6f5`다. 시작 시 로컬·GitHub·Replit main은 `197bac22df54a2266990373a82e6f83b90e18807`이며 로컬/Replit의 598개 Git 관리 대상 경로와 삭제 상태가 일치했다. 전체 미커밋분은 추적 변경 23개와 새 인라인 마크 모듈 1개였다.

체크리스트 노드를 지원 본문 JSON에서 제거하고 `_내용_`의 Markdown 해석을 기울임에서 밑줄로 바꾸므로 문서화된 입력/저장 계약과 호환되지 않는다. SemVer 규칙에 따라 MAJOR `6.0.0`을 사용한다. 정식 오픈 전 테스트 본문은 사용 조회·호환 변환·완료 상태 보존·백업이 불필요하다는 사용자 결정을 따른다. 이번 릴리스에서 DB를 초기화하지 않는다.

## 제거·보존 검토

- 제거: TaskList/TaskItem의 앱 등록·명령·검증·렌더러·CSS·직접 의존성, Markdown 소스 모드·전용 복사·YouTube 버튼의 세 모듈, 별도 사진 추가 UI와 이미지 전용 업로드 분기, 선택 도구의 불필요한 버튼·아이콘·상태 조회. 사용처·등록·소비자를 대조하고 남은 참조가 없음을 확인했다.
- 보존: StarterKit의 일반 목록을 위한 간접 `extension-list`, 실제 경조사 생성·본문 전환 스크립트에서 쓰는 공통 Markdown 변환과 JSON 비교, 수정 화면의 기존 별도 첨부 표시·해제, 기존 파일 검증·회원/가림 권한. 공식 이미지·표·영상·블록 이동과 기본 키맵을 유지한다.
- 사용자 정의: 공식 Italic·Underline 3.33.0의 입력/붙여넣기 규칙·Markdown 토큰 해석만 확장하며 패키지 소스·키맵은 수정하지 않는다. Placeholder는 세 줄, 도구 폭은 버튼 수에 맞춘다. Safari 로고는 원본 SVG를 보존하고 사이트 글꼴을 상속한다.
- 문서: 제품·편집기·JSONB 앱 스키마·DB 작업 경계를 맞추고 개발 중 기록은 별도 이력으로 분리한다. PostgreSQL DDL은 없다.
- 검사 정리: 삭제된 기능 전용으로 남은 테스트·CI는 없었다. 관련 없는 검사 체계는 변경하지 않는다. 새 입력 계약은 사용자가 제시한 네 Markdown 예문을 그대로 재사용하는 집중 테스트로 보호한다. 신규 회원/게시글/시험 DB·외부 호출용 자료를 만들지 않는다.
- 외부 CI: 시작 시 GitHub Actions workflow 0개, ruleset 0개, main 보호 설정 없음, 열린 PR 0건을 읽기 전용으로 확인했다.

## 후보 검사 결과

| 검사 | 선택 이유·범위 | 환경·부수 효과 | 상태 |
|---|---|---|---|
| 문서 링크·앵커·공백 | 변경 기준서·이력·삭제 참조, `git diff --check` | Mac 파일 읽기 | 통과 |
| ESLint·Prettier | 변경 TS/TSX와 CSS, 새 입력 계약 검사 | Replit 파일 읽기 | 13개 lint·14개 서식 통과 |
| `npm run check` | 공유 본문 스키마와 앱의 타입·의존 경계 | Replit, DB 실행 없음 | 타입·앱 파일 274개 경계 통과 |
| `npm run check:tests` | 공통 Markdown 계약과 추가 검사 타입 | Replit, 테스트 본문 실행 없음 | 통과 |
| `node --import tsx --test shared/editor/post-inline-marks.test.ts server/modules/events/notice-edit.test.ts` | 네 승인 예문의 밑줄/기울임/굵게 JSON·본문 표시와 공통 변환을 소비하는 경조사 미리보기·URL 정정/저장 | Replit 순수 변환·기존 메모리 대역·임시 번들. DB·LLM·수집·카카오 호출 없음 | 23건 통과·실패/skip 0건 |
| `npm run build` | 버전·lockfile 포함 최종 배포 산출물 | Replit dist 생성, 앱/DB 시작 없음 | 통과 |
| 운영 HTTP smoke | 새 배포의 공개 페이지·canonical·사이트맵·회원 차단·후보 자산 | 비로그인 GET, 접근 로그 | 115건 통과 |

2026-11-13 12:11:21~12:12:08 KST Replit에서 위 코드 검사를 수행했다. Node 20.20.0·npm 10.8.2·TypeScript 5.6.3·ESLint 10.14.0·Prettier 3.9.10·Vite 6.4.3·tsx 4.23.13과 lockfile을 사용했다. `C.UTF-8` locale 경고가 있었지만 모든 명령 exit 0이며 코드·타입·번들 경고는 없었다. 새 입력 예문 네 건과 기존 경조사 18개 시나리오·상위 사례를 합쳐 23건이다. 검사 후 601개 관리 경로의 로컬/Replit 파일 해시·삭제 상태를 대조했다. 최초 staged 공백 검사에서 새 개발 이력 파일 끝의 빈 줄 1건을 발견해 제거한 뒤 다시 확인했다.

ESLint 대상은 아래 13개다. Prettier는 같은 파일과 `client/src/components/post-content.css`를 검사했다.

- `client/src/components/post-body-editor.tsx`
- `client/src/components/post-body.tsx`
- `client/src/components/post-editor/editor-file-upload.tsx`
- `client/src/components/post-editor/editor-toolbar.tsx`
- `client/src/components/post-editor/use-document-editor.ts`
- `client/src/features/boards/create-post-dialog.tsx`
- `client/src/features/boards/post-edit-form.tsx`
- `client/src/features/boards/use-create-post.ts`
- `client/src/features/boards/use-post-uploads.ts`
- `client/src/features/home/public-home.tsx`
- `shared/editor/post-document.ts`
- `shared/editor/post-inline-marks.test.ts`
- `shared/editor/post-inline-marks.ts`

이전 개발 정적 검사는 당시 기록으로 보존하며 최종 후보 검사를 대신하지 않는다. 전체 회귀·실제 DB 검사·브라우저 복구 검사는 해당 변경이 없어 선택하지 않는다. 직접 키 입력·클립보드·모바일 첨부·표/영상 조작·Safari 실화면과 실계정 QA는 미검증으로 남긴다.

## Git 통합과 개발 사본

전체 변경 30개 파일을 `d129222677e98a6bc3ce06841f79980bf2d2cf18`로 커밋·push하고 [PR #39](https://github.com/Raphael-KR/dgkmaWeb/pull/39)를 2026-11-13 12:17:02 KST main에 병합했다. 병합 전·배포 후 조회에서 등록된 리뷰/리뷰 댓글과 필수 상태 검사는 없었다. 자동 리뷰가 실행·통과했다고 해석하지 않으며 작성자의 변경·사용처 검토와 Replit 후보 검사 결과를 근거로 병합했다.

실제 운영 후보는 `86b1142d45876473712d968a2abbdf8e4182de0e`, tree `54e9d15c483841cf1626c4072b8b9ea901f66e4a`다. 검사 후 앱 코드·의존성·설정·빌드는 바뀌지 않았고 수정된 Markdown 기록만 재검사했다. 전체 작업 사본 대조 후 Replit의 개발 변경을 코드 stash `49aebbc557a98dc68f4bf69a5ba9f68eb5cede25`에 보존하고 GitHub main을 fast-forward했다. 삭제 세 경로를 제외한 598개 파일과 기존 빌드 산출물 90개의 해시가 일치했다. 이는 코드 보존이며 DB 백업이 아니다.

## 운영 배포와 smoke

Replit 연결 도구로 Republish를 한 번 실행했다. 기존 deployment ID `eb4a4e6a-1633-4882-8ee8-c1e1b9313e8b`를 재사용했으며 `pending → building → running → promoting → success` 전환과 **2026-11-13 12:23:07 KST** 성공 상태·`https://dgkma.org`를 확인했다. 기존 success나 ID만으로 새 배포 성공을 판단하지 않았다.

12:23:38 KST 운영 비로그인 HTTP 115건이 통과했다.

- 공개 페이지 17개: HTTP 200·HTML·제목·canonical과 새 entry `/assets/index-C7T0cqnA.js` 일치. `/`·`/about`의 canonical은 `https://dgkma.org/`이며 하위 공개 페이지는 각자의 주소다.
- 사이트맵 1개: 현재 공개 canonical 목록과 일치.
- 회원/관리자 경로 8개: 게시글·명부·댓글·업로드 객체·현재 회원·가입 상태별 목록을 비로그인 401 JSON으로 차단.
- 정적 자산 89개: SHA-256이 최종 후보와 일치. 메타데이터가 주입되는 `index.html`은 위 HTML 검사로 구분했다.

실제 편집·직접 키 입력·붙여넣기/드롭·모바일 선택·업로드·표/영상·Safari 실화면·실계정 QA는 수행하지 않았다. DB 조회·DDL·데이터 변환/초기화·백업·Secrets·인프라 변경과 개발 서버의 별도 재시작도 하지 않았다.

## 태그·게시 이력과 Git 마무리

annotated tag `v6.0.0`을 실제 운영 후보 `86b1142d45876473712d968a2abbdf8e4182de0e`에 생성·push했다. 태그 객체는 `10240130d1ee084fdffebb3c7d964f030670f0e2`이며 패키지·lockfile 버전은 `6.0.0`이다. 기존 태그는 이동하지 않았다.

Replit 게시 커밋 `f076575417532d09514c43f657ca59b3d641b4e6`·`154e8a7537cf2a9fe362bad073bf0d84094e2d4b`의 부모 관계와 같은 tree를 확인하고 bundle·fast-forward로 로컬·GitHub main에 보존했다. Replit main도 같은 게시 이력에 연결했다. 12:26 KST 병합된 로컬/GitHub `codex/release-6.0.0`과 Replit `replit-agent`를 삭제했고 세 환경 main 외 브랜치는 없었다. 기존 stash 16개와 이번 코드 stash, detached worktree·보존 태그·설계 미리보기 서비스는 유지했다.

이 완료 기록은 Markdown만 바꾸는 후속 커밋으로 반영한다. 최종 main은 기록 커밋을 포함하므로 운영 후보·태그와 SHA를 구분하며 다시 빌드·배포하거나 태그를 옮기지 않는다. 최종 SHA·clean 상태·실제 원격 refs·태그·파일 해시 대조는 `.superpowers/release-6.0.0-20261113/completion.json`, 검사·Git·게시·HTTP 근거는 같은 Git 제외 폴더에 둔다. 비밀정보·캐시·빌드·검사 로그 등 로컬 자료를 일괄 추적하거나 삭제하지 않았다.

12:27 KST 후속 문서 변경 뒤 마지막 배포와 비교한 문서 12개의 로컬 링크 494개·앵커 144개와 `git diff --check`를 통과했다. 완료 커밋의 변경은 Markdown 5개뿐이며 같은 앱 검사·선택 테스트·빌드 결과를 재사용한다.
