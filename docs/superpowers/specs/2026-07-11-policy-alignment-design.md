# 회원·부고·게시판 정책 정합화 설계

## 목적

운영진이 승인한 다음 정책을 서버 동작, 화면 선택지, 기준 문서와 재현 가능한 운영 데이터 정의에 일치시킨다.

- 부고 목록·상세·문자 파싱·등록은 로그인 회원 전용이다.
- 동문 명부와 일치하지 않는 가입자는 즉시 거부하지 않고 관리자 승인 대기로 접수한다.
- 게시판의 실제 글 분류는 `공지`, `자유`, `행사`, `소식`이다.
- `전체`는 목록 조회 필터이며 게시글에 지정할 수 있는 분류가 아니다.

## 현재 상태

- 클라이언트 부고 화면은 인증 게이트 안에 있지만 `GET /api/obituaries`, `GET /api/obituaries/:id`, `POST /api/obituary/parse`는 비로그인 요청을 허용한다.
- 부고 등록만 라우트 내부에서 세션을 직접 검사한다.
- 명부 불일치 가입자는 이미 `202`와 승인 대기 안내를 반환하고 `pending_registrations`에 저장한다.
- 약관과 관리자 화면은 승인 대기 흐름을 설명하지만 `planning_proposal.md`는 가입 거부를 기본안으로 남겨 두었다.
- 프로덕션 카테고리는 `all`, `notice`, `free`, `event`, `news` 순으로 존재하고 화면은 `all`만 글쓰기 선택지에서 제외한다.
- 서버 게시글 작성 API는 `categoryId`가 실제 활성 글 분류인지 확인하지 않아 `all`, 비활성 분류 또는 정책 밖 분류를 직접 요청으로 지정할 수 있다.

## 부고 접근 정책

### 공통 로그인 미들웨어

`server/auth-middleware.ts`에 `requireAuthenticated`를 추가한다. 이 미들웨어는 `req.session.userId` 존재 여부만 확인한다.

- 세션 사용자 ID가 없으면 `401`과 `로그인이 필요합니다`를 반환한다.
- 세션 사용자 ID가 있으면 다음 핸들러를 호출한다.
- 사용자 객체, 요청 본문 또는 URL 식별자를 인증 근거로 사용하지 않는다.

관리자 미들웨어처럼 DB에서 사용자를 다시 조회하지 않는 이유는 기존 회원 전용 API가 세션 사용자 ID를 인증 기준으로 사용하고, 모든 부고 읽기·파싱 요청에 추가 DB 조회를 만들 필요가 없기 때문이다. 삭제된 사용자 세션의 즉시 무효화는 전체 세션 정책을 정비할 때 별도 처리한다.

### 라우트 적용

첫 부고 라우트 등록 전에 다음 두 경로 네임스페이스에 공통 미들웨어를 적용한다.

```ts
app.use("/api/obituary", requireAuthenticated);
app.use("/api/obituaries", requireAuthenticated);
```

이에 따라 다음 요청이 모두 동일한 인증 경계를 사용한다.

- `POST /api/obituary/parse`
- `GET /api/obituaries`
- `GET /api/obituaries/:id`
- `POST /api/obituaries`

부고 등록 라우트의 중복 세션 검사는 제거하고 `authorId`는 계속 `req.session.userId`에서만 가져온다. TypeScript가 미들웨어 이후의 세션 값을 정적으로 보장하지 못하므로 등록 핸들러에서는 세션 ID를 지역 변수로 읽고, 예외 상황에는 `401`을 반환하는 방어 코드를 유지할 수 있다.

공개 경조사 안내 페이지 `/about/condolence`는 API 부고 데이터와 별개이므로 로그인 없이 유지한다.

## 게시판 분류 정책

### 공유 정책 모듈

`shared/category-policy.ts`를 만들고 게시글에 지정할 수 있는 영문 분류 이름을 단일 상수로 관리한다.

```ts
export const POST_CATEGORY_NAMES = ["notice", "free", "event", "news"] as const;
```

같은 모듈에서 구조적 타입을 받는 `isSelectablePostCategory`를 제공한다. 분류가 존재하고, `isActive === true`이며, 이름이 위 목록에 포함될 때만 참이다.

### 서버 검증

`POST /api/posts`는 Zod 입력 검증 후 `storage.getCategory(categoryId)`로 실제 분류를 조회한다.

- `categoryId` 누락 또는 `null`: `400`
- 존재하지 않는 분류: `400`
- `all`: `400`
- 비활성 분류: `400`
- 정책 목록에 없는 활성 분류: `400`
- `notice`, `free`, `event`, `news` 중 활성 분류: 기존 게시글 작성 계속

오류 응답은 `게시글 카테고리를 선택해주세요`로 통일한다. `authorId` 세션 강제와 이미지 경로 검증은 그대로 유지한다.

### 클라이언트 선택지

글쓰기 화면도 `isSelectablePostCategory`를 사용한다. 현재처럼 단순히 `all`만 제외하지 않고 활성 상태와 승인된 네 이름을 모두 확인한다. 서버가 최종 권한 경계이며 클라이언트 필터는 일관된 사용자 경험을 위한 보조 검증이다.

