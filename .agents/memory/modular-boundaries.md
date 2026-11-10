---
name: Modular refactor compatibility
description: Why storage composition and validator compatibility deliberately preserve unusual behavior
---

저장 facade를 독립 인스턴스별 bind나 forwarding wrapper로 바꾸기 전,
같은 receiver에서 메서드를 대체한 경우 다른 메서드의 내부 호출에도 반영되는 계약을 검증한다.

**Why:** 기존 호출부와 회귀 테스트가 단일 저장 객체의 동적 메서드 교체에 의존한다.
도메인별 receiver로 분리하면 트랜잭션 자체를 그대로 옮겨도 dispatch가 달라질 수 있다.

**How to apply:** 저장 계층의 합성 방식을 변경할 때 receiver/override 회귀를 유지한다.

브라우저 검증을 Drizzle 생성 검증에서 분리할 때는 추정한 타입이 아니라 실제 parse 출력까지 대조한다.

**Why:** drizzle-zod의 text 배열은 숫자·null 등을 문자열로 coercion한다. 구조 이동만 하는 작업에서는 기존 입력 허용 범위를 바꾸지 않는다. 2026-11-10 게시글 입력 정리에서는 별도로 승인된 공통 제한에 따라 앱 작성·수정 계약을 엄격하게 변경했다. 저장 계층 검증과 앱 입력 검증의 차이는 의도적이다.

**How to apply:** 새 입력은 제품 계획의 공통 제목·첨부 계약을 사용한다. 기존 글의 제목 유지·첨부 유지/감소와 경로·권한 검사는 구분한다. parity 검사는 변경하지 않은 필드·DTO를 비교하고 승인된 검증 차이를 오류로 취급하지 않는다.
