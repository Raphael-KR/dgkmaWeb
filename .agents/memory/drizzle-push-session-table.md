---
name: Drizzle push and the runtime session table
description: Current session exclusion and DB target rules, with the superseded rename/drop observation kept as history.
---

# Drizzle와 session 관리 경계

## 현재 기준 (2026-11-09, main d7184ca)

이 파일은 프로젝트 참고 메모다. DB 구조·실행 판단의 기준은 [스키마 기준서](../../docs/database-schema.md)와 [DB 운영 런북](../../docs/database-operations.md)이다.

- `session`은 `connect-pg-simple`과 앱 시작 DDL이 관리한다. Drizzle 스키마의 현재 위치는 `server/db/schema/index.ts`이며, `drizzle.config.ts`의 `tablesFilter: ["!session"]`로 session을 관리 대상에서 제외한다.
- 따라서 session 때문에 `db:push`가 **항상** rename/drop을 제안한다는 과거 설명은 현행 설정에 적용되지 않는다. 다른 실제 diff나 잘못된 대상 때문에 확인이 필요할 수는 있다.
- `npm run db:push`는 정적 검사가 아니다. 승인된 개발 스키마 작업에서 실제 대상과 diff를 확인한 경우에만 사용한다. 대화형 rename/drop 질문에 자동 응답하지 않는다.
- Drizzle CLI는 `DATABASE_URL`을 직접 사용하지만 앱 `server/db.ts`는 Replit `PG*`를 우선한다. 두 경로가 항상 같은 DB라고 가정하지 말고 런북에 따라 확인한다.
- 운영 변경은 승인된 SQL·변환 도구와 백업/preview/사후 확인 절차를 사용한다. 이 메모는 운영 변경이나 이미 완료한 DDL의 재실행 승인이 아니다.

## 과거 관찰과 대체된 안내

session 제외 설정이 없던 과거 환경에서는 Drizzle이 session을 추가 테이블로 보고 신규 테이블의 rename 후보 또는 drop 대상으로 제시했다. 당시 raw TTY 프롬프트에 piped stdin이 적용되지 않는 문제가 함께 기록됐다.

옛 메모의 `shared/schema.ts`, `executeSql`로 직접 DDL 적용, “이후 push를 절대 재실행하지 말 것”, “해당 DB는 비어 있음”은 당시 환경의 설명이다. 현재 경로·DB 상태·실행 절차로 사용하지 않는다. 현행 설정은 위 항목과 런북을 따른다.
