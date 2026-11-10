# dgkmaWeb

동국대학교한의과대학동문회의 공개 홈페이지와 회원 서비스를 제공하는 웹 애플리케이션입니다. 카카오 로그인, 동문 주소록, 게시판·경조사, 프로필과 내부 회비 납부 상태를 제공합니다. 실제 결제·메시지 발송 등 남은 기능은 [제품·개발 계획](docs/product/planning-proposal.md)에서 관리합니다.

## 시작하기

1. [AGENTS.md](AGENTS.md)에서 작업 절차와 실행 범위를 확인합니다.
2. [제품·개발 계획](docs/product/planning-proposal.md)에서 확정 정책과 남은 기능을 확인합니다.
3. [Replit 개발 시작 안내](docs/runbooks/development.md)에 따라 기존 워크스페이스·설정·필요한 정적 검사를 확인합니다.

공유 소스는 GitHub `main`이며 개발과 배포는 Replit을 사용합니다. 커밋된 소스, 미커밋 개발 사본, 마지막 운영 릴리스는 [현재 적용 상태](replit.md#현재-적용-상태)에서 구분합니다. 개발 직후 점검은 필요한 정적 검사로 최소화하고 실계정 QA는 계속 보류합니다.

## 서비스와 저장소

- [공개 홈페이지](https://dgkma.org): 동문회 공식 안내와 회원 서비스
- [GitHub 저장소](https://github.com/Raphael-KR/dgkmaWeb): 공유 소스
- [Replit 환경 구분](replit.md#환경-구분): 개발 주소·접속 역할·배포 대상

모든 게시글은 회원 전용입니다. 본문 정본은 Tiptap JSONB이며 경조사 사실 JSON과 구분합니다. 경조사는 짧은 텍스트·링크 입력, 필요한 추가 질문, 미리보기와 작성자 확인 후 게시 흐름을 사용합니다.

## 기술 구성

| 영역 | 구성 |
|---|---|
| 화면 | React, Vite, TypeScript, Tailwind CSS, TanStack Query, Wouter, Tiptap |
| 서버 | Node.js, Express, TypeScript |
| 데이터 | PostgreSQL, Drizzle ORM, Replit Object Storage |
| 인증 | 카카오 REST OAuth, PostgreSQL 세션 |
| 경조사 | 서버 OpenAI Responses API, 정적 작성기, 공통 공개 링크 수집기 |
| 개발·배포 | GitHub, Replit 개발 워크스페이스, Replit Deployments |

## 문서 찾기

[전체 문서 안내](docs/README.md)에서 목적별 기준서·결정·이력을 찾습니다.

| 목적 | 문서 |
|---|---|
| 제품 정책·남은 기능 | [제품·개발 계획](docs/product/planning-proposal.md) |
| 코드 소유권·의존 경계 | [프로젝트 구조](docs/architecture/project-structure.md) |
| 환경·Secrets·배포 | [replit.md](replit.md) |
| DB 구조·작업 | [스키마](docs/reference/database-schema.md), [운영 런북](docs/runbooks/database-operations.md) |
| 결정 이유·변경 결과 | [ADR](docs/decisions/README.md), [변경 요약](CHANGELOG.md), [수행 이력](docs/history/README.md) |

문서·코드 편집은 DB 변경이나 운영 배포를 포함하지 않습니다. 환경변수 값, DB URL, 토큰과 SSH 개인키는 문서나 Git에 저장하지 않습니다.
