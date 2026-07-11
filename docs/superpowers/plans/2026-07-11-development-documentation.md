# Development Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 코드와 Replit 운영 상태를 기준으로 개발 운영 문서를 현행화하고 `AGENTS.md`를 유일한 AI 작업 규칙 문서로 만든다.

**Architecture:** 장기 비전, 실행 로드맵, 기능 검증, 인프라 운영, 변경 이력의 책임을 서로 다른 Markdown 파일로 분리한다. `README.md`가 전체 문서의 진입점이 되며, 과거 변경 이력은 보존하되 현재 상태는 운영 문서와 `Unreleased`에서 명확히 설명한다.

**Tech Stack:** Markdown, Git, Replit, GitHub, React/Vite/Express/PostgreSQL 코드 참조

## Global Constraints

- 애플리케이션 소스 코드와 데이터베이스를 변경하지 않는다.
- `KIKcd_B.20250701.txt`와 `KIKcd_B.20250701.xlsx`를 수정하거나 커밋하지 않는다.
- 환경변수는 이름만 기록하고 실제 값, 토큰, 데이터베이스 URL, 개인키를 기록하지 않는다.
- 현재 구현과 향후 목표를 같은 상태로 표현하지 않는다.
- 검증되지 않은 기능에 `완료`, `정상`, `연동됨`을 사용하지 않는다.
- Replit 개발 워크스페이스, 개발 DB, 배포 프로덕션 DB, 프로덕션 SQL 콘솔의 역할을 구분한다.
- 문서 작업이므로 `npm run check`와 `npm run build`는 필수 검증에서 제외한다.

---

### Task 1: AI 작업 규칙 단일화

**Files:**
- Add to Git: `AGENTS.md`
- Delete: `CLAUDE.md`

**Interfaces:**
- Consumes: 현재 `AGENTS.md`와 `CLAUDE.md`의 동일한 프로젝트 규칙
- Produces: 이후 모든 문서가 참조할 유일한 AI 작업 규칙 `AGENTS.md`

- [ ] **Step 1: 두 규칙 파일의 차이가 제목과 도구명뿐인지 확인**

Run:

```bash
diff -u CLAUDE.md AGENTS.md
```

Expected: `# CLAUDE.md`/`Claude Code`가 `# AGENTS.md`/`Codex`로 바뀐 두 줄만 출력되고 종료 코드는 `1`이다.

- [ ] **Step 2: `AGENTS.md`를 추적하고 `CLAUDE.md`를 삭제**

Run:

```bash
git add AGENTS.md
git rm CLAUDE.md
```

Expected: `AGENTS.md`는 추가, `CLAUDE.md`는 삭제 상태다.

- [ ] **Step 3: 범위 확인**

Run:

```bash
git diff --cached --name-status
```

Expected:

```text
A       AGENTS.md
D       CLAUDE.md
```

- [ ] **Step 4: 커밋**

```bash
git commit -m "Consolidate AI instructions in AGENTS"
```

### Task 2: 장기 기획과 실행 로드맵 분리

**Files:**
- Modify: `planning_proposal.md`
- Create: `roadmap.md`

**Interfaces:**
- Consumes: 승인된 설계 명세와 현재 구현 상태
- Produces: 장기 비전 문서와 우선순위 기반 실행 계획

- [ ] **Step 1: 현재 기획서에 구현 상태가 없음을 확인**

Run:

```bash
rg -n '구현 완료|부분 구현|미구현|정책 결정 필요' planning_proposal.md
```

Expected: 일치 결과가 없다.

- [ ] **Step 2: `planning_proposal.md`에 문서 역할과 상태 범례 추가**

문서 제목 아래에 다음 내용을 추가한다.

```markdown
> 이 문서는 장기 제품 비전과 정책 방향을 다룹니다. 실제 개발 순서와 완료 조건은 [roadmap.md](./roadmap.md), 현재 검증 가능한 기능은 [walkthrough.md](./walkthrough.md)를 기준으로 합니다.

상태 표기: `구현 완료`, `부분 구현`, `미구현`, `정책 결정 필요`
```

각 기능에는 다음 상태를 명시한다.

- 회원 자동 매칭: `부분 구현` — 현재 Google Sheets 조회에 의존
- 불일치 가입 처리: `정책 결정 필요` — 기획서는 거부, 현재 구현은 승인 대기
- 동문 주소록: `구현 완료` — 로그인, 기수/지역 범위, 최소 필드 노출
- 게시판: `부분 구현` — 글, 댓글, 첨부는 완료; 계획 분류와 운영 분류 불일치
- 부고: `부분 구현` — 목록, 작성, 상세, 정규식 파싱 완료; AI, 링크, 발송, 주문, 결제 미구현
- 회비: `부분 구현` — 내부 납부 기록과 권리회원 표시만 구현; 실제 결제 미구현
- 경조사 결제, 장학, 분석: `미구현`

