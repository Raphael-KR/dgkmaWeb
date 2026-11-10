# 역사관 릴리스 — 2026-11-11

## 승인과 완료 조건

- 목표: 역사관 여섯 메뉴와 현재 미커밋 변경을 GitHub main에 통합하고 Replit 운영에 반영한다.
- 범위: 로컬·Replit의 작업 파일 보존, commit·push·PR 생성·main 병합, 개발 사본 반영과 Republish. 별도 게시 메타데이터 커밋도 보존한다.
- 완료 조건: PR 병합과 Replit 새 배포 성공, 공개 HTTP·canonical·후보 자산 일치 및 회원 API 비로그인 차단을 확인하고 각 단계의 근거를 기록한다.
- 제외: 사진·수상자 자료 반영, DB 구조·데이터·회비 판정 변경, 실계정 QA, 실제 게시·명부 동기화·외부 수집·유료 API 호출, 개발 서버 별도 재시작과 자동 롤백.
- 검증: [개발 기록](heritage-2026-11-10.md)의 소스 해시와 대조해 동일한 코드의 정적 검사 결과를 재사용한다. Replit 릴리스 빌드·변경 문서 정합성과 배포 후 비로그인 HTTP를 확인한다. 화면 상호작용·사진 확대·실계정 흐름은 이 결과로 대신하지 않는다.

## 시작 상태

로컬·GitHub main은 `86a8a334a3bccef83097771274ba0ba6a79ffb52`, Replit main은 게시 메타데이터 커밋 `6e75cb6fbc4baca4c74553b49ee420130b13bf4b`였다. 미커밋 파일 36개는 역사관 코드·자료·문서다. 사진·수상자 목록은 비어 있으며 새 DB 전환은 없다. 이 기록과 승인 범위를 먼저 반영한 뒤 Git 통합·릴리스를 수행한다.

실행 증거는 ignored `.superpowers/heritage-release-20261111/`에 보존한다. 아래에 실제 완료한 결과만 추가하며, 이전 배포의 `success`를 새 릴리스 결과로 사용하지 않는다.

## 배포 전 확인

- Replit의 기존 미커밋 36개 파일이 개발 완료 시점 해시와 일치했다. 릴리스 승인 문서만 수정·추가했으며 코드·자료는 바뀌지 않아 기존 타입·의존 경계·lint·CSS·자료 검사를 재사용했다.
- 기존 Replit 게시 커밋 `6e75cb6`의 tree는 로컬 기준과 같았다. 해당 커밋을 bundle로 보존해 이번 통합 이력에 포함한다.
- Replit 릴리스 빌드(Vite·청크 예산·esbuild)와 변경 문서의 파일 기반 검사 6건이 통과했다. 초기 JS는 354,005바이트, 지연 라우트는 28개다. 문서 상대 링크와 `git diff --check`도 통과했다.

## 완료 결과

- 초기 미커밋 36개 파일과 릴리스 기록을 포함한 37개 파일을 `fded26f9e24de85fcbad691074ff78aa640e6ed4`에 커밋·push했다. [PR #31](https://github.com/Raphael-KR/dgkmaWeb/pull/31)의 파일별 patch 37개가 로컬 후보와 일치했고, 병합 가능 상태와 등록된 CI 실행·리뷰·미해결 스레드가 없음을 확인했다. main 병합 커밋은 `9062bf04d21bc023627e11c86b165f2c82e0b619`이다.
- Replit 미커밋 사본을 stash `0474fb86c98277b80e27b2db6dea024536426445`로 보존한 뒤 main을 fast-forward했다. 배포 전 로컬·Replit의 추적 파일 546개가 일치했다. 기존 stash·검증 기록·사용자 자산은 유지했다.
- Replit `publish_app`의 `pending → building → running → promoting → success`를 관찰했다. 2026-11-11 00:15:33 KST에 [운영 홈페이지](https://dgkma.org/)의 새 배포 성공을 확인했다.
- 00:16:01 KST 비로그인 smoke 87건이 통과했다. 공개 HTML URL 11개(사진첩 연도 쿼리 포함)의 HTTP·제목·canonical·후보 엔트리, 사이트맵의 역사관 주소와 홈 대표 주소, 보호 API 9개의 401 JSON, 정적 자산 66개의 SHA-256을 확인했다. 실제 화면 상호작용·사진 확대·키보드·회원·관리자 흐름의 검증은 아니다.
- Replit 게시 커밋 `906bfa3c33edee640ed84e3b7e4832d3b29cb2d1`과 병합 후보의 tree `64dba2b201a9e5e72092943de7b9324d17be0bcc`가 일치했다. 게시 이력을 main에 보존하며 완료 기록은 문서 전용 후속 커밋으로 반영한다. 이 기록을 위해 다시 Republish하지 않는다.
- 병합한 `codex/heritage-release` 브랜치를 제거했다. Replit이 생성한 별도 게시 이력 `553dfd3db416ca839372252b81fe2183fd1e0188`도 후보와 같은 tree이며, `archive/replit-agent-pr31-20261111` 태그로 로컬·GitHub·Replit에 보존한 뒤 `replit-agent` 브랜치를 제거했다. 작업 브랜치는 세 환경 모두 main만 유지한다.
- 사진·수상자 자료 반영, DB 직접 변경·catalog 재조회, 실계정 QA·개발 서버 별도 재시작·외부 수집·유료 API 호출·자동 롤백은 수행하지 않았다.
