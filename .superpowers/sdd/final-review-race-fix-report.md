# 최종 리뷰 경쟁 조건 수정 보고서

## 결과

- 상태: DONE
- 프로젝트: `/Users/raphael/Playground/dgkmaWeb`
- 브랜치: `main`
- 기준 HEAD: `9c12fa863ef2c4c6fe05fea426c78be18a79619b`
- 결과 커밋: `714bba5b9d1877a793132bc594afdd9fe2659835`
- Production Database: 접근하거나 변경하지 않음
- 보호 파일: `KIKcd_B.20250701.txt`, `KIKcd_B.20250701.xlsx`를 수정·추적·삭제하지 않음

## 판단 기준

- 승인된 설계와 구현 계획을 source of truth로 사용했다.
- 경쟁 조건은 추측 수정 대신 실제 Development Database에서 승인 트랜잭션이 identity lock을 선점하도록 재현했다.
- 같은 Kakao ID만 승인 사용자 자동 로그인 대상으로 인정하고, 같은 이메일·다른 Kakao ID는 기존 `email_conflict` 관리자 확인 경로를 유지했다.
- 알림 기능이 없으므로 DB 호환 컬럼은 유지하되 클라이언트 출력·입력 계약에서는 제거했다.
- 어드민 키 설정 오류와 실제 Kakao 운영 실패를 각각 HTTP 500과 502로 구분하고, 둘 다 로컬 삭제를 차단했다.

## 실행 결과

1. `createOrRefreshPendingRegistration` 반환형을 `pending`/`registered` discriminated union으로 변경했다.
2. identity advisory lock 획득 직후 같은 `kakaoId`의 `users` 행을 재조회한다.
3. 승인 사용자를 발견한 OAuth 요청은 `req.session.userId`를 설정하고 session save 후 성공 응답을 반환한다.
4. `ClientUser`, `toClientUser`, `updateProfileSchema`에서 `kakaoSyncEnabled`를 제거하고 DB 컬럼은 유지했다.
5. `KakaoAdminConfigurationError`는 500, 실제 unlink 오류는 502를 반환하며 로컬 삭제는 호출하지 않는다.
6. 승인과 OAuth refresh를 경쟁시키는 실제 PostgreSQL 회귀 테스트를 추가했다.
7. 승인 설계와 구현 계획에 최종 리뷰 계약 및 검증 절차를 반영했다.

## TDD 증거

Replit 격리 workspace와 Development Database에서 구현 전 RED를 확인했다.

- 승인-refresh 경쟁: 기존 반환값에 `kind`가 없어 실패
- 승인 사용자 OAuth 로그인: 기존 응답 202, 기대 200으로 실패
- 어드민 키 누락: 기존 응답 502, 기대 500으로 실패
- 클라이언트 직렬화와 프로필 입력: `kakaoSyncEnabled` 노출로 실패

구현 후 같은 집중 명령에서 31/31 통과했다.

```bash
npx tsx --test server/client-user.test.ts server/account-deletion-routes.test.ts server/kakao-oauth-routes.test.ts server/pending-registration-approval-race.test.ts
```

경쟁 테스트는 `heliumdb`를 확인하고 실행하며 운영 환경에서는 skip한다. 테스트 종료 시 `users`, `alumni_database`, `pending_registrations` 관련 잔여 건수가 모두 0인지 확인했다.

## 전체 검증

Replit 기본 workspace의 기존 dirty 변경을 보존하기 위해 현재 로컬 소스를 Replit `/tmp` 격리 복제본에서 실행하고, 기존 `node_modules` 및 기본 `PG*` Development Database 환경을 사용했다.

- `npm test`: 174/174 통과, 실패 0, skip 0
- `npm run check`: exit 0
- `npm run build`: exit 0
- `git diff --check`: 통과

로컬 `npm run check`는 로컬 의존성의 `korean-lunar-calendar` 타입 모듈 누락으로 중단됐으며, 프로젝트 지침에 따라 Replit의 성공 결과를 최종 근거로 사용했다.

## 남은 리스크

