# 공통 모듈·CSS 정리 기록 (2026-11-09)

- 요청: 공통 모듈·CSS를 사용하지 않고 반복한 하드 코딩을 정리한다.
- 기준: [계획서](../product/planning-proposal.md#6-기존-기능의-보완과-정리), [구조와 재사용 경계](../architecture/project-structure.md#개발-사본의-미커밋-변경), 루트 [개발 운영](../../replit.md).
- 완료 조건: 앱 소스의 동일 의미 설정·반복 표시를 공통 소유 위치로 모으고 소비 코드를 연결한다. 기존 동작·문구·권한·요청·DB 계약과 앞선 미커밋 변경을 보존한다.
- 확인 범위: Replit의 앱 타입·의존 경계·변경 코드 lint, CSS 정적 컴파일, 관련 파일 기반 계약·문서 링크·diff. 실행 UI·업로드·외부 서비스·실계정 QA는 포함하지 않는다.
- 제외: Git 게시·운영 배포·서버 재시작·DB 작업·패키지 교체·첨부 자료 변경.

## 시작 상태

로컬 main `d7184ca5238e0cdc3e91515ac0616e3b33332f41`의 기존 미커밋 문서·코드 정리를 보존했다. 기존 파일 479개의 해시와 수정 대상 원본을 Git 제외 경로 `.superpowers/common-reuse-20261109/`에 보관했다. Replit의 별도 HEAD와 파일 내용을 대조한 뒤 담당 기준 문서부터 적용한다.

## 공통 정의와 소비 코드

기준 문서를 먼저 Replit 개발 사본에 반영한 다음, 아래 공통 정의로 화면과 서버 소비 코드를 연결했다.

| 공통 소유 위치 | 적용 범위 |
|---|---|
| [PublicHeading](../../client/src/components/public-heading.tsx) | 공개 안내 9개 페이지와 랜딩 섹션 5곳의 제목·영문 표제·구분선. h1/h2, 기존 크기·간격과 보조 문구 유지 |
| [index.css](../../client/src/index.css) | 공개 페이지 폭, 제목·소제목, 회원 화면·중앙 정렬·입력 패널·게시글 그리드·회비 납부 행·강조 점. 기존 토큰과 Tailwind palette 재사용 |
| [Button](../../client/src/components/ui/button.tsx), [CategoryBadge](../../client/src/components/category-badge.tsx), [LoadingSpinner](../../client/src/components/ui/loading-spinner.tsx) | 반복 버튼 9곳과 카테고리 표시 4곳, 검색 로딩. 기존 색상·hover·글자 굵기와 두 로딩 모양 유지 |
| [useScrollToTop](../../client/src/hooks/use-scroll-to-top.ts) | 같은 마운트 시 스크롤 처리 16곳. 프로필의 anchor 이동과 나머지 effect는 그대로 유지 |
| [site.ts](../../shared/site.ts), [association.ts](../../shared/association.ts) | 사이트 이름·약칭·공개 홈 설명, 공개 연락처·납부 계좌·문의 링크. 서버 최초 HTML과 공개 홈의 기존 설명 값도 같은 정본 참조 |
| [기존 공통 계약](../../shared/contracts/index.ts) | 온보딩의 활동지역 배열을 프로필·서버와 같은 REGION_OPTIONS로 연결. 회원 홈의 연회비 기본값을 ANNUAL_DUES로 연결 |
| [업로드 계약](../../shared/contracts/uploads.ts) | 기존 10 MiB, JPEG/PNG/WebP/GIF, 수정 첨부 20개 제한. 입력기·Uppy 기본 용량·수정 스키마·서버 업로드와 inline 응답 검사를 연결 |
| [앱 설정](../../client/src/lib/config.ts), [TypeScript 설정](../../tsconfig.json) | 프로필 버전을 package.json에서 정적으로 가져온다. JSON 모듈 옵션만 추가하며 Vite 설정·패키지 버전·lockfile은 시작 상태와 동일 |
| [본문 CSS](../../client/src/components/post-content.css) | 기존 편집·표시 공통 CSS의 색상을 같은 값의 Tailwind palette로 참조. JSON 스키마·본문 변환은 그대로 유지 |

작성 파일 선택기는 기존 서버 허용 MIME 4종을 안내하도록 맞췄다. 서버 허용 범위·권한·서명 토큰·객체 소유권·응답 검사는 바꾸지 않았고, 수정 전용 20개 제한을 작성에 새로 추가하지 않았다.

정의가 없는 공개 테두리 투명도·hover와 잘못된 Kakao 색상 클래스는 효과 없는 참조만 제거했다. 사용처가 없는 과거 역사 분류 색상표 `getCategoryColor`도 제거했다. 정상 동작하는 공통 UI·날짜 포맷·Tailwind 배치 유틸리티는 같은 문자열이라는 이유만으로 다시 감싸지 않았다. 공시 연도의 회비 표·회칙·약관·개별 페이지의 고유 콘텐츠, 외부 provider 규격·수집기 자원 한도·DB 기본값·migration·과거 기록은 이번 정리와 분리했다.

## 실제 수행한 정적 검사

2026-11-09 KST, Replit 개발 `/home/runner/workspace`에서 수행했다.

| 검사 | 결과 |
|---|---|
| `npm run check` | 최종 소스의 TypeScript 및 앱 파일 218개의 의존 경계·runtime cycle 정적 검사 통과 |
| 변경 코드 ESLint | 최종 변경 TS/TSX 45개 파일 통과. 최초 43개 검사 후 후속 변경 파일만 추가 검사 |
| CSS 정적 컴파일 | index.css·post-content.css 2개 통과. 결과는 Git 제외 작업 폴더에만 저장 |
| 공통 설정 정적 컴파일 | package.json의 버전 값만 포함하고 의존성 메타데이터·실행 시 파일 읽기가 없는 것을 확인. 생성 코드는 실행하지 않음 |
| 소스 AST 보존 대조 | 기존 UI 33개 파일의 조회·저장·캐시·분석 호출 58곳 동일. 회칙·규정 article 원문 2개 동일 |
| 약관·개인정보 처리방침 | 공통 이메일 값 치환 후 기존 소스와 동일. 원문·공개 연락처의 실제 값은 유지 |
| 문서 계약·링크·diff | Replit 파일 기반 계약 4개 통과(범위 밖 2개 제외), 71개 문서·608개 상대 링크/앵커 오류 0건, 로컬·Replit diff 통과 |

원본 대조 도구는 신규 파일에 이전 사본이 없는 점을 반영해 대상을 기존 파일로 한정한 뒤 통과했다. 앱 코드 실행 결과나 업로드·브라우저 동작의 증거로 취급하지 않는다. 전체 앱 빌드, unit·통합·DB·외부 API·브라우저·실계정 QA는 실행하지 않았다.

## 보존과 적용 상태

이번 변경은 코드 45개, CSS 2개, TypeScript 설정 1개, 담당 기준·이력 문서 5개다. 기존 479개 파일 중 432개는 내용이 동일하고 47개를 수정했으며 6개를 새로 추가했다. 삭제는 0건이다. 앞선 미커밋 문서·게시판 코드 정리, .agents, 첨부 자산, DB 스키마·SQL·migration, package.json·lockfile은 보존했다.

로컬 main `d7184ca5238e0cdc3e91515ac0616e3b33332f41`과 Replit main `587202723e943cb2cc9c3d3e1daf022770f33342`의 기존 HEAD는 그대로다. 두 작업 사본의 Git-visible 경로 489개(실존 파일 485개, 이전 작업에서 제거된 경로 4개)를 대조했고 내용 불일치와 Replit에만 있는 추가 경로는 0건이었다. commit·push·PR·merge·Republish·서버 재시작 명령은 실행하지 않았고 Development/Production DB 접속·변경 및 실계정 QA도 하지 않았다. 화면 렌더링·실제 저장·업로드·서버 동작은 이번 정적 검사만으로 확인했다고 보고하지 않는다.
