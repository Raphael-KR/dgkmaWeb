# Task 4 보고서: 트랜잭션 기반 회원 데이터 제거

## 구현 결과

- `IStorage`와 `DatabaseStorage`에 `deleteUserAccount(user: Pick<User, "id" | "kakaoId" | "email">): Promise<void>`를 추가했다.
- 한 `db.transaction` 안에서 사용자 초안 `community_events`를 먼저 삭제하고, 남은 공개 이벤트와 게시글·댓글·기존 부고의 작성자 연결 및 결제 사용자 연결을 `NULL`로 변경한다.
- 동문 명부는 `is_matched = false`, `matched_user_id = NULL`로 되돌리고, 카카오 ID 또는 이메일이 일치하는 가입대기 기록을 삭제한다.
- `session.sess ->> 'userId'`가 `String(user.id)` 파라미터와 일치하는 모든 세션을 삭제한 뒤 마지막으로 `users` 행을 삭제한다.
- 모든 값 조건은 Drizzle 표현식 또는 `sql` 템플릿 파라미터를 사용한다. 중간 문장이 실패하면 관계 처리와 사용자 삭제 전체가 같은 트랜잭션에서 롤백된다.

## TDD와 통합 테스트

- RED: 구현 전에 `npx tsx --test server/account-deletion-storage.test.ts`를 실행해 `deleteUserAccount` 계약 부재로 1개 실패를 확인했다. 로컬 Mac에는 DB 환경변수가 없어 통합 항목은 안전하게 skip됐다.
- GREEN: 로컬 집중 테스트 `npx tsx --test server/account-deletion-storage.test.ts server/community-events-storage-contract.test.ts` 결과 7개 통과, 통합 1개 skip이었다.
- Replit 집중 테스트: 격리 복사본에서 같은 명령을 실행해 8개 모두 통과했다. 실제 Development Database `current_database() = 'heliumdb'`를 확인한 뒤 고유 가상 회원과 관계 데이터를 생성했다.
- 통합 검증에서 초안 삭제, 공개 콘텐츠 익명화, 결제 연결 제거, 명부 연결 해제, 카카오 ID·이메일 각각의 가입대기 삭제, 대상 세션 2개 삭제, 다른 사용자 세션 보존, 사용자 삭제를 확인했다.
- 통합 테스트 `finally`에서 관련 데이터를 트랜잭션으로 정리하고 `users`, `posts`, `comments`, `payments`, `alumni_database`, `obituaries`, `community_events`, `pending_registrations`, `session` 잔여가 모두 0인지 검증했다.
- `REPLIT_DEPLOYMENT=1 npx tsx --test server/account-deletion-storage.test.ts`에서 DB 통합 항목 1개가 쓰기 전에 운영 차단 skip되는 것을 확인했다.

## Replit 전체 검증

- 공유 Replit 워크스페이스의 기존 dirty 변경을 보존하기 위해 `/tmp/dgkma-task4-codex` 격리 복사본에서 검증했다.
- 첫 `npm test`는 공유 `node_modules`에 잠금 버전 `korean-lunar-calendar@0.4.0`이 없어 기존 `birthday.test.ts` 로딩 1건이 실패했다. 격리 복사본 내부에 해당 버전만 보충하고 공유 워크스페이스는 변경하지 않았다.
- `npm test`: 148개 통과, 0개 실패.
- `npm run check`: exit 0.
- `npm run build`: exit 0. 기존 Browserslist 데이터 갱신 안내와 500 kB 초과 chunk 안내만 출력됐다.
- 스키마 변경이 없어 `npm run db:push`는 실행하지 않았다.

## Self-review

- 브리프의 관계 처리 순서와 실제 메서드 호출 순서를 대조했다.
- 초안에만 삭제 조건이 적용되고, 초안 삭제 뒤 남은 이벤트가 익명화되는지 확인했다.
- 세션 JSON의 숫자 `userId`를 `->>`로 문자열화한 뒤 `String(user.id)` 바인딩 파라미터와 비교하며 문자열 결합이 없는지 확인했다.
- 통합 테스트의 비대상 사용자와 세션이 삭제 과정에서 유지되는지 확인했다.
- `git diff --check`를 통과했고 Task 1 report와 `KIKcd_*` 파일은 수정하거나 stage하지 않았다.

## 남은 우려

- 이 Task는 저장소 메서드까지만 제공한다. 실제 탈퇴 API에서 카카오 연결 해제 결과와 이 메서드를 연결하는 작업은 후속 Task 범위다.