- 빌드 성공 중 기존 Browserslist 데이터 노후 경고와 500 kB 초과 JavaScript chunk 경고가 출력됐다. 이번 변경의 기능·타입·빌드를 차단하지 않으며 범위 밖이라 수정하지 않았다.
- Replit 기본 workspace는 별도 기존 변경이 있는 dirty 상태라 직접 덮어쓰지 않았다. 이번 검증은 동일 Replit 런타임과 Development Database를 사용하는 격리 복제본에서 수행했다.
- 커밋은 로컬 `main`에만 생성했으며 push, Republish, Production smoke check는 요청 범위가 아니어서 수행하지 않았다.

---

# 최종 리뷰 경쟁 조건 수정 2차 보고서

## 결과

- 상태: DONE
- 작업일: 2026-07-13
- 프로젝트: `/Users/raphael/Playground/dgkmaWeb`
- 브랜치: `main`
- 기준 HEAD: `714bba5b9d1877a793132bc594afdd9fe2659835`
- Production Database: 접근하거나 변경하지 않음
- 보호 파일: `KIKcd_B.20250701.txt`, `KIKcd_B.20250701.xlsx`를 수정·추적·삭제하지 않음

## 2차 수정

1. `createOrRefreshPendingRegistration`이 identity advisory lock 획득 직후 같은 Kakao ID뿐 아니라 `lower(email)` 기존 사용자도 재조회한다.
2. 같은 이메일을 다른 Kakao ID가 점유하면 입력 사유와 관계없이 pending의 `conflictReason`을 `email_conflict`로 강제한다.
3. 다른 명부 행으로 회원 생성을 시도하는 경쟁에서도 lock 뒤 이메일을 재판정해 PostgreSQL `users.email` UNIQUE 오류 전에 타입 있는 충돌로 전환하고, OAuth 라우트가 202 관리자 확인으로 처리한다.
4. 기존 회원과 승인 경쟁 복구 회원이 모두 공통 Kakao 동의 정보 동기화를 거치며, 프로필 사진과 생일 동의 철회의 `null`을 반영한 뒤 세션을 저장한다.
5. 승인 경쟁 테스트 cleanup을 `pool.connect()` 전용 client의 단일 트랜잭션으로 수행하고 release한 뒤 새 pool query로 잔여 0건을 확인한다. 새 이메일 경쟁 테스트도 같은 cleanup을 사용한다.

## RED

Replit `/tmp/dgkma-final-review-2.EzRqEz` 격리 복제본과 Development Database `heliumdb`에서 구현 전 실패를 확인했다.

- 승인 경쟁 복구 사용자 동기화: 기대 `profileImage: null`, 실제 기존 프로필 URL로 실패
- 이메일 경쟁 라우트: 기대 HTTP 202, 실제 HTTP 500으로 실패
- 실제 DB 이메일 경쟁: 기대 `PendingRegistrationConflictError`, 실제 PostgreSQL UNIQUE 오류 객체 이름 `error`로 실패

## GREEN

구현 후 관련 집중 테스트를 다시 실행했다.

```bash
npx tsx --test server/member-deduplication.test.ts server/kakao-oauth-routes.test.ts server/pending-registration-approval-race.test.ts
```

- 33/33 통과, 실패 0, skip 0
- 실제 DB 경쟁 최종 상태: 승인 사용자 1명, 경쟁 사용자 0명, `email_conflict` pending 1건, 경쟁 명부 미연결
- 각 DB 테스트 cleanup 후 `users`, `alumni_database`, `pending_registrations` 관련 잔여 0건 확인

## 전체 검증

Replit 기본 workspace의 기존 dirty 변경을 보존하기 위해 같은 `/tmp` 격리 복제본에서 검증했다.

- `npm test`: 176/176 통과, 실패 0, skip 0
- `npm run check`: exit 0
- `npm run build`: exit 0
- `git diff --check`: 통과

## 남은 리스크

- 빌드의 기존 Browserslist 데이터 노후 경고와 500 kB 초과 JavaScript chunk 경고는 범위 밖이라 변경하지 않았다.
- push, Republish, Production smoke check는 요청 범위가 아니어서 수행하지 않았다.
