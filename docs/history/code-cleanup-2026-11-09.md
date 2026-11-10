# 게시판 코드 정리 기록 (2026-11-09)

- 목표: 기존 동작을 유지하면서 게시판 작성·수정의 책임과 반복 코드를 정리한다.
- 범위: 목록에서 작성 대화상자 분리, 수정 화면에서 일반 글 폼 분리, 카테고리 조건·lazy import·기존 이탈 경고 재사용, 관련 과거 검사 기준 정합화.
- 완료 조건: 기존 화면·요청·상태 초기화·권한·본문·첨부 계약을 보존하고 Replit 개발 사본에 반영한다.
- 제외: 기능 추가·권한/DB 변경·패키지 업데이트·코드 폴더 재편·서버 재시작·운영 배포·실계정 QA·Git 게시 작업. 앞선 미커밋 문서는 보존한다.
- 확인: 변경 코드 ESLint, 앱 타입·의존 경계, 관련 파일 기반 계약·문서 링크·`git diff --check`로 최소화한다. 앱/DB/외부 API를 실제 호출하지 않는다.

## 시작 상태

로컬 main `d7184ca5238e0cdc3e91515ac0616e3b33332f41`과 앞선 문서 정리 변경을 기준으로 시작한다. 474개 기존 파일의 해시와 대상 원본을 Git 제외 경로 `.superpowers/code-cleanup-20261109/`에 보존했다. Replit의 기존 별도 커밋은 유지하고 적용 전 HEAD·대상 파일을 대조한다.

## 코드 반영

기준 문서를 먼저 Replit에 반영한 뒤 다음 코드를 적용했다. 개발 HEAD `587202723e943cb2cc9c3d3e1daf022770f33342`와 기존 문서 변경은 보존했다.

| 위치 | 정리한 책임 |
|---|---|
| [boards.tsx](../../client/src/features/boards/boards.tsx) | 목록·가림 범위·카테고리 탐색. 작성 로직 분리로 410줄 → 137줄 |
| [create-post-dialog.tsx](../../client/src/features/boards/create-post-dialog.tsx) | 기존 작성 대화상자·폼·업로드·저장·성공/실패·초기화. 같은 필드로 다시 확장하던 Zod 정의와 중복 타입 단언 제거 |
| [post-edit.tsx](../../client/src/features/boards/post-edit.tsx), [post-edit-form.tsx](../../client/src/features/boards/post-edit-form.tsx) | 작성자 접근·조회·경조사 분기와 일반 글 폼·상태·첨부·저장 분리. revision 기반 key 유지 |
| [category-policy.ts](../../shared/domain/category-policy.ts) | `isRegularPostCategory`로 활성 일반 글 분류 조건을 작성·수정 UI와 서버에서 재사용. 전체 6개/일반 글 4개 정책 유지 |
| [lazy-post-body-editor.tsx](../../client/src/components/lazy-post-body-editor.tsx) | 두 화면의 공식 편집기 lazy import 재사용. 기존 Suspense·ref 전달과 editor 구현 유지 |
| [use-unsaved-changes-warning.ts](../../client/src/hooks/use-unsaved-changes-warning.ts) | 일반 글·경조사 수정의 기존 beforeunload 경고 재사용. 경조사 초안 자동저장 경로는 그대로 유지 |
| [카테고리 계약 검사](../../client/src/features/boards/__tests__/category-policy.test.ts) | 통합 전 4개 전체 분류 기대값을 현행 6개로 정합화하고 분리된 두 폼의 공통 조건 참조 확인 |

작성 요청·성공/실패 처리·초기화와 서버 변경 범위를 원본과 정적으로 대조했다. 서버 diff는 공통 카테고리 함수 import와 기존 조건 2곳의 호출 교체뿐이다. 화면 문구·클래스·목록 query key·작성자의 수정/삭제·관리자의 가리기·첨부 처리·미리보기 확인 흐름을 바꾸는 작업은 포함하지 않았다.

## 실제 수행한 정적 검사

2026-11-09 Replit 개발 워크스페이스 `/home/runner/workspace`에서 수행했다.

| 검사 | 결과 |
|---|---|
| `npm run check` | TypeScript 통과; 앱 파일 213개의 의존 경계·runtime cycle 정적 검사 통과 |
| 변경 코드 ESLint | TypeScript/TSX 10개 파일 통과 |
| 기존 카테고리 파일 계약 | `server and board forms use the shared category policy` 1개 통과. 분류 함수를 실행하는 사례 1개는 선택에서 제외 |
| 문서 상대 링크·앵커 | 결과 기록 전 70개 문서·580개 참조, 오류 0건. 결과 링크 추가 후 해당 참조를 다시 확인 |
| `git diff --check` | 로컬·Replit 통과 |

필요한 정적 검사만 수행했다. 전체 unit·통합·DB·브라우저·외부 API·실계정 검사는 실행하지 않았으며 빌드·서버 재시작도 하지 않았다. 정적 결과를 저장·업로드·편집기 동작의 실행 확인으로 표시하지 않는다.

## 보존과 적용 상태

이번 변경은 코드·파일 계약 10개와 기준/이력 문서 5개다. 기존 파일 삭제는 0건이며 코드 폴더·SQL·스키마·패키지·lockfile·첨부 자료·`.agents/`는 유지했다. 앞선 문서 정리 변경도 보존했다.

로컬·Replit 개발 사본에 반영하고 파일 해시를 대조했다. 서로 다른 기존 HEAD는 유지하며 이번 변경의 commit·push·PR·merge·Republish는 수행하지 않았다. Development/Production DB에 접속하거나 변경하지 않았으며 운영 배포·실계정 QA는 계속 보류한다.
