# 코드·문서 정리 릴리스

2026-11-10 사용자가 코드·문서 정리와 기타 미커밋분 전체의 커밋·push·PR 생성·main 병합·Replit 릴리스를 승인했다. [배포 절차](../../replit.md#배포)를 적용하며 실계정 QA는 계속 보류한다.

- 목표: 누적된 정리 사항을 GitHub main과 Replit 운영에 반영한다.
- 범위: 로컬·Replit 개발에 내용이 같은 관리 파일 515개를 기준으로 기존 미커밋분 전체를 포함하고, Replit에만 있는 게시 이력 커밋도 보존한다.
- 완료 조건: 동일 후보의 빌드·PR·병합, 개발 main 반영, 새 Republish 성공과 비로그인 HTTP·canonical·회원 API 인증 차단·정적 자산 일치를 확인한다.
- 제외: DB 구조·데이터·Secrets 변경, 실계정 QA, 실제 게시·명부 동기화·유료 API 호출·개발 서버 별도 재시작·자동 롤백.
- 검증: 같은 소스의 기존 Replit 정적 검사 결과는 해시 대조 후 재사용한다. 릴리스 빌드, 변경 문서의 정적 검사와 배포 후 비로그인 smoke만 추가한다.

## 시작 상태와 검사 근거

로컬 main은 `d7184ca5238e0cdc3e91515ac0616e3b33332f41`, Replit main은 `587202723e943cb2cc9c3d3e1daf022770f33342`다. 작업 사본의 관리 파일 515개가 일치하며, [전체 코드 정리](full-code-cleanup-2026-11-10.md) 이후 비문서 파일의 변경은 없다. [전체 문서 정리](full-documentation-cleanup-2026-11-10.md)의 최종 사본과도 같다. DB 전환은 포함하지 않는다.

## 릴리스 후보 확인

- 2026-11-10 Replit의 `npm run build`가 통과했다. Vite·청크 예산 검사·서버 esbuild가 완료됐고 초기 JS 348,581바이트, 지연 라우트 24개로 기존 기준을 충족했다.
- 앱·검사 타입, 의존 경계, ESLint, sandbox 타입, 서식 검사는 앞선 동일 소스의 통과 기록을 재사용했다. 당시 관리자 화면 파일 계약의 줄바꿈 판정 오류는 수정 후 해당 4개 검사가 통과한 결과를 사용한다.
- 변경 문서의 내부 링크·앵커와 staged `git diff --check`가 통과했다. 새로 추적한 문서 2개의 끝 빈 줄을 정리했다. Secret·개인키 리터럴이 커밋에 새로 포함되지 않는지 확인했다.

## Git·배포·운영 확인

- 전체 미커밋분을 `2bc01e1`에 커밋하고, 동일 작업 사본의 Replit 게시 이력 `5872027`을 `7d1fa17`에 보존해 push했다. [PR #29](https://github.com/Raphael-KR/dgkmaWeb/pull/29)의 변경 파일 467개가 로컬 후보와 일치했고, 충돌·미해결 리뷰·등록된 commit status가 없음을 확인해 main `997bc7ba891ab6a21bac6889b26db93464704f72`에 병합했다.
- 로컬·Replit main을 병합 커밋에 맞췄다. Replit 기존 변경은 동일 후보임을 확인한 뒤 stash `ae6d5c439dab0154de277075fd97d11379c3d005`에 보존했고 작업 트리를 깨끗하게 유지했다. 후보 관리 파일 516개가 일치했다.
- Replit `publish_app` 실행 후 `pending → building → running → promoting → success`를 관찰했다. 2026-11-10 20:19:47 KST `https://dgkma.org`의 새 배포 성공을 확인했다.
- 20:20:24 KST 비로그인 smoke 70건이 통과했다. 공개 페이지 5개의 HTTP·제목·canonical·후보 엔트리, 회원 API 8개의 401 JSON, 후보 정적 자산 57개의 SHA-256을 확인했다. `/`와 `/about`의 canonical은 `https://dgkma.org/`, 소개·역대회장·역사관은 각각의 주소다.
- Replit 게시 커밋 `7aadf4cb496193a5bb774cd9a73a43bf5551afc6`은 병합 후보와 동일한 tree `3e4d8e6d8192eddcdf54a629a537fb3e16915fd1`다. 게시 커밋을 보존하고 완료 상태·기준 문서만 후속 main에 반영한다. 문서 전용 후속 커밋으로 추가 Republish하지 않는다.
- DB·Secrets 변경, 실계정 QA, 실제 게시·명부 동기화·수집·유료 API 호출, 개발 서버 별도 재시작과 롤백은 수행하지 않았다. 실행 근거는 ignored `.superpowers/cleanup-release-20261110/`의 Git·후보·게시·smoke 기록에 보존한다.
