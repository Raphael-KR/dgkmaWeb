import { z } from "zod";

type MembershipEvent = {
  // Effective Korean calendar date. Supply events on the same day in occurrence order.
  on: string;
  type: "approved" | "withdrawn" | "deceased";
};

export type AssociationMembershipHistory = {
  // Normalized roster value retaining its precision: YYYY, YYYY-MM or YYYY-MM-DD.
  graduationOn: string | null;
  confirmedRightsOn20261121: boolean | null;
  events: readonly MembershipEvent[];
};

type MembershipPeriod = {
  status: "active" | "inactive" | "unknown";
  currentPeriodStart: string | null;
  firstAdmissionOn: string | null;
  reason: string;
};

export const CONFIRMATION_DATE = "2026-11-21";
const LAST_GRADUATION_BASED_APPROVAL = "2026-12-31";
const calendarDay = z.string().date();

function isCalendarDay(day: string): boolean {
  return calendarDay.safeParse(day).success;
}

function isRosterDate(value: string): boolean {
  if (/^\d{4}$/.test(value)) return true;
  if (/^\d{4}-\d{2}$/.test(value)) return isCalendarDay(value + "-01");
  return isCalendarDay(value);
}

export function associationMembershipOn(
  history: AssociationMembershipHistory,
  on: string,
  confirmedMonthEnd?: string,
): MembershipPeriod {
  const period: MembershipPeriod = {
    status: "inactive",
    currentPeriodStart: null,
    firstAdmissionOn: null,
    reason: "not_admitted",
  };
  const { graduationOn, confirmedRightsOn20261121 } = history;
  if (!isCalendarDay(on) || history.events.some((event) => !isCalendarDay(event.on))) {
    return { ...period, status: "unknown", reason: "invalid_event_or_assessment_date" };
  }
  const graduation = graduationOn && isRosterDate(graduationOn) ? graduationOn : null;
  // A snapshot establishes membership on this date without inventing an approval event.
  type TimelineEvent = MembershipEvent | { on: string; type: "snapshot" | "month-end" };
  const events: TimelineEvent[] = [...history.events];
  if (confirmedRightsOn20261121) events.unshift({ on: CONFIRMATION_DATE, type: "snapshot" });
  if (confirmedMonthEnd) events.push({ on: confirmedMonthEnd, type: "month-end" });
  if (confirmedRightsOn20261121 !== false) {
    period.status = "unknown";
    period.reason = "membership_unconfirmed";
    if (graduation && on.slice(0, graduation.length) < graduation) {
      period.status = "inactive";
      period.reason = "before_graduation";
    }
  }
  // Stable sort retains the source order on a single day. The snapshot cannot reopen a
  // known withdrawal; readmission requires its own approval.
  events.sort((left, right) => left.on.localeCompare(right.on));
  let hasAdmission = false;
  for (const event of events) {
    if (event.on > on) break;
    if (event.type === "deceased") {
      return { ...period, status: "inactive", currentPeriodStart: null, reason: "deceased" };
    }
    if (event.type === "withdrawn") {
      hasAdmission = true;
      period.status = "inactive";
      period.currentPeriodStart = null;
      period.reason = "withdrawn";
      continue;
    }
    if (event.type === "snapshot" || event.type === "month-end") {
      if (event.type === "snapshot" && graduation && graduation <= CONFIRMATION_DATE) {
        period.firstAdmissionOn = graduation;
        if (!hasAdmission && isCalendarDay(graduation)) period.currentPeriodStart = graduation;
      }
      if (hasAdmission) continue;
      period.reason = "confirmed_member";
    } else {
      if (period.status === "active") {
        if (!period.firstAdmissionOn && event.on <= LAST_GRADUATION_BASED_APPROVAL) {
          period.firstAdmissionOn = graduation && graduation <= event.on ? graduation : null;
        }
        continue;
      }
      if (!hasAdmission) {
        if (event.on <= LAST_GRADUATION_BASED_APPROVAL || confirmedRightsOn20261121) {
          period.firstAdmissionOn = graduation && graduation <= event.on ? graduation : null;
        } else if (confirmedRightsOn20261121 === false) {
          period.firstAdmissionOn = event.on;
        }
      }
      period.currentPeriodStart = event.on;
      period.reason = hasAdmission ? "readmitted" : "approved";
    }
    hasAdmission = true;
    period.status = "active";
  }
  return period;
}
