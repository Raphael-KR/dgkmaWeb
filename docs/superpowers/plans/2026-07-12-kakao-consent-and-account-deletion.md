# Kakao Consent And Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카카오에서 실제 사용하는 개인정보만 요청하고, 심사 기준과 일치하는 화면·정책 및 카카오 연결 해제를 포함한 안전한 회원 탈퇴를 제공한다.

**Architecture:** OAuth 범위와 어드민 키 선택을 환경 설정 모듈에서 관리하고, 카카오 연결 해제는 독립된 서버 모듈로 캡슐화한다. 로컬 회원 삭제는 Drizzle 트랜잭션 하나에서 관계를 익명화·삭제한 뒤 사용자 행을 제거하며, 라우트는 카카오 연결 해제 성공 후에만 트랜잭션을 호출한다. 프런트엔드는 로그인 안내, 실제 프로필 사진 표시, 설정에서 시작하는 별도 탈퇴 확인 대화상자를 제공한다.

**Tech Stack:** TypeScript, Express, express-session, Drizzle ORM, PostgreSQL, React, Wouter, TanStack Query, Radix AlertDialog, Node test runner, Replit

## Global Constraints

- 카카오 수집항목은 이름·이메일·전화번호 필수와 프로필 사진 선택으로 제한한다.
- 생일·CI·성별·연령대·출생 연도·친구 목록·접근권한을 요청하지 않는다.
- `REPLIT_DEPLOYMENT="1"`이면 운영 설정, 그 외에는 개발 설정을 사용한다.
- 어드민 키·토큰·카카오 전체 응답·개인정보를 브라우저나 로그에 노출하지 않는다.
- 본인 탈퇴 대상은 항상 `req.session.userId`로 결정한다.
- 카카오 연결 해제가 일시 실패하면 로컬 계정을 삭제하지 않는다.
- 회원 삭제는 하나의 DB 트랜잭션에서 수행한다.
- 사용자 소유의 `KIKcd_B.20250701.txt`, `KIKcd_B.20250701.xlsx`는 수정하거나 커밋하지 않는다.
- 검증은 로컬 Mac보다 Replit 개발 workspace를 우선한다.
- 최종 카카오 심사 신청 제출은 사용자 확인 후 수행한다.

---

### Task 1: 개인정보 범위와 공개 안내 정합성

**Files:**
- Modify: `server/kakao-oauth-config.ts`
- Modify: `server/kakao-oauth-config.test.ts`
- Modify: `server/routes.ts`
- Modify: `server/kakao-oauth-routes.test.ts`
- Modify: `shared/schema.ts`
- Modify: `client/src/pages/login.tsx`
- Modify: `client/src/pages/profile.tsx`
- Modify: `client/src/components/profile/profile-edit-dialog.tsx`
- Modify: `client/src/pages/privacy.tsx`
- Modify: `client/src/pages/terms.tsx`
- Create: `server/kakao-consent-ui-contract.test.ts`

**Interfaces:**
- Produces: OAuth scope `name,profile_image,account_email,phone_number`
- Produces: 로그인 응답에서 토큰과 생일 필드를 제외한 회원가입 데이터
- Produces: 공개 화면의 필수·선택 수집항목 및 실제 탈퇴 정책 문구

- [ ] **Step 1: OAuth 범위와 공개 화면 계약의 실패 테스트 작성**

`server/kakao-oauth-config.test.ts`에서 authorize URL의 `scope`를 배열로 분해해 네 항목만 존재하고 `birthday`가 없음을 검증한다. `server/kakao-consent-ui-contract.test.ts`는 로그인·개인정보·약관·프로필 소스를 읽어 다음 문자열과 금지 문자열을 검증한다.

