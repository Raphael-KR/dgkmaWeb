---
name: 권리회원 tier definition
description: How 권리회원 (rights member) vs 일반회원 is judged in the alumni app
---

# 권리회원 판정 기준

권리회원 = **당해년도 "연회비" 완납자**. 판정은 서버에서만(`getMembershipStatus`).

완납 기준: `payments` 중 `year == 현재연도 && type == '연회비' && status == 'completed'`
들의 `amount` 합계가 `ANNUAL_DUES`(50000) **이상**일 때 isPaid=true → 권리회원.

**Why:** task 스펙 문구가 "당해년도 회비 **완납**자"여서, "완료 납부 1건 이상"으로 처음
구현했다가 코드리뷰에서 REJECT 됨. 부분납부/기타납부/미완료는 등급에서 제외해야 함.
`/about/dues` 의 "회비 납부자(권리회원)" 문구만 보고 느슨하게 잡으면 안 됨 — 스펙의 "완납"이 우선.

**How to apply:** 향후 결제/회비 관련 작업에서 등급 표시는 항상 `/api/membership/status`
결과만 사용(프론트에서 payments 목록으로 직접 판정 금지). 납부완료 카드 금액은 paidAmount(합계),
표시용 날짜는 currentYearPayment(완료된 연회비 중 최신 1건). payments.type 값은 '연회비' | '기타'.
