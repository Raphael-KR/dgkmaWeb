# dgkmaWeb

동국대학교한의과대학동문회의 공개 홈페이지와 회원 서비스를 제공하는 웹 애플리케이션입니다. 카카오 로그인, 동문 주소록, 게시판, 부고, 회비 납부 상태 표시를 한 서비스에서 운영합니다.

## 운영 주소

- 프로덕션: [https://dgkma.replit.app](https://dgkma.replit.app)
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
  -> Replit Republish
  -> 프로덕션 기능 점검
```

Replit 개발 DB와 프로덕션 DB는 분리되어 있습니다. 스키마와 운영 데이터 변경은 환경별로 적용하고 결과를 각각 확인해야 합니다. 상세 절차는 [replit.md](./replit.md)를 따릅니다.

## 개발 운영 문서

| 문서 | 역할 |
|---|---|
| [planning_proposal.md](./planning_proposal.md) | 장기 제품 비전과 정책 방향 |
| [roadmap.md](./roadmap.md) | 개발 우선순위, 상태, 완료 조건, 선행 조건 |
| [walkthrough.md](./walkthrough.md) | 현재 프로덕션 기능의 수동 회귀 테스트 |
| [replit.md](./replit.md) | Replit 개발·배포·환경변수·DB 운영 절차 |
| [CHANGELOG.md](./CHANGELOG.md) | 버전별 추가·변경·보안 이력 |
| [AGENTS.md](./AGENTS.md) | Codex가 이 저장소에서 따르는 작업 규칙 |

문서 내용이 충돌하면 프로덕션에서 검증된 동작, 현재 `main` 코드와 Replit 설정, `AGENTS.md`, 기존 운영 문서, 과거 기획과 변경 이력 순서로 확인합니다.

## 기본 검증

Replit 개발 워크스페이스에서 실행합니다.

```bash
npm run check
npm run build
```

배포 후에는 [walkthrough.md](./walkthrough.md)의 체크리스트로 공개 페이지, 카카오 로그인, 게시판·첨부·댓글, 동문 주소록, 부고, 회원 상태를 확인합니다.

환경변수 값, 데이터베이스 URL, 토큰, SSH 개인키는 문서나 Git에 저장하지 않습니다.