```ts
assert.deepEqual(scope.split(",").sort(), [
  "account_email",
  "name",
  "phone_number",
  "profile_image",
]);
assert.doesNotMatch(scope, /birthday/);

assert.match(login, /필수/);
assert.match(login, /이름/);
assert.match(login, /이메일/);
assert.match(login, /전화번호/);
assert.match(login, /선택/);
assert.match(login, /프로필 사진/);
assert.doesNotMatch(login, /카카오싱크/);
assert.doesNotMatch(privacy, /CI\(연계정보\)|생일 축하 쿠폰/);
assert.doesNotMatch(terms, /근무지 정보/);
assert.match(profile, /profileImage/);
```

- [ ] **Step 2: 집중 테스트가 실패하는지 확인**

Run on Replit:

```bash
npx tsx --test server/kakao-oauth-config.test.ts server/kakao-consent-ui-contract.test.ts
```

Expected: 기존 scope의 `birthday`, 누락된 UI 문구, 남아 있는 CI·카카오싱크·근무지 문구 때문에 FAIL.

- [ ] **Step 3: 최소 구현 적용**

`KAKAO_SCOPE`에서 `birthday`를 제거한다. `/api/auth/kakao/authorize` 응답과 `/api/auth/kakao` 입력·저장 갱신에서 액세스 토큰 및 생일 필드를 제거한다. `updateProfileSchema`에서는 생일 관련 필드를 제거하고 활동 지역과 카카오 알림 설정만 허용한다. 프로필 편집 폼은 활동 지역만 수정하도록 축소한다.

로그인 화면에는 다음 정보를 한 번에 읽을 수 있는 비중으로 표시한다.

```tsx
<div aria-label="카카오 로그인 개인정보 안내">
  <p><strong>필수</strong> 이름, 이메일, 전화번호</p>
  <p><strong>선택</strong> 프로필 사진</p>
  <p>이름과 전화번호는 동문 자격 확인, 이메일은 계정 관리와 공식 안내, 프로필 사진은 내 정보 표시에 사용합니다.</p>
</div>
```

프로필은 `AvatarImage`와 `AvatarFallback`을 사용해 선택 사진과 이름 첫 글자 대체 표시를 함께 제공한다. 개인정보 처리방침과 약관은 승인된 설계의 수집 범위·목적·보유 정책으로 갱신하고 시행일을 `2026년 7월 12일`로 맞춘다.

- [ ] **Step 4: 집중 테스트 통과 확인**

```bash
npx tsx --test server/kakao-oauth-config.test.ts server/kakao-oauth-routes.test.ts server/kakao-consent-ui-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add server/kakao-oauth-config.ts server/kakao-oauth-config.test.ts server/routes.ts server/kakao-oauth-routes.test.ts server/kakao-consent-ui-contract.test.ts shared/schema.ts client/src/pages/login.tsx client/src/pages/profile.tsx client/src/components/profile/profile-edit-dialog.tsx client/src/pages/privacy.tsx client/src/pages/terms.tsx
git commit -m "Align Kakao consent data with actual use"
```

### Task 2: 환경별 카카오 연결 해제 모듈

**Files:**
- Create: `server/kakao-admin-config.ts`
- Create: `server/kakao-admin-config.test.ts`
- Create: `server/kakao-unlink.ts`
- Create: `server/kakao-unlink.test.ts`
- Modify: `AGENTS.md`
- Modify: `replit.md`

**Interfaces:**
- Produces: `resolveKakaoAdminConfig(env?: NodeJS.ProcessEnv): KakaoAdminConfig`
- Produces: `unlinkKakaoUser(args: { adminKey: string; kakaoId: string; kakaoFetch?: typeof fetch }): Promise<void>`
- Produces: `KakaoUnlinkError` with a safe `kind` field and no secret or PII in the message

- [ ] **Step 1: 환경 선택과 API 요청 실패 테스트 작성**

개발 환경은 `KAKAO_DEV_ADMIN_KEY`, `REPLIT_DEPLOYMENT="1"`은 `KAKAO_PROD_ADMIN_KEY`를 선택하는 테스트를 작성한다. 누락 오류에는 변수명만 포함하고 값은 포함하지 않는다.

연결 해제 테스트는 주입한 fetch로 다음 요청을 검증한다.

