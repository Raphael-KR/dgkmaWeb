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
| 운영 HTTP smoke | 새 배포의 공개 페이지·canonical·사이트맵·회원 차단·후보 자산 | 비로그인 GET, 접근 로그 | 배포 후 수행 |

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

## Git·배포 진행 상태

후보 코드 검사 통과. 커밋·push·PR·main 병합·Republish·태그는 아직 수행하지 않았다. 단계별 실제 결과를 후속 기록한다. 근거 파일은 Git 제외 경로 `.superpowers/release-6.0.0-20261113/`에 보존한다. 기존 원본·검증 기록·stash·분리 worktree와 보존 태그는 정리 대상으로 삼지 않는다.
