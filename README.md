# dgkmaWeb

동국대학교한의과대학동문회의 공개 홈페이지와 회원 서비스를 제공하는 웹 애플리케이션입니다. 카카오 로그인, 동문 주소록, 게시판, 부고, 회비 납부 상태 표시를 한 서비스에서 운영합니다.

## 운영 주소

- 개발 서버: [https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev](https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev)
- 프로덕션: [https://dgkma.org](https://dgkma.org)
- 소스 저장소: [Raphael-KR/dgkmaWeb](https://github.com/Raphael-KR/dgkmaWeb)

## 기술 구성

| 영역 | 구성 |
|---|---|
| 프론트엔드 | React, Vite, TypeScript, Tailwind CSS, TanStack Query, Wouter |
| 백엔드 | Node.js, Express, TypeScript |
| 데이터베이스 | PostgreSQL, Drizzle ORM |
| 인증 | 카카오 REST OAuth, PostgreSQL 세션 |
| 파일 | Replit Object Storage |
| 개발·배포 | GitHub, Replit 개발 워크스페이스, Replit Deployments |

## 개발 및 배포 흐름

공유 소스 기준은 GitHub `main`입니다.

```text
GitHub main
  -> Replit 개발 워크스페이스 pull
  -> npm run check
  -> npm run build
  -> 개발 서버에서 화면·기능 확인
  -> Replit Republish
  -> dgkma.org 프로덕션 기능 점검
```

개발 중에는 Replit 개발 서버에서 반복 확인하며, 단순 확인을 위해 Republish하지 않습니다. Replit 개발 DB와 프로덕션 DB는 분리되어 있으므로 스키마와 운영 데이터 변경은 환경별로 적용하고 결과를 각각 확인해야 합니다. 상세 절차는 [replit.md](./replit.md)를 따릅니다.

## 개발 운영 문서

| 문서 | 역할 |
|---|---|
| [planning_proposal.md](./planning_proposal.md) | 제품 비전, 확정 정책, 현재 상태, 개발 우선순위와 완료 조건을 관리하는 통합 계획서 |
| [walkthrough.md](./walkthrough.md) | 현재 프로덕션 기능의 수동 회귀 테스트 |
| [replit.md](./replit.md) | Replit 개발·배포·환경변수·DB 운영 절차 |
| [docs/database-operations.md](./docs/database-operations.md) | 개발·운영 DB 선택, SSH 직접 연결, 변경·검증·Secret 수명 관리 |
| [CHANGELOG.md](./CHANGELOG.md) | 버전별 추가·변경·보안 이력 |
| [AGENTS.md](./AGENTS.md) | Codex가 이 저장소에서 따르는 작업 규칙 |
| [docs/obituary-writing-guide.md](./docs/obituary-writing-guide.md) | 부고 필수 정보, 표준 게시문, 초안·검증 규칙 |
| [경조사 통합 시스템 설계](./docs/superpowers/specs/2026-07-11-community-events-design.md) | 부고·결혼·개원·기타 통합 모델과 파싱·보안·마이그레이션 설계 |

문서 내용이 충돌하면 프로덕션에서 검증된 동작, 현재 `main` 코드와 Replit 설정, `AGENTS.md`, 기존 운영 문서, 과거 기획과 변경 이력 순서로 확인합니다.

## 기본 검증

Replit 개발 워크스페이스에서 실행합니다.

```bash
npm run check
npm run build
```

배포 후에는 [walkthrough.md](./walkthrough.md)의 체크리스트로 공개 페이지, 카카오 로그인, 게시판·첨부·댓글, 동문 주소록, 부고, 회원 상태를 확인합니다.

환경변수 값, 데이터베이스 URL, 토큰, SSH 개인키는 문서나 Git에 저장하지 않습니다.
