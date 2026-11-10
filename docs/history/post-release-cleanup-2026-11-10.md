# 릴리스 후 프로젝트 파일 정리

2026-11-10 사용자 요청에 따라 [파일 정리 기준](../../replit.md#릴리스-후-파일-정리)을 먼저 반영했다.

- 목표: 최신 릴리스·원본·검증 기록을 보존하면서 재생성 가능한 캐시와 구형 산출물을 정리한다.
- 범위: 로컬 `/Users/raphael/Playground/dgkmaWeb`과 Replit 개발 `/home/runner/workspace`. 패키지 캐시, 사용하지 않는 구형 빌드, 내용 보존을 확인한 전송 사본과 Python·Finder 캐시를 구분한다.
- 완료 조건: 삭제 대상·근거·크기를 기록하고 현재 소스·최신 배포 산출물·원본·검증 기록의 보존을 확인한다.
- 제외: 운영 인스턴스·DB·Secrets·Object Storage, 사용자 자산, 설치된 앱·설계 미리보기 의존성, 활성 Vite 캐시, Replit 상태·로그·Nix 환경, Git 이력·stash·원본이 남은 worktree, commit·push·재시작·배포·실계정 QA.
- 검사: 파일 목록·해시·Git 상태·실행 경로와 문서 링크를 정적으로 대조한다. 기능 시험·새 빌드는 실행하지 않는다.

## 시작 상태와 보존 판단

로컬·Replit main은 `6e594a454dca192ef7e95b59bb31ca3922142ba8`이며 작업 트리가 깨끗하다. 최신 운영 소스는 `7aadf4cb496193a5bb774cd9a73a43bf5551afc6`이고 [릴리스 기록](cleanup-release-2026-11-10.md)의 후보 자산·검증 결과를 보존한다.

Replit의 `.worktrees/unified-posts-check`에는 미커밋 원본이 있어 전체를 유지한다. 이전 작업 사본의 소스·검증 기록·사용자 자산도 그대로 두고 실행 중인 프로세스가 참조하지 않는 `dist`만 구분한다. 로컬 `.superpowers/` 대부분은 원본·검증 자료이므로 폴더 전체 삭제 대상이 아니다. Git에 없는 파일이 포함된 전송 압축파일과 변경 전 백업도 보존한다.

## 실행 결과

2026-11-10 로컬과 Replit 개발에서 다음 파일을 정리했다. 크기는 대상 파일의 할당 블록 합계 기준이며, 현재 원본·검증 자료의 크기를 삭제 실적으로 포함하지 않았다.

| 환경 | 정리 대상 | 결과 |
|---|---|---|
| 로컬 | 과거 전송 파일 2개와 Finder·Python 캐시 3개 | 5개 파일, 약 0.26MiB |
| Replit 개발 | `pnpm store prune`의 비참조 패키지·메타데이터 캐시 | 27,012개 파일, 약 751.39MiB. 공식 출력은 패키지 파일 25,726개·631개 패키지 및 메타데이터 정리 |
| Replit 개발 | 이전 작업 사본의 `dist` 4개·전송 파일 2개 | 빌드 파일 132개와 전송 파일 2개, 약 9.28MiB |

전송 파일은 두 환경의 `documents.tar`와 `number-format-source.tar.gz`다. 모든 파일 본문이 현재 main의 이력에서 도달 가능한 Git blob과 일치함을 확인했다. 나머지 전송 압축파일은 변경 전 백업·검증 자료이거나 main에서 원문 보존을 확인하지 못해 유지했다.

구형 빌드는 `.worktrees/todo16-5f00d8a4/dist`, `.worktrees/todo17-f54f699/dist`, `.worktrees/todo17-214021d/dist`, `.worktrees/todo17-receipt-4711bad/dist`다. 삭제 전 프로세스의 작업 경로·열린 파일·메모리 매핑에서 참조하지 않음을 확인했다. 상위 작업 사본의 소스·자료·검증 기록은 유지했다.

## 보존·검사 결과

- 로컬의 원본·검증 파일 5,215개, Replit의 원본·검증·자산 파일 5,341개가 정리 전후 SHA-256과 일치했다. 최신 릴리스의 정적 자산 57개도 기존 배포 후보 해시와 일치했다.
- Replit의 설치 의존성 파일 96,842개는 파일 존재·크기·수정 시각이 유지됐다. 루트와 설계 미리보기의 `node_modules` 및 활성 Vite 캐시는 제거하지 않았다.
- 관리 소스의 변경은 정리 기준·이력 문서뿐이다. Git HEAD·이력·stash, 미커밋 원본이 있는 worktree, 사용자 자산·스킬·DB 전환 자료를 보존했다. Replit 상태·로그·Nix 캐시는 실행 환경과 기록이므로 유지했다.
- 최신 릴리스 기록 `.superpowers/cleanup-release-20261110/`와 이전 작업의 검증 결과·변경 전 원본을 보존했다. 이번 정리의 대량 파일 목록은 무손실 gzip으로 보관하고 원문 해시·삭제 목록·결과 요약을 함께 남긴다.
- 검사 범위는 파일·프로세스 메타데이터·해시·문서 계약·링크·`git diff --check`다. DB 변경·기능 시험·빌드·재시작·재배포·실계정 QA·commit·push는 하지 않았다.

상세 근거는 두 환경의 ignored `.superpowers/post-release-cleanup-20261110/`에 있다.

## 후속 Git 정리 범위

파일 정리 기록 3개는 `0529802cfd2d0cceabb4acccd22a82b02b565ae9`로 커밋했다. 이후 사용자가 남은 미커밋분의 커밋·push와 세 환경의 main 일치, main 외 브랜치 제거를 요청했다.

- 목표: 로컬·GitHub·Replit 개발의 main 커밋과 소스를 일치시킨다.
- 범위: 현재 문서 변경, 작업 브랜치, 과거 Replit 게시 이력과 detached 검사 사본의 미커밋 원본을 구분한다.
- 완료 조건: 현재 변경은 main에, 이전 자료는 보존용 커밋·태그에 남기고 세 환경의 작업 브랜치는 main 하나로 정리한다.
- 제외: DB·Secrets·운영 배포·재시작·실계정 QA와 사용자 자산·검증 자료·stash 삭제.
- 검사: Git 커밋·tree·브랜치·작업 트리와 문서 정합성을 정적으로 확인한다. 과거 자료 보존을 현재 기능 검증으로 취급하지 않는다.

## 후속 Git 정리 결과

2026-11-10 20:58 KST 로컬·GitHub·Replit 개발 main이 `c6cddf0291af73a763885d88ef18dc4866620876`, tree `3562e40cbcc206475807085efabee8a4865e5de5`로 일치했다. 이 결과를 남기는 후속 문서 커밋도 같은 방식으로 push·fast-forward하며 운영에는 재게시하지 않는다.

- Replit에 남은 청소 문서 3개는 `330a7e01f6b751c3c6a90ee5dd0eee54960e3dbf`로 커밋한 뒤 로컬의 검토된 문안과 병합했다. main 소스 변경은 문서뿐이다.
- 과거 detached 검사 사본의 97개 파일 변경은 `f8743fabc67b791add37497bef975e785d57c083`에 원문 그대로 커밋했다. `archive/unified-posts-check-20261110` 태그로 GitHub에도 보존하며 현재 main의 기능 구현과 구분한다. 검사 사본의 작업 트리는 깨끗하다.
- main에 없는 Replit 게시 이력 279개는 `archive/replit-agent-20261110` 태그로 보존했다. 대상 `192580f8eef7fdcc65b2535d0eda9e6fe2cb3301`의 tree는 마지막 릴리스의 `3e4d8e6d8192eddcdf54a629a537fb3e16915fd1`과 같다.
- main에 반영된 로컬·GitHub 작업 브랜치 각 9개와 Replit 작업 브랜치 3개를 제거했다. 세 곳의 `refs/heads`는 main 하나다. 로컬의 이전 Replit 가져오기용 추적 참조 5개도 제거했다.
- 보존 태그 2개는 작업 브랜치가 아니다. Replit이 관리하는 `gitsafe-backup/main` 추적 참조, 기존 stash 4개, detached 검사 사본 폴더와 검증 기록은 유지했다. 기존 stash는 현재 변경으로 재적용하지 않았다.
- Replit의 파일 기반 문서 계약 6건과 현재 main의 `git diff --check`가 통과했다. 이전 검사 사본에는 `server/modules/events/member-labels.ts:42`의 EOF 빈 줄 경고 1건이 있었으며 원본 보존 커밋에서 수정하지 않았다. 이를 현재 코드의 정적 검사 통과로 보고하지 않는다.

삭제 전 참조·보존 커밋·전송 bundle·검사 결과는 두 환경의 ignored `.superpowers/main-sync-20261110/`에 보관한다. DB 변경·빌드·재시작·운영 배포·실계정 QA는 수행하지 않았다.
