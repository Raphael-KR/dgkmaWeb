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

## 시작하기

1. [planning_proposal.md](./planning_proposal.md)에서 제품 정책, 현재 적용 상태와 다음 개발 목표를 확인합니다.
2. [AGENTS.md](./AGENTS.md)에서 기준 문서 적용, 사용자 결정의 문서 반영과 작업 수행 절차를 확인합니다.
3. GitHub `main`을 공유 소스로 사용하고, [replit.md](./replit.md)에 따라 Replit 개발 워크스페이스를 준비합니다.

현재는 남은 기능을 개발하는 단계입니다. Replit 개발 워크스페이스에서 구현하고 개발 직후 점검은 필요한 정적 검사로 최소화합니다. 실행 명령과 환경변수는 [replit.md](./replit.md), 별도로 요청된 기능 점검의 참고 절차와 과거 기록은 [walkthrough.md](./walkthrough.md)에서 확인합니다. 운영 배포와 실계정 QA는 보류 중입니다.

## 목적별 기준 문서

이 문서는 프로젝트와 문서를 찾는 진입점입니다. 기준 문서의 적용과 변경 절차는 [AGENTS.md](./AGENTS.md)를 따릅니다.

| 확인할 내용 | 문서 |
|---|---|
| 제품 목표·정책, 현재 구현 범위와 남은 기능 개발 | [planning_proposal.md](./planning_proposal.md) |
| AI Agent 작업 규칙, 기준 문서 확인·갱신, 변경·검증·보고 절차 | [AGENTS.md](./AGENTS.md) |
| 프로젝트 구조·소유권·의존 경계 | [docs/project-structure.md](./docs/project-structure.md) |
| 구조 개편 검증 기록 | [docs/structure-validation.md](./docs/structure-validation.md) |
| 정적 자산 배포·복구 정책 | [docs/static-asset-release-policy.md](./docs/static-asset-release-policy.md) |
| Replit 개발·배포·환경변수 운영 | [replit.md](./replit.md) |
| **최우선 DB 구조 기준**: 테이블·컬럼·객체·관계·무결성과 catalog 재검증 | [docs/database-schema.md](./docs/database-schema.md) |
| 개발·운영 DB 선택, 직접 연결, 변경·백업·복구·검증과 Secret 수명 관리 | [docs/database-operations.md](./docs/database-operations.md) |
| 별도로 요청된 개발·운영 점검의 참고 절차와 과거 기록 | [walkthrough.md](./walkthrough.md) |
| 부고 필수 정보, 표준 게시문, 초안·검증 규칙 | [docs/obituary-writing-guide.md](./docs/obituary-writing-guide.md) |

## 변경·설계 이력

과거 변경과 설계의 맥락은 다음 자료에서 확인합니다. 현재 정책과 개발 상태는 위의 담당 기준 문서에서 확인합니다.

- [CHANGELOG.md](./CHANGELOG.md): 버전별 추가·변경·보안 이력
- [docs/superpowers/](./docs/superpowers/): 과거 설계와 구현 계획. [경조사 통합 시스템 설계](./docs/superpowers/specs/2026-07-11-community-events-design.md) 등 당시 결정의 배경을 보존합니다.

## 개발 직후 정적 점검

코드 변경에 타입·의존 경계 확인이 필요하면 Replit 개발 워크스페이스에서 실행합니다.

```bash
npm run check
```

문서 변경은 내용·링크와 `git diff --check`만 확인합니다. 테스트·빌드·서버 재시작·smoke check를 일상 개발 뒤에 일괄 실행하지 않습니다. 상세 기준은 [AGENTS.md](./AGENTS.md#개발-직후-점검)를 따릅니다.

환경변수 값, 데이터베이스 URL, 토큰, SSH 개인키는 문서나 Git에 저장하지 않습니다.
