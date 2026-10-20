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

**Why:** 현재 drizzle-zod의 text 배열은 숫자·null 등을 문자열로 coercion한다.
단순 z.string 배열로 재작성하면 구조 이동 작업이 기존 입력 허용 범위를 바꾸게 된다.

**How to apply:** stricter 검증은 별도 정책 변경으로 다루며 계약 parity 테스트를 먼저 갱신한다.