- [ ] **Step 3: `roadmap.md` 작성**

다음 구조와 과제를 사용한다.

```markdown
# 개발 로드맵

## 상태 정의
- `완료`: 프로덕션에서 검증됨
- `진행 예정`: 다음 개발 대상으로 확정
- `정책 결정 필요`: 구현 전 운영 결정 필요
- `보류`: 선행 조건 이후 진행

## 긴급
| 과제 | 상태 | 완료 조건 | 선행 조건 |
| 관리자 API 보호 | 진행 예정 | 모든 `/api/admin/*`가 비로그인 401, 일반회원 403, 관리자 성공 | 공통 `requireAdmin` 정책 |
| 결제 기록 보호 | 진행 예정 | 공개 생성 차단, 신뢰 가능한 관리자 또는 결제 콜백만 기록 | 결제 기록 작성 주체 결정 |
| 부고 API 접근 정책 | 정책 결정 필요 | 목록·상세·파싱의 공개 범위를 서버와 화면에 동일 적용 | 부고 공개 범위 결정 |

## 다음
```

`다음`에는 다음 행을 작성한다.

| 과제 | 상태 | 완료 조건 | 선행 조건 |
|---|---|---|---|
| 가입 불일치 정책 | 정책 결정 필요 | 즉시 거부 또는 승인 대기 중 하나를 확정하고 기획·API·화면 문구를 일치시킴 | 운영진 결정 |
| 게시판 분류 | 정책 결정 필요 | 운영 카테고리 이름과 순서를 확정하고 기획서와 DB seed 기준을 일치시킴 | 운영진 결정 |
| PostgreSQL 기준 명부 일원화 | 진행 예정 | 로그인 매칭이 PostgreSQL을 조회하고 Google Sheets는 명시적인 import에만 사용됨 | 가입 정책 확정 |
| 운영 DB 변경 절차 | 진행 예정 | 스키마 변경과 seed를 분리한 실행·검증·복구 절차가 문서화됨 | 명부 기준 확정 |
| 개인정보 로그 제거 | 진행 예정 | 동문 원본 행·전화번호·주소가 애플리케이션 로그에 출력되지 않음 | 없음 |

`이후`에는 다음 행을 모두 `보류`로 작성한다.

| 과제 | 상태 | 완료 조건 | 선행 조건 |
|---|---|---|---|
| 알림톡·SMS | 보류 | 수신 동의, 발송 승인, 발송 이력, 실패 재시도가 검증됨 | 부고 접근 정책 |
| 실제 결제 | 보류 | 결제 승인 콜백, 중복 방지, 실패·취소·환불, 영수증이 검증됨 | 결제 기록 보호 |
| 화환 주문 | 보류 | 주문 상태와 관리자 처리 흐름이 검증됨 | 실제 결제 또는 후불 정책 |
| 장학사업 | 보류 | 선발·지급·공시 범위와 개인정보 정책이 확정됨 | 운영 정책 확정 |
| 분석 | 보류 | 집계 지표와 개인정보 비식별 기준이 확정됨 | 데이터 품질 안정화 |

- [ ] **Step 4: 상태와 링크 확인**

Run:

```bash
rg -n '구현 완료|부분 구현|미구현|정책 결정 필요|roadmap\.md|walkthrough\.md' planning_proposal.md roadmap.md
```

Expected: 두 문서에서 상태 용어와 상호 링크가 출력된다.

- [ ] **Step 5: 커밋**

```bash
git add planning_proposal.md roadmap.md
git commit -m "Separate product vision from development roadmap"
```

### Task 3: Replit 운영 문서 현행화

**Files:**
- Rewrite: `replit.md`

**Interfaces:**
- Consumes: `.replit`, `AGENTS.md`, 실제 GitHub/Replit 동기화 및 배포 검증 결과
- Produces: 개발·배포 운영의 단일 기준 문서

- [ ] **Step 1: 오래된 현재 구성 표현 확인**

Run:

```bash
rg -n 'Supabase|JavaScript SDK|KAKAO_JAVASCRIPT_KEY|spock\.replit\.dev|Google SSO' replit.md
```

Expected: 현재 구성으로 읽히면 안 되는 과거 표현이 출력된다.

- [ ] **Step 2: `replit.md`를 현재 운영 구조로 교체**

다음 최상위 구조를 사용한다.

```markdown
# Replit 개발 및 배포 운영

## 환경 구분
## GitHub 동기화
## 환경변수
## 데이터베이스 운영
## 검증
## 배포
## 장애 확인 순서
```

필수 사실을 다음처럼 기록한다.

- GitHub `main`이 공유 소스 기준이며 로컬과 Replit 개발 워크스페이스가 이를 pull/push한다.
- SSH는 `/home/runner/workspace` 개발 워크스페이스 접속이며 autoscale 프로덕션 인스턴스 접속이 아니다.
- 개발 DB와 프로덕션 DB는 분리되어 있고, 운영 데이터 SQL은 프로덕션 SQL 콘솔에서 실행한다.
- 검증은 Replit 개발 워크스페이스에서 `npm run check`, `npm run build` 순서로 실행한다.
- 프로덕션 반영은 Replit Deployments의 Republish 후 공개 API와 로그인 흐름을 점검한다.
- 현재 OAuth는 카카오 REST authorize URL 방식이며 redirect URI는 `https://dgkma.replit.app/kakao-callback`이다.

환경변수 이름은 다음 그룹으로만 기록한다.

- 필수 서버: `DATABASE_URL`, `SESSION_SECRET`, `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI`, `PRIVATE_OBJECT_DIR`
- 필수 클라이언트: `VITE_KAKAO_REST_API_KEY`, `VITE_KAKAO_REDIRECT_URI`
- 현재 동문 명부 연동: `ALUMNI_SPREADSHEET_ID`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- 선택 운영: `APP_URL`, `DEBUG_KAKAO_AUTH`, `PUBLIC_OBJECT_SEARCH_PATHS`, `VITE_KAKAO_CHANNEL_URL`

- [ ] **Step 3: 오래된 현재 구성 표현 제거 확인**

Run:

```bash
rg -n 'Supabase|JavaScript SDK|KAKAO_JAVASCRIPT_KEY|Google SSO' replit.md
```

Expected: 출력이 없고 종료 코드는 `1`이다.

- [ ] **Step 4: 필수 운영 구분 확인**

Run:

```bash
rg -n '개발 DB|프로덕션 DB|SSH|npm run check|npm run build|Republish|dgkma\.replit\.app/kakao-callback' replit.md
```

Expected: 모든 운영 키워드가 해당 절에서 출력된다.

- [ ] **Step 5: 커밋**

```bash
git add replit.md
git commit -m "Update Replit development and deployment guide"
```

### Task 4: 프로덕션 기능 검증 가이드 현행화

**Files:**
- Rewrite: `walkthrough.md`

**Interfaces:**
- Consumes: `client/src/App.tsx`, `server/routes.ts`, `shared/schema.ts`, 완료된 프로덕션 테스트
- Produces: 현재 배포본 기준 수동 회귀 테스트 체크리스트

- [ ] **Step 1: 부정확한 기능 표현 확인**

Run:

```bash
rg -n 'AI 자동 파싱|SSE|부고 포함|역할: admin/member/pending|승인 후 권리회원' walkthrough.md
```

Expected: 현재 구현과 맞지 않는 설명이 출력된다.

- [ ] **Step 2: `walkthrough.md`를 체크리스트 형식으로 교체**

다음 구조를 사용한다.

```markdown
# 프로덕션 기능 검증 가이드

## 검증 전 조건
## 공개 페이지
## 카카오 로그인과 온보딩
## 게시판·댓글·이미지
## 동문 주소록
## 부고
## 프로필·권리회원
## 관리자 기능 주의사항
## 배포 전후 기술 검증
```

각 기능은 `- [ ]` 체크박스로 작성한다. 게시판에는 카테고리 5개 조회, 글 작성/상세, 댓글 작성/삭제, JPEG/PNG 첨부, 10MB 초과 및 허용되지 않은 MIME 오류 메시지를 포함한다. 부고 파싱은 `정규식 기반 문자 파싱`으로 표현한다. 관리자 절에는 서버 권한 보완 전까지 API 직접 사용을 운영 주의사항으로 표시한다.

기술 검증에는 다음 명령과 기대 결과를 기록한다.

```bash
npm run check
npm run build
curl -sS https://dgkma.replit.app/api/categories
```

Expected: 두 npm 명령은 종료 코드 `0`, 카테고리 API는 `all`, `notice`, `free`, `event`, `news`를 반환한다.

- [ ] **Step 3: 잘못된 표현 제거 확인**

Run:

```bash
rg -n 'AI 자동 파싱|SSE|부고 포함|역할: admin/member/pending|승인 후 권리회원' walkthrough.md
```

Expected: 출력이 없고 종료 코드는 `1`이다.

- [ ] **Step 4: 새 검증 범위 확인**

Run:

```bash
rg -n '댓글|이미지|10MB|정규식|활동 지역|권리회원|npm run check|npm run build' walkthrough.md
```

Expected: 모든 새 검증 범위가 출력된다.

- [ ] **Step 5: 커밋**

```bash
git add walkthrough.md
git commit -m "Refresh production feature walkthrough"
```

### Task 5: 문서 진입점과 최신 변경 이력 완성

**Files:**
- Rewrite: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Tasks 1-4에서 확정된 문서 역할과 현재 기능 상태
- Produces: 저장소 문서 진입점과 최신 배포 변경 이력

- [ ] **Step 1: `README.md` 작성**

다음 구조를 사용한다.

```markdown
# dgkmaWeb

동국대학교한의과대학동문회 웹 애플리케이션입니다.

## 운영 주소
## 기술 구성
## 개발 및 배포 흐름
## 개발 운영 문서
## 기본 검증
```

운영 주소는 `https://dgkma.replit.app`으로 기록한다. 개발 및 배포 흐름은 `GitHub main → Replit 개발 워크스페이스 pull → npm run check/build → Republish → 프로덕션 점검`으로 기록한다.

개발 운영 문서 표에는 다음 항목과 역할을 넣는다.

- `planning_proposal.md`: 장기 비전과 제품 정책
- `roadmap.md`: 개발 우선순위와 완료 조건
- `walkthrough.md`: 프로덕션 기능 검증
- `replit.md`: Replit 개발·배포·DB 운영
- `CHANGELOG.md`: 버전별 변경 이력
- `AGENTS.md`: Codex 작업 규칙

- [ ] **Step 2: `CHANGELOG.md`에 `Unreleased` 추가**

`1.1.0` 위에 다음 분류와 변경을 기록한다.

```markdown
## [Unreleased]

### Added
- 활동 지역 온보딩과 기수·지역 범위 기반 동문 주소록
- 권리회원 상태 및 당해 연회비 납부 표시
- 게시판 댓글, 이미지 첨부, 부고 상세 화면

### Changed
- 카카오 로그인 v5를 REST OAuth authorize URL과 서버 토큰 교환 방식으로 정리
- 카카오 로그인 완료 전에 PostgreSQL 세션 저장을 보장

### Security
- 게시판 작성자·댓글 작성자 식별을 세션 기준으로 제한
- 카테고리 생성 API를 관리자 전용으로 제한
- 이미지 업로드를 10MB 이하 JPG, PNG, WebP, GIF로 제한하고 안전한 MIME만 인라인 제공
```

과거 버전 항목은 수정하거나 삭제하지 않는다.

- [ ] **Step 3: Markdown 내부 링크 검증**

Run:

```bash
node --input-type=module -e 'import fs from "node:fs"; const files=["README.md","planning_proposal.md","roadmap.md","walkthrough.md","replit.md","CHANGELOG.md","AGENTS.md"]; let bad=[]; for (const file of files) { const text=fs.readFileSync(file,"utf8"); for (const m of text.matchAll(/\]\((\.\/?[^)#]+\.md)(?:#[^)]+)?\)/g)) { const target=m[1].replace(/^\.\//,""); if (!fs.existsSync(target)) bad.push(`${file} -> ${target}`); } } if (bad.length) { console.error(bad.join("\n")); process.exit(1); } console.log("Markdown links OK");'
```

Expected: `Markdown links OK`와 종료 코드 `0`.

- [ ] **Step 4: `CLAUDE.md` 제거와 참조 상태 검증**

Run:

```bash
test ! -e CLAUDE.md
rg -n 'CLAUDE\.md' README.md planning_proposal.md roadmap.md walkthrough.md replit.md CHANGELOG.md AGENTS.md
```

Expected: 첫 명령은 종료 코드 `0`; 두 번째 명령은 출력이 없고 종료 코드 `1`.

- [ ] **Step 5: 비밀값과 오래된 현재 구성 표현 점검**

Run:

```bash
rg -n 'postgres(ql)?://|BEGIN [A-Z ]*PRIVATE KEY|KAKAO_JAVASCRIPT_KEY|Supabase backend|Google SSO' README.md planning_proposal.md roadmap.md walkthrough.md replit.md AGENTS.md
```

Expected: 출력이 없고 종료 코드는 `1`.

- [ ] **Step 6: 전체 변경 범위와 Markdown 형식 검증**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` 출력 없음. Tasks 1-4의 파일은 이미 커밋되어 있고, 현재 추적 파일 변경은 `README.md`와 `CHANGELOG.md`뿐이다. KIK 자료는 untracked 상태로 유지된다.

- [ ] **Step 7: 커밋**

```bash
git add README.md CHANGELOG.md
git commit -m "Add documentation index and recent changelog"
```

- [ ] **Step 8: 최종 커밋 및 상태 확인**

Run:

```bash
git log --oneline -7
git status --short --branch
```

Expected: 문서 정리 커밋 5개가 표시되고, 추적 파일 변경은 없으며 KIK 자료 두 파일만 untracked로 남는다.