### 운영 seed

`scripts/seed-categories.sql`을 추가한다. SQL은 다음 다섯 행을 고정 순서로 upsert한다.

| name | display_name | 역할 | sort_order |
|---|---|---|---|
| `all` | `전체` | 예약 목록 필터 | 0 |
| `notice` | `공지` | 글 분류 | 1 |
| `free` | `자유` | 글 분류 | 2 |
| `event` | `행사` | 글 분류 | 3 |
| `news` | `소식` | 글 분류 | 4 |

기존 색상과 배지 variant를 유지하고 `ON CONFLICT (name) DO UPDATE`로 재실행 가능하게 한다. 이번 프로덕션 데이터는 이미 이 기준과 일치하므로 SQL 파일만 추가하고 개발·프로덕션 DB에는 실행하지 않는다.

## 가입 불일치 정책

현재 서버 동작과 화면을 유지하고 기준 문서의 모순만 제거한다.

- 명부 불일치 시 `pending_registrations`에 저장
- API는 `202`와 관리자 승인 대기 안내 반환
- 즉시 사용자 계정이나 세션을 만들지 않음
- 관리자가 승인 또는 거절

`planning_proposal.md`의 가입 거부 설명을 승인 대기로 교체하고 `walkthrough.md`의 미결정 문장을 확정 정책으로 바꾼다. `terms.tsx`와 관리자 화면은 이미 승인 정책과 일치하므로 기능 변경하지 않는다.

## 테스트

### 인증 미들웨어

- 세션 사용자 ID가 없으면 `401`
- 세션 사용자 ID가 있으면 `next` 한 번 호출

### 실제 HTTP 부고 경계

테스트 Express 서버에서 다음을 확인한다.

- 비로그인 문자 파싱 `401`
- 비로그인 목록 `401`
- 비로그인 상세 `401`
- 비로그인 등록 `401`
- 로그인 회원 문자 파싱 성공 `200`

비로그인 요청은 인증 미들웨어에서 중단되므로 DB를 읽거나 쓰지 않는다. 로그인 성공 경로는 DB가 필요 없는 문자 파싱으로 확인한다.

### 카테고리 정책

- 네 승인 분류이면서 활성 상태면 선택 가능
- `all`, 비활성 분류, 정책 밖 분류, 미존재 분류는 선택 불가
- 서버 라우트가 `storage.getCategory`와 공유 정책 함수를 사용함
- 클라이언트 글쓰기 선택지가 같은 공유 정책 함수를 사용함

### 회귀 검증

Replit 개발 워크스페이스에서 다음을 실행한다.

```bash
npm test
npm run check
npm run build
```

## 문서 상태

- `planning_proposal.md`: 세 정책을 확정된 현재 기준으로 변경
- `walkthrough.md`: 부고 비로그인 `401`, 회원 파싱·목록·상세·등록과 승인 대기 가입 흐름을 검증 항목으로 기록
- `roadmap.md`: 부고 접근은 Republish 전 `진행 중`, 가입 불일치는 실제 불일치 계정 검증 전 `진행 중`, 게시판 분류는 기존 프로덕션 검증 근거로 `기능 검증 완료` 표시
- `CHANGELOG.md`: 인증과 정책 정합화 변경 기록

## 배포 검증

Republish 후 비로그인 요청으로 다음을 확인한다.

```bash
curl -i https://dgkma.replit.app/api/obituaries
curl -i https://dgkma.replit.app/api/obituaries/1
curl -i -X POST https://dgkma.replit.app/api/obituary/parse \
  -H "Content-Type: application/json" \
  -d '{"text":"테스트"}'
```

모두 `401`이어야 한다. 실제 회원 계정으로 목록·상세·파싱·등록 기존 흐름을 확인한다. 가입 불일치 정책은 운영진이 준비한 불일치 테스트 계정이 있을 때 `202`, 계정·세션 미생성, 관리자 승인 목록 표시를 확인한다.

## 제외 범위

- 공개 경조사 안내 페이지 접근 변경
- 부고 데이터 필드 또는 DB 스키마 변경
- 승인 대기 가입의 중복 신청·승인 트랜잭션 개선
- 카테고리 관리 화면 추가
- 기존 게시글의 분류 변경
- 프로덕션 category seed 실행
- PostgreSQL 기준 명부 일원화

## 완료 조건

- 부고 API 네 경로가 비로그인 요청에 `401`을 반환하고 회원 기능은 유지된다.
- 새 게시글은 활성화된 `공지`, `자유`, `행사`, `소식`만 분류로 사용할 수 있다.
- `전체`는 목록 필터로만 동작한다.
- 가입 불일치 정책이 승인 대기로 코드·화면·약관·기획서에 일치한다.
- category seed SQL이 승인된 다섯 행을 idempotent하게 정의한다.
- Replit 테스트·타입검사·빌드가 통과한다.
- Republish 후 프로덕션 검증 결과에 따라 로드맵 상태가 갱신된다.