```ts
assert.equal(url, "https://kapi.kakao.com/v1/user/unlink");
assert.equal(init.method, "POST");
assert.equal(init.headers.Authorization, "KakaoAK admin-secret");
assert.equal(body.get("target_id_type"), "user_id");
assert.equal(body.get("target_id"), "123456789");
```

네트워크 실패와 카카오 오류 응답은 `KakaoUnlinkError`로 변환한다. HTTP 400 응답의 카카오 오류 코드가 `-101`이면 이미 앱과 연결되지 않은 사용자이므로 `already_unlinked`로 분류하고 성공과 동일하게 로컬 탈퇴를 계속한다. 그 외 오류는 로컬 삭제를 중단한다.

- [ ] **Step 2: 집중 테스트 실패 확인**

```bash
npx tsx --test server/kakao-admin-config.test.ts server/kakao-unlink.test.ts
```

Expected: 모듈이 없어서 FAIL.

- [ ] **Step 3: 설정 및 연결 해제 모듈 구현**

`server/kakao-admin-config.ts`는 OAuth 설정과 동일한 배포 판정 규칙을 사용한다. `server/kakao-unlink.ts`는 form-urlencoded 요청을 수행하고 성공 ID가 요청 ID와 일치하는지 확인한다. 서버 오류 로그에 원본 카카오 응답을 전달하지 않도록 오류에는 HTTP 상태와 안전한 종류만 보관한다.

`AGENTS.md`와 `replit.md`에 두 어드민 키, 서버 전용 원칙, 탈퇴에서만 사용한다는 규칙을 기록한다.

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx tsx --test server/kakao-admin-config.test.ts server/kakao-unlink.test.ts
```

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add server/kakao-admin-config.ts server/kakao-admin-config.test.ts server/kakao-unlink.ts server/kakao-unlink.test.ts AGENTS.md replit.md
git commit -m "Add environment-safe Kakao unlink support"
```

### Task 3: 트랜잭션 기반 회원 데이터 제거

**Files:**
- Modify: `server/storage.ts`
- Create: `server/account-deletion-storage.test.ts`

**Interfaces:**
- Produces: `IStorage.deleteUserAccount(user: Pick<User, "id" | "kakaoId" | "email">): Promise<void>`
- Consumes: Drizzle `db.transaction`

- [ ] **Step 1: 저장소 계약 실패 테스트 작성**

소스 계약 테스트로 `deleteUserAccount`가 트랜잭션 안에서 승인된 테이블을 모두 처리하는지 검증한다.

```ts
assert.match(source, /async deleteUserAccount/);
assert.match(source, /db\.transaction/);
for (const table of [
  "alumniDatabase",
  "communityEvents",
  "posts",
  "comments",
  "payments",
  "pendingRegistrations",
  "obituaries",
  "users",
]) assert.match(source, new RegExp(table));
assert.match(source, /isMatched:\s*false/);
assert.match(source, /matchedUserId:\s*null/);
```

세션 제거 SQL은 JSON 세션의 `userId`가 현재 사용자와 일치하는 행만 대상으로 하고, 숫자 비교를 문자열 파라미터로 안전하게 수행하는지 검증한다.

- [ ] **Step 2: 실패 확인**

```bash
npx tsx --test server/account-deletion-storage.test.ts
```

Expected: `deleteUserAccount` 부재로 FAIL.

- [ ] **Step 3: 트랜잭션 구현**

`IStorage`와 `DatabaseStorage`에 메서드를 추가한다. `community_events.status = 'draft'`인 사용자 초안은 삭제하고 나머지 이벤트 작성자 연결은 제거한다. 게시글·댓글·기존 부고·결제 작성자 또는 사용자 연결을 `NULL`로 변경한다. 가입대기 기록은 카카오 ID 또는 이메일이 일치하면 삭제한다. 세션, 관계, 사용자 행을 같은 트랜잭션으로 처리한다.

