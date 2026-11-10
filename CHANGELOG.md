# 변경 이력

확인된 개발·릴리스 기록의 요약이다. 현재 정책은 [제품·개발 계획](docs/product/planning-proposal.md), 환경별 마지막 확인 상태는 [replit.md](replit.md#현재-적용-상태)가 기준이다. 기록일을 배포일로 사용하거나 확인되지 않은 버전 번호를 부여하지 않는다.

## 2026-11-10 — PR #29 코드·문서 정리

다음 변경을 [PR #29](https://github.com/Raphael-KR/dgkmaWeb/pull/29)로 main에 통합하고 Replit 운영에 반영했다. 배포와 확인 범위는 [정리 릴리스 기록](docs/history/cleanup-release-2026-11-10.md)을 따른다.

- 인증·명부·관리자·게시글·편집기·경조사·수집기의 책임 분리와 공통 계약·스타일 재사용, 미사용 코드·설정 정리. 세부 범위는 [코드 정리 이력](docs/history/README.md#코드공통화와-미사용-정리)을 따른다.
- 공통 Prettier 설정, 로그인 복귀 경로 통합, OAuth 검사 모듈 분리: [전체 코드 정리](docs/history/full-code-cleanup-2026-11-10.md).
- 문서 진입점·현재 기준·수행 이력 구분과 중복 축소: [전체 문서 정리](docs/history/full-documentation-cleanup-2026-11-10.md).

## 2026-11-09 — PR #22~28 릴리스

| PR | 변경 | 적용 기록 |
|---|---|---|
| #22 | 회원 전용 게시판·경조사 통합, 공통 공개 수집·규칙 저장, 결혼·개원 문안과 본문 서식 | [통합 릴리스](docs/history/replit-2026-11-09.md#릴리스-완료-결과) |
| #23 | 회원 커뮤니티의 태블릿·PC 반응형 배치 | [반응형 릴리스](docs/history/replit-2026-11-09.md#반응형-릴리스-완료-결과) |
| #24 | 공개·회원 화면의 공통 로고·사이트 이름·스타일 | [공통 표시 릴리스](docs/history/replit-2026-11-09.md#공통-표시-릴리스-완료-결과) |
| #25 | `/about` 공개 랜딩과 역대회장·역사관 메뉴 연결 | [공개 메뉴 릴리스](docs/history/replit-2026-11-09.md#공개-메뉴-릴리스-완료-결과) |
| #26 | Tiptap JSONB 본문과 공개 홈 canonical 통일 | [본문·canonical 릴리스](docs/history/replit-2026-11-09.md#본문-jsonb-릴리스-완료-결과) |
| #27 | 작성자 수정·삭제와 관리자 가리기, `is_hidden` | [게시글 관리 릴리스](docs/history/replit-2026-11-09.md#게시글-관리-릴리스-완료-결과) |
| #28 | 경조사 정정 URL 우선순위 보완, ESLint | [URL 정정 릴리스](docs/history/replit-2026-11-09.md#url-정정-릴리스-완료-결과) |

위 기록은 main 병합·운영 적용과 해당 범위의 확인 결과다. 실제 경사 링크·OCR·실계정 흐름 전체가 검증됐다는 뜻은 아니다. 실행 범위와 미확인 항목은 각 기록에서 구분한다.

## 이전 기록

[정리 전 변경 이력 원문](docs/history/changelog-before-2026-11-10.md)에 기존 `Unreleased`, 1.1.0(2026-04-20), 1.0.0(2025-08-30) 기록을 보존했다. Supabase 로그인·옛 경조사 폼과 주소·기타 유형·제3자 JavaScript 실행 금지 등 대체된 설명은 현행 정책으로 사용하지 않는다.
