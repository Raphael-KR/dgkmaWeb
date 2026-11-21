import { z } from "zod";
import {
  associationMembershipOn,
  type AssociationMembershipHistory,
} from "./association-membership-period";

type Rate = { monthly: number; annual: number };
type Office = "일반회원" | "이사" | "감사" | "총회의장" | "부회장" | "수석부회장" | "회장";
type DuesRole = Office | "명예회장";

export interface AnnualDuesSchedule {
  year: number;
  rates: Readonly<Partial<Record<Office, Rate>>>;
}

// 회원관리 및 회계 규정 별표 1. 다른 연도는 그해에 확인된 기준을 입력받는다.
const vicePresidentRate = { monthly: 30_000, annual: 400_000 };
const schedule2026: AnnualDuesSchedule = {
  year: 2026,
  rates: {
    일반회원: { monthly: 2_000, annual: 50_000 },
    이사: { monthly: 10_000, annual: 200_000 },
    감사: vicePresidentRate,
    총회의장: vicePresidentRate,
    부회장: vicePresidentRate,
    수석부회장: { monthly: 50_000, annual: 600_000 },
    회장: { monthly: 100_000, annual: 1_200_000 },
  },
};

export interface AnnualEligibilityInput {
  /** All days are ISO calendar dates in Asia/Seoul. Empty arrays are confirmed empty; null is unknown. */
  on: string;
  membership: AssociationMembershipHistory;
  honoraryMemberOnDate: boolean | null;
  schedule?: AnnualDuesSchedule;
  /** Offices held in each dues year, including any carried into it. */
  roles: readonly { year: number; effectiveOn: string; role: DuesRole }[] | null;
  /** Confirmed allocations to this member, after corrections. paidOn is separate from the designated dues year. */
  payments: readonly { year: number; paidOn: string; amount: number }[] | null;
  previousMonthEnd: { on: string; eligible: boolean } | null;
}

const calendarDay = z.string().date();

function applicableRate(input: AnnualEligibilityInput, year: number) {
  const schedule = input.schedule ?? schedule2026;
  if (schedule.year !== year || !input.roles) return null;

  const applicable = new Set<Office>();
  for (const { year: duesYear, effectiveOn, role } of input.roles) {
    if (duesYear !== year) continue;
    if (!calendarDay.safeParse(effectiveOn).success) return null;
    if (effectiveOn <= input.on) applicable.add(role === "명예회장" ? "일반회원" : role);
  }
  if (applicable.size === 0) applicable.add("일반회원");
  const candidates: (Rate & { role: Office })[] = [];
  for (const role of Array.from(applicable)) {
    const rate = schedule.rates[role];
    if (!rate || ![rate.monthly, rate.annual].every((n) => Number.isSafeInteger(n) && n > 0)) {
      return null;
    }
    candidates.push({ role, ...rate });
  }
  // Both thresholds must belong to one applicable role.
  return (
    candidates.find((rate) =>
      candidates.every((other) => rate.monthly >= other.monthly && rate.annual >= other.annual),
    ) ?? null
  );
}

function confirmedTotal(input: AnnualEligibilityInput, year: number) {
  if (!input.payments) return null;
  let total = 0;
  for (const { year: duesYear, paidOn, amount } of input.payments) {
    if (duesYear !== year) continue;
    if (!calendarDay.safeParse(paidOn).success) return null;
    if (paidOn > input.on) continue;
    if (!Number.isSafeInteger(amount) || amount < 0) return null;
    total += amount;
  }
  return Number.isSafeInteger(total) ? total : null;
}

type Decision =
  | { eligible: true; reason: "annual-paid" | "monthly-paid" | "grace-period" }
  | { eligible: false; reason: "inactive" | "honorary-member" | "insufficient-payment" }
  | {
      eligible: null;
      reason:
        | "membership-unknown"
        | "honorary-status-unknown"
        | "roles-unknown"
        | "rates-unknown"
        | "payments-unknown"
        | "previous-status-unknown";
    };

/** Evaluate one member on one Korean calendar day without reading or updating storage. */
export function assessAnnualDues(input: AnnualEligibilityInput) {
  const on = calendarDay.parse(input.on);
  const [year, month, day] = on.split("-").map(Number);
  const rate = applicableRate(input, year);
  const paid = confirmedTotal(input, year);
  const monthlyTarget = rate ? rate.monthly * month : null;
  const previousEnd = new Date(on + "T00:00:00Z");
  previousEnd.setUTCDate(0);
  const previousDay = previousEnd.toISOString().slice(0, 10);
  const previous = input.previousMonthEnd;
  const previousEligible = previous?.on === previousDay ? previous.eligible : null;
  const confirmedMonthEnd = previousEligible === true ? previousDay : undefined;
  const membership = associationMembershipOn(input.membership, on, confirmedMonthEnd);

  const finish = (decision: Decision) => ({
    ...decision,
    on,
    year,
    membership,
    rate,
    monthlyTarget,
    paid,
    previousMonthEnd: previousDay,
    previousEligible,
  });
  if (membership.status === "inactive") return finish({ eligible: false, reason: "inactive" });
  if (input.honoraryMemberOnDate) return finish({ eligible: false, reason: "honorary-member" });
  if (membership.status === "unknown") {
    return finish({ eligible: null, reason: "membership-unknown" });
  }
  if (input.honoraryMemberOnDate === null) {
    return finish({ eligible: null, reason: "honorary-status-unknown" });
  }

  if (paid !== null && rate && paid >= rate.annual) {
    return finish({ eligible: true, reason: "annual-paid" });
  }
  if (paid !== null && monthlyTarget !== null && paid >= monthlyTarget) {
    return finish({ eligible: true, reason: "monthly-paid" });
  }

  // A fresh admission cannot inherit grace from an earlier membership period.
  const start = membership.currentPeriodStart;
  if (day <= 10 && previousEligible !== false && (start === null || start <= previousDay)) {
    const priorStatus =
      start || previousEligible === true
        ? "active"
        : associationMembershipOn(input.membership, previousDay).status;
    if (priorStatus === "active" && previousEligible === true) {
      return finish({ eligible: true, reason: "grace-period" });
    }
    if (priorStatus !== "inactive") {
      return finish({ eligible: null, reason: "previous-status-unknown" });
    }
  }
  if (input.roles === null) return finish({ eligible: null, reason: "roles-unknown" });
  if (!rate) return finish({ eligible: null, reason: "rates-unknown" });
  if (paid === null) return finish({ eligible: null, reason: "payments-unknown" });
  return finish({ eligible: false, reason: "insufficient-payment" });
}
