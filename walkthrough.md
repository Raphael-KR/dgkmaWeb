# 별도 요청된 기능 점검 안내

이 문서는 요청된 점검의 범위와 현재 기능 계약을 연결한다. 다음 개발 목표는 [제품·개발 통합 계획서](./planning_proposal.md), 실행 경계는 [AGENTS.md](./AGENTS.md), 운영 절차·마지막 배포 상태는 [replit.md](./replit.md)를 따른다.

## 현재 적용 기준

- 개발 직후 점검은 변경 범위에 필요한 정적 검사로 최소화한다. 이 문서를 일상 개발의 선행 과제나 전체 QA 대기표로 사용하지 않는다.
- 실계정 QA는 계속 보류한다. DB·브라우저·외부 provider·유료 호출·서버 재시작·운영 배포는 해당 작업에서 승인된 범위로 한정한다.
- 게시판·경조사 통합, 본문 JSONB, 공개 메뉴·canonical, 작성자 수정·삭제·관리자 가리기와 URL 정정은 main 및 운영에 반영됐다. [현재 적용 상태](./replit.md#현재-적용-상태)에서 배포 코드와 후속 문서 커밋을 구분한다.
- 과거 후보의 성공·실패는 해당 환경·버전·입력의 결과다. 문서 이동이나 코드 존재를 새 기능 실행의 증거로 사용하지 않는다.

## 요청된 점검의 범위 선택

대상 환경·후보·기능과 실제 실행 권한을 정한 뒤 필요한 항목만 선택한다. 화면 확인이 승인된 경우에는 개발 홈페이지부터 사용하고 [GUI 경계](./AGENTS.md#런타임과-배포-경계)를 따른다. 운영 HTTP 확인은 승인된 Republish 이후에 수행한다. 실제 계정의 성공 흐름은 비로그인 401·정적 자산 확인과 구분한다.

| 대상 | 현재 계약과 확인할 경계 | 기준 |
|---|---|---|
| 공개 홈 | `/`는 회원 여부에 따라 분기, `/about`은 항상 공개 홈. 두 canonical은 `https://dgkma.org/`, 하위 페이지는 각자의 주소 | [공개 정책](./planning_proposal.md#공개-홈-검색-대표-주소-2026-11-09) |
| 게시글·첨부 | 모든 posts·categories·댓글·검색·첨부는 회원 전용. 비로그인 `/api/categories`는 목록 대신 401 | [콘텐츠 라우트](./server/modules/content/routes.ts), [첨부 라우트](./server/integrations/object-storage/routes.ts) |
| 본문 | Tiptap JSONB가 정본이며 HTML/Markdown 입력·복사는 변환이다. 보기만으로 원본을 바꾸지 않고 손실 안내를 유지 | [본문 계약](./docs/database-schema.md#본문-tiptap-jsonb-계약) |
| 게시글 관리 | 작성자만 수정·삭제, 관리자는 타인 글 가리기/다시 표시하기. revision과 숨김 상세·댓글·첨부 경계 | [제품 정책](./planning_proposal.md#게시글-수정삭제가리기-2026-11-09) |
| 경조사 | `/b/write/:type`의 짧은 텍스트·링크 → JSON → 필요한 질문 → 미리보기 → 작성자 확인 후 게시. 상세 폼과 `/events`·`/o`는 제거 | [현재 API 구조](./docs/project-structure.md#api-소유권등록-순서) |
| URL 정정 | 새 입력 출처 우선, 같은 URL 최신 상태, 링크 없는 정정은 기존 유지. 미리보기와 저장 문안 일치 | [PR #28 확인 범위](./docs/history/replit-2026-11-09.md#url-정정-릴리스-후보-확인) |
| 수집·경사 | 실제 실행한 수집 경로·규칙 저장/재사용·미실행 경로를 구분. 한 부고 링크 성공을 경사/OCR 성공으로 대신하지 않음 | [수집·경사 기록](./docs/history/replit-2026-11-09.md#개발-수집-적용-결과-2026-11-09) |
| 명부 | Sheets 관리 원본, PostgreSQL 런타임 복제본. preview·fingerprint 확인 후 승인 범위만 적용 | [DB 런북](./docs/database-operations.md#google-sheets-명부-동기화) |

### 카카오 callback 계약

카카오가 callback URL의 query로 인가 코드와 state를 전달하고, 브라우저가 인가 코드와 state를 서버에 한 번 전달한다. 서버 응답과 앱 로그에 전체 인가 코드나 토큰을 남기지 않는다. 환경별 앱·동의·탈퇴의 상세 기준은 [심사 가이드](./docs/kakao-consent-review-guide.md)와 [인증 정책](./planning_proposal.md#회원과-카카오-로그인)을 따른다. 이 설명 자체가 실계정 QA의 실행 승인은 아니다.

## 과거 수행 기록

2026-11-09까지 누적된 원문 기록과 통합 전 체크리스트는 [과거 walkthrough](./docs/history/walkthrough-2026-11-09.md)에 보존한다. 그 문서의 `/events`, `/o`, 기타 유형, 상세 폼, 공개 게시글 API, 전체 회귀·실계정 QA 절차는 당시 구현의 기록이며 현재 작업 지시가 아니다.

- [키·모델 실제 호출과 당시 부고 수집 실패](./docs/history/walkthrough-2026-11-09.md#실제-모델과-부고-작성-점검-2026-11-09)
- [이후 범용 API 발견·규칙 재사용](./docs/history/replit-2026-11-09.md#개발-수집-적용-결과-2026-11-09)
- [결혼·개원 보완의 정적 확인 범위](./docs/history/replit-2026-11-09.md#적용-결과와-확인-범위)
- [최신 URL 정정 릴리스](./docs/history/replit-2026-11-09.md#url-정정-릴리스-완료-결과)
- [DB 전환·보존 결과](./docs/history/database-operations-2026-11-09.md), [구조 개편 이력](./docs/structure-validation.md)