SQL 식별자와 값은 Drizzle 표현식 또는 `sql` 템플릿 파라미터만 사용하고 문자열 결합을 사용하지 않는다.

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx tsx --test server/account-deletion-storage.test.ts server/community-events-storage-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add server/storage.ts server/account-deletion-storage.test.ts
git commit -m "Delete member data transactionally"
```

### Task 4: 본인 탈퇴 API와 확인 화면

**Files:**
- Modify: `server/routes.ts`
- Create: `server/account-deletion-routes.test.ts`
- Modify: `client/src/components/profile/settings-dialog.tsx`
- Create: `client/src/components/profile/delete-account-dialog.tsx`
- Modify: `client/src/pages/profile.tsx`
- Modify: `client/src/hooks/use-auth.tsx`

**Interfaces:**
- Consumes: `resolveKakaoAdminConfig`, `unlinkKakaoUser`, `storage.deleteUserAccount`
- Produces: `DELETE /api/users/me` with `{ confirmation: "탈퇴" }`
- Produces: `DeleteAccountDialog` props `{ open: boolean; onOpenChange(open: boolean): void }`

- [ ] **Step 1: 라우트 및 UI 계약 실패 테스트 작성**

라우트 테스트용 의존성에 `unlinkKakaoUser`, `deleteUserAccount`, `getKakaoAdminConfig`를 주입할 수 있게 설계한다. 다음 경우를 검증한다.

```ts
// 401: no session
// 400: confirmation !== "탈퇴"
// 502: unlink fails and deleteUserAccount call count is 0
// 200: unlink gets session user's kakaoId, deletion gets same user
// 200: clearCookie("connect.sid") and session.destroy called
```

UI 계약 테스트는 설정에서 `회원 탈퇴` 진입점, 별도 파일의 `AlertDialog`, `탈퇴` 입력, 파괴적 버튼이 존재하는지 검증한다.

- [ ] **Step 2: 실패 확인**

```bash
npx tsx --test server/account-deletion-routes.test.ts server/kakao-consent-ui-contract.test.ts
```

Expected: 라우트와 대화상자가 없어 FAIL.

- [ ] **Step 3: 서버 API 구현**

`RouteDependencies`에 테스트 주입점을 추가하고 라우트는 다음 순서만 수행한다.

```ts
const userId = req.session.userId;
validateConfirmation(req.body);
const user = await storage.getUser(userId);
const { adminKey } = getKakaoAdminConfig();
await unlinkKakaoUser({ adminKey, kakaoId: user.kakaoId! });
await deleteUserAccount(user);
req.session.destroy(...);
```

카카오 ID가 없는 계정은 외부 연결 해제 없이 로컬 삭제할 수 있게 명시적으로 분기한다. 응답에는 사용자 정보나 카카오 응답을 포함하지 않는다.

- [ ] **Step 4: 프런트엔드 구현**

설정 대화상자의 `회원 탈퇴` 버튼은 설정을 닫고 `DeleteAccountDialog`를 연다. 사용자가 `탈퇴`를 입력해야 최종 버튼이 활성화된다. 성공 시 React Query 인증 캐시와 `useAuth` 사용자 상태를 비우고 `/`로 이동한다. 실패 시 서버의 안전한 사용자 메시지를 toast로 보여주고 대화상자를 유지한다.

- [ ] **Step 5: 집중 테스트 통과 확인**

```bash
npx tsx --test server/account-deletion-routes.test.ts server/kakao-consent-ui-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add server/routes.ts server/account-deletion-routes.test.ts client/src/components/profile/settings-dialog.tsx client/src/components/profile/delete-account-dialog.tsx client/src/pages/profile.tsx client/src/hooks/use-auth.tsx server/kakao-consent-ui-contract.test.ts
git commit -m "Add Kakao-aware member withdrawal"
```

### Task 5: 전체 검증, 운영 문서, 심사용 자료

**Files:**
- Modify: `walkthrough.md`
- Modify: `CHANGELOG.md`
- Modify: `roadmap.md`
- Create: `docs/kakao-consent-review-guide.md`
- Create: `docs/review-assets/kakao-consent-review.pdf`

**Interfaces:**
- Consumes: 완성된 개발 서버 화면과 회원 탈퇴 흐름
- Produces: 개인정보가 없는 카카오 심사용 PDF 한 개

- [ ] **Step 1: 전체 자동화 검증**

Replit SSH workspace에서 실행한다.

```bash
npm test
npm run check
npm run build
```

Expected: 모든 명령 exit code 0.

- [ ] **Step 2: 개발 서버 비로그인 화면 검증**

개발 URL에서 `/login`, `/privacy`, `/terms`를 데스크톱과 모바일 viewport로 확인한다. 필수·선택 문구, 긴 항목의 줄바꿈, 버튼 겹침, 개인정보 노출이 없는지 Playwright 스크린샷으로 확인한다.

- [ ] **Step 3: 개발 카카오 로그인 및 탈퇴 통합 검증**

사용자 로그인 협조가 필요한 시점에 한 번만 요청한다. 개발 DB에서 사전 사용자·세션·동문 연결 집계를 기록하고, 로그인·온보딩·프로필 표시·탈퇴를 수행한다. 탈퇴 후 새 연결에서 `/api/auth/me`가 401인지, 사용자·세션이 0인지, 명부 연결이 해제됐는지, 공개 콘텐츠가 익명 상태로 유지되는지 검증한다.

- [ ] **Step 4: 운영 문서 갱신**

`walkthrough.md`에 로그인 수집항목과 탈퇴 검증 절차를 추가한다. `CHANGELOG.md`에 개인정보 최소화와 회원 탈퇴를 기록한다. `roadmap.md`의 관련 항목은 개발 서버와 자동화 검증 근거로 상태를 갱신하되 운영 완료로 과장하지 않는다.

`docs/kakao-consent-review-guide.md`에는 콘솔에서 설정할 값을 정확히 기록한다.

```text
이름: 필수 — 졸업생 명부와의 일치 여부 확인 및 동문 자격 인증
카카오계정(전화번호): 필수 — 졸업생 명부와의 일치 여부 확인 및 동문 자격 인증
카카오계정(이메일): 필수 — 회원 식별, 계정 관리 및 동문회 공식 안내
프로필 사진: 선택 — 회원 프로필 화면에 프로필 사진 표시
생일: 사용 안 함
```

- [ ] **Step 5: 심사용 PDF 제작 및 시각 검증**

실제 서비스명과 가상·마스킹 데이터만 보이는 화면을 캡처해 한 개의 PDF로 구성한다. `pdf:pdf` 스킬의 렌더링 절차로 모든 페이지를 PNG로 다시 렌더링하여 잘림, 겹침, 빈 페이지, 개인정보 노출을 확인한다. 파일은 20MB 이하로 유지한다.

- [ ] **Step 6: 최종 자동화 재검증 및 커밋**

```bash
npm test
npm run check
npm run build
git add walkthrough.md CHANGELOG.md roadmap.md docs/kakao-consent-review-guide.md docs/review-assets/kakao-consent-review.pdf
git commit -m "Document and verify Kakao consent review flow"
```

Expected: 테스트·타입 검사·빌드가 모두 통과하고 문서와 PDF만 마지막 커밋에 포함됨.

- [ ] **Step 7: 사용자 외부 설정 체크포인트**

한 번의 요청으로 다음 작업을 안내한다.

1. Replit Secrets에 `KAKAO_DEV_ADMIN_KEY`, `KAKAO_PROD_ADMIN_KEY` 추가
2. 카카오 운영 앱의 생일 동의항목을 `사용 안 함`으로 유지
3. 개발 로그인 및 실제 탈퇴 테스트에 사용할 계정으로 로그인
4. 운영 Republish 후 운영 로그인·탈퇴 전 별도 최종 확인
5. 개인정보 국외이전 등록에 필요한 실제 업체·국가·연락처 확인

카카오 개인정보 동의항목 심사 제출 버튼은 이 체크포인트와 운영 화면 일치 확인 후에만 누른다.
