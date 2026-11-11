# 편집기 추가 확장 — 2026-11-12

- 목표: 요청한 Placeholder·TaskList/TaskItem·CharacterCount·Youtube를 기존 공식 Tiptap 3.33.0과 연결한다.
- 범위: 미사용 공식 확장 활성화·누락 패키지 설치, 작성/저장/표시/변환과 공통 CSS. 본문 텍스트의 새 상한은 정하지 않으며 댓글 1,000자를 유지한다.
- 완료 조건: 공식 스키마·명령·단축키를 재사용하고 글자 수 표시, 체크 상태 보존과 읽기 전용 표시, 유효한 YouTube 영상만 입력/저장한다.
- 제외: 유료 기능·임의 iframe·공동 편집·DB 변경·브라우저/영상 재생·서버 재시작·릴리스·실계정 QA.
- 검증: Replit에서 변경 코드 lint·서식·앱 타입/의존 경계와 필요한 CSS 정적 처리, 문서·diff 확인. 실행형 테스트를 추가하지 않는다.

## 변경 전 확인

로컬 lockfile과 Replit의 실제 패키지를 확인했다. `@tiptap/extensions`·`@tiptap/extension-list` 3.33.0(MIT)은 이미 전이 의존성으로 설치돼 있으나 요청한 확장은 편집기에 등록되지 않았다. `@tiptap/extension-youtube`는 없다. 본문 텍스트의 별도 글자 수 상한은 없으며 JSON 직렬화 문자열 전체 250,000자·10,000 노드·깊이 64를 검사한다. 댓글은 공통 계약과 textarea가 1,000자로 제한한다.

일반 JSON 요청은 현재 Express/body-parser 기본 100KB(102,400바이트)다. JSON 검사 상한은 실제 본문 250,000자를 입력·저장할 수 있다는 뜻이 아니다. 본문과 댓글 모두 기본 UTF-16 문자열 길이 기준이며, 이모지는 여러 단위로 계산될 수 있다.

## 설치·구현

제품 계획·편집기·JSONB 계약·DB 런북·Replit 범위를 먼저 갱신한 뒤 Replit 개발 워크스페이스에서 `npm install --save-exact --ignore-scripts --no-audit --no-fund @tiptap/extensions@3.33.0 @tiptap/extension-list@3.33.0 @tiptap/extension-youtube@3.33.0`을 실행했다. 2026-11-12 02:19 KST, 종료 0이며 새 패키지는 Youtube 1개다. 세 패키지는 모두 MIT이며 기존 core·StarterKit 등의 3.33.0과 일치한다. 변경된 manifest/lockfile을 로컬에 반영했다.

- Placeholder: 공식 decoration과 공통 CSS를 사용하고 이전 겹침 안내 요소를 제거했다.
- 체크리스트: 공식 TaskList/TaskItem만 공통 스키마에 추가하고 중첩·명령·기본 단축키·Markdown을 재사용한다. checked는 boolean이며 상세/미리보기는 Static Renderer의 공개 nodeMapping으로 체크박스를 비활성화한다.
- 글자 수: 공식 CharacterCount의 기본 집계와 `limit: null`·`autoTrim: false`를 사용한다. 댓글은 기존 textarea와 서버 1,000자 제한을 유지한다. 새 본문 상한은 정하지 않았다.
- YouTube: 공식 노드·주소 변환 도우미·삽입 명령·HTML/Markdown 렌더러를 사용한다. 영상 버튼과 기존 붙여넣기 처리에서 같은 검증을 거쳐 삽입한다. 공식 렌더러가 `/embed/` 주소를 그대로 쓰는 경로를 보완하기 위해 공개 `extend`의 parse/render 경계에서 알려진 호스트·단일 영상 ID·숫자 속성을 검증하고 watch 주소로 정규화한다. 임의 iframe·재생목록 전용 URL은 허용하지 않으며 nocookie·자동 재생 끄기·반응형 CSS를 적용한다.
- 공식 Youtube의 `:::youtube {속성} :::` Markdown과 체크리스트의 GFM 구문을 사용한다. 공식 파서의 숫자 문자열은 저장 시 정수로 정규화하며 기존 손실 안내·원본 보존 흐름을 유지한다.

## Replit 개발 반영·정적 검사

2026-11-12 02:32~02:33 KST, Replit 개발 워크스페이스의 Node v20.20.0에서 이번 변경 파일 20개를 반영하고 아래 검사를 수행했다. 로컬·Replit은 `main b4d55da121f579beba2cb2990e13b525732d3958` 위의 미커밋 개발 사본이며 기존 이미지·표·일반 파일 변경을 보존했다.

| 검사 | 범위·결과 |
|---|---|
| ESLint | 변경 TS/TSX 8개 파일, 종료 0 |
| Prettier | 위 8개와 공통 본문 CSS, 종료 0 |
| `npm run check` | 앱 타입·의존 경계 253개 앱 파일, 종료 0 |
| PostCSS/Tailwind/Autoprefixer | 공통 본문 CSS 정적 처리, 종료 0 |
| `git diff --check` | 개발 사본의 공백/충돌 검사, 종료 0 |

실제 명령·시각·소스 해시는 로컬·Replit의 `.superpowers/editor-extensions-20261112/checks-first.json`, 설치 결과는 `install.json`에 남겼다. 타입 검사 셸의 기존 `LC_ALL=C.UTF-8` locale 경고 외 검사 경고·오류는 없다. 형식 정리 후 검사한 코드를 로컬로 다시 받아 두 사본을 맞췄다. 마지막 문서 결과 반영과 파일 해시 대조는 같은 폴더의 `final-sync.json`에 기록한다.

이전 검사 결과를 이번 결과로 대신하지 않았다. 테스트 시그니처·로그 경로·DB·배포 산출물은 변경하지 않아 테스트 타입·로그 AST·DB 검사·빌드를 추가하지 않았다. 문서의 관련 링크·확정 정책도 정적으로 대조했다.

## 미확인 범위와 실행 경계

실제 입력·단축키·중첩 체크 상태·붙여넣기·HTML/Markdown 왕복·저장 후 재진입·YouTube 재생은 실행하지 않았다. 정적 검사 통과는 이 동작들의 실제 확인 결과가 아니다. YouTube 영상의 외부 임베드 허용 여부에 따라 재생이 제한될 수 있으며 재생목록 전용 주소는 이번 지원 범위에 없다.

DB DDL·행 변경·catalog 조회·서버 재시작·운영 배포·실계정 QA는 수행하지 않았다. 실행 중인 서버의 새 스키마 로딩 여부를 확인하지 않았고, 이번 결과는 개발 파일·의존성 반영과 정적 검사에 한정된다. commit·push·PR·main 병합도 수행하지 않았다.
