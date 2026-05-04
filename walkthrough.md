# 기능 구현 및 검증 가이드

이 문서는 동국대학교 한의과대학 동문회 웹사이트에 구현된 기능과 검증 방법을 설명합니다.

## 사이트 구조 개요

- **공개 페이지**: 로그인 없이 접근 가능 (`/about/*`, `/terms`, `/privacy`)
- **회원 전용 페이지**: 카카오 로그인 후 접근 가능 (`/b`, `/o`, `/directory`, `/heritage`, `/profile`, `/search`)
- **관리자 전용**: `/admin`

---

## 공개 페이지

### 홈 (`/`)
- 비로그인: 동문회 소개 랜딩 페이지 표시
- 로그인 후: 회원 홈으로 전환 (게시판 피드, 부고 알림 등)

### 동문회 소개 (`/about/*`)

| 경로 | 내용 |
|------|------|
| `/about/intro` | 동문회 연혁 및 소개 |
| `/about/executives` | 현 임원진 명단 |
| `/about/bylaws` | 동문회 회칙 |
| `/about/join` | 가입 안내 및 신청 |
| `/about/dues` | 회비 안내 및 혜택 |
| `/about/condolence` | 경조사 지원 안내 |

**검증**: 상단 내비게이션 또는 직접 URL 접근으로 각 페이지 내용 확인.

---

## 회원 전용 페이지

### 로그인 (`/login`)
- 카카오 OAuth 로그인
- 첫 로그인 시 가입 신청(준회원) → 관리자 승인 후 권리회원 전환

### 게시판 (`/b`)
- 카테고리 기반 통합 게시판 (카테고리는 관리자가 DB에서 관리)
- 카테고리 탭 전환, 게시글 작성·조회 가능
- **검증**: `/b` 접근 → 탭 전환 확인 → "글쓰기" 버튼으로 작성 다이얼로그 확인

### 부고 알림 (`/o`, `/o/new`)
- **목록** (`/o`): 등록된 부고를 카드 형태로 표시
- **작성** (`/o/new`): 두 가지 입력 방식 제공
  - **AI 자동 파싱**: 부고 문자(SMS)를 붙여넣고 "분석" 클릭 → 폼 자동 채움 (`POST /api/obituary/parse`)
  - **직접 입력**: 고인 정보, 빈소, 일시를 수동 입력
- **검증**: `/o/new` → 샘플 부고 문자 붙여넣기 → AI 파싱 결과 확인 → 등록 후 `/o` 목록 확인

### 동문 명부 (`/directory`)
- 동문 검색 (이름·기수·학과 기반)
- 데이터 출처: `alumni_database` 테이블 (`POST /api/admin/sync-alumni`로 Google Sheets에서 동기화)
- **검증**: `/directory` → 검색창에 이름 입력 → 필터링 확인

### 역사관 (`/heritage`)
- 동문회 역사 사진·자료 갤러리 (회원 전용)
- **검증**: 로그인 후 `/heritage` 접근 확인

### 프로필 (`/profile`)
- 회원 본인 정보 조회 및 수정

### 통합 검색 (`/search`)
- 게시글 전문 검색 (`GET /api/posts/search`)

---

## 관리자 페이지 (`/admin`)

| 기능 | 설명 |
|------|------|
| 가입 승인 대기 | 신규 가입 신청 승인·거절 (`PATCH /api/admin/pending-registrations/:id`) |
| 동문 DB 동기화 | Google Sheets → `alumni_database` 테이블 동기화 (`POST /api/admin/sync-alumni`) |
| 동기화 진행 상황 | SSE로 실시간 진행률 표시 (`GET /api/admin/sync-progress`) |

**검증**: 관리자 계정 로그인 후 `/admin` 접근 → 각 탭 기능 확인

---

## 주요 API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/api/auth/kakao` | 카카오 로그인 처리 |
| `GET` | `/api/auth/me` | 현재 로그인 사용자 정보 |
| `GET` | `/api/categories` | 게시판 카테고리 목록 |
| `GET` | `/api/posts` | 게시글 목록 (카테고리 필터 지원) |
| `POST` | `/api/posts` | 게시글 작성 |
| `POST` | `/api/obituary/parse` | 부고 문자 AI 파싱 |
| `GET` | `/api/admin/pending-registrations` | 가입 대기 목록 |
| `POST` | `/api/admin/sync-alumni` | Google Sheets 동기화 실행 |

---

## 데이터베이스 스키마 (`shared/schema.ts`)

| 테이블 | 설명 |
|--------|------|
| `users` | 회원 정보 (카카오 ID, 역할: admin/member/pending) |
| `categories` | 게시판 카테고리 (displayName, color, sortOrder 등) |
| `posts` | 통합 게시글 (부고 포함, categoryId로 분류) |
| `payments` | 회비 납부 내역 |
| `alumni_database` | Google Sheets에서 동기화된 동문 DB |
| `pending_registrations` | 가입 승인 대기 목록 |

---

## 기술 검증

```bash
npm run build   # 빌드 확인
npm run dev     # 개발 서버 실행 (포트 5000)
```

---

## 구 경로 리다이렉트

하위 호환을 위해 구 경로는 자동 리다이렉트됩니다.

| 구 경로 | 리다이렉트 대상 |
|---------|--------------|
| `/about` | `/heritage` |
| `/info` | `/heritage` |
| `/executives` | `/about/executives` |
| `/officers` | `/about/executives` |
| `/bylaws` | `/about/bylaws` |
| `/history` | `/heritage` |
