import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const TODO_13_MANIFEST_SHA256 = "986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8";
type TierCode = "president" | "senior_vice_president" | "vice_president_auditor_chair" | "director" | "member" | "honorary";
export type PolicySeed = Readonly<{ year: 2024 | 2025 | 2026; tierCode: TierCode; priority: number; monthlyMinimum: number; annualMinimum: number; dueDay: 10; reminderDay: 11; status: "draft" }>;

const BASE = [
  ["president", 500, 100000, 1200000], ["senior_vice_president", 400, 50000, 600000],
  ["vice_president_auditor_chair", 300, 30000, 400000], ["director", 200, 10000, 200000],
] as const;

export const POLICY_SEEDS: readonly PolicySeed[] = Object.freeze([2024, 2025, 2026].flatMap((year) => [
  ...BASE.map(([tierCode, priority, monthlyMinimum, annualMinimum]) => ({ year, tierCode, priority, monthlyMinimum, annualMinimum, dueDay: 10, reminderDay: 11, status: "draft" as const })),
  { year, tierCode: "member" as const, priority: 100, monthlyMinimum: year === 2024 ? 1000 : 2000, annualMinimum: year === 2024 ? 20000 : 50000, dueDay: 10 as const, reminderDay: 11 as const, status: "draft" as const },
  ...(year === 2026 ? [{ year, tierCode: "honorary" as const, priority: 0, monthlyMinimum: 0, annualMinimum: 0, dueDay: 10 as const, reminderDay: 11 as const, status: "draft" as const }] : []),
]) as PolicySeed[]);

export const SECONDARY_POSITION_CODES = Object.freeze([
  "busan_branch_president", "busan_branch_vice_president", "busan_branch_general_affairs", "busan_branch_finance",
  "class_1_captain", "class_3_captain", "class_7_captain", "class_41_captain", "class_41_vice_captain",
  "class_42_captain", "class_42_vice_captain",
]);
export const DIRECTOR_DISPLAY_CODES = Object.freeze({
  "총무이사": "general_affairs_director", "기획이사": "planning_director", "법률이사": "legal_director",
  "내외협력이사": "external_cooperation_director", "홍보이사": "public_relations_director", "이사": "director",
});

function fail(code: string): never { throw new Error(code); }
function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }

export function validateDuesPolicyManifest(manifestPath = "docs/database-manifest.yaml") {
  const bytes = readFileSync(manifestPath);
  if (sha256(bytes) !== TODO_13_MANIFEST_SHA256) fail("todo_13_manifest_digest_mismatch");
  const manifest = JSON.parse(bytes.toString("utf8")) as Record<string, any>;
  const required = ["member_position_assignments", "dues_position_tier_mappings", "member_dues_tier_history", "dues_policies", "dues_pledges", "member_assessments", "dues_status_snapshots"];
  for (const table of required) if (!manifest.tables.some((entry: Record<string, any>) => entry.table === table)) fail(`todo_13_table_missing:${table}`);
  const positions = manifest.tables.find((entry: Record<string, any>) => entry.table === "member_position_assignments");
  for (const fragment of ["(effective_to IS NULL OR effective_from < effective_to)", "day|month|year|unknown", "election|appointment|concurrent|historical", "OWNER_APPROVED_21ST_TERM_TO_AGM36_CLOSE", "2026-02-28T12:38:00+09:00"]) {
    if (!positions.catalog_contract_fragments.includes(fragment)) fail(`todo_13_position_contract_missing:${fragment}`);
  }
  const tier = manifest.tables.find((entry: Record<string, any>) => entry.table === "member_dues_tier_history");
  if (!tier.catalog_contract_fragments.includes("president|senior_vice_president|vice_president_auditor_chair|director|member|honorary")) fail("todo_13_tier_domain_mismatch");
  return { tableCount: required.length, policySeedCount: POLICY_SEEDS.length, secondaryCodeCount: SECONDARY_POSITION_CODES.length };
}

export function normalizePositionCode(displayPosition: string): string {
  const direct = DIRECTOR_DISPLAY_CODES[displayPosition as keyof typeof DIRECTOR_DISPLAY_CODES];
  if (direct) return direct;
  const known: Record<string, string> = { "회장": "president", "수석부회장": "senior_vice_president", "부회장": "vice_president", "감사": "auditor", "총회의장": "general_assembly_chair", "부산지부장": "busan_branch_president" };
  return known[displayPosition] ?? fail("unknown_position_mapping");
}

export type Assignment = Readonly<{ id: number; memberId: number; administrationNo: number; positionCode: string; displayPosition: string; effectiveFrom: string; effectiveTo: string | null; sourceAppointmentDate: string | null; appointmentBasis: "election" | "appointment" | "concurrent" | "historical"; overrideReason: string | null; version: number }>;
type TierHistory = Readonly<{ memberId: number; year: number; tierCode: TierCode; priority: number; version: number; effectiveAt: string }>;

export class DuesPolicyContract {
  readonly assignments: Assignment[] = [];
  readonly tierHistory: TierHistory[] = [];
  readonly pledges: Array<{ memberId: number; year: number; monthlyAmount: number; status: "confirmed" }> = [];
  readonly rightsSnapshots: Array<{ memberId: number; year: number; rightsStatus: "rights_member" | "member" | "honorary"; reasonCode: string }> = [];
  #approvedYears = new Set<number>();
  #nextAssignmentId = 1;

  addAssignment(input: Omit<Assignment, "id" | "version">): Assignment {
    if (input.effectiveTo !== null && input.effectiveFrom >= input.effectiveTo) fail("position_effective_interval_invalid");
    if (input.overrideReason !== null && !(input.administrationNo === 21 && input.overrideReason === "OWNER_APPROVED_21ST_TERM_TO_AGM36_CLOSE" && input.effectiveTo === "2026-02-28T12:38:00+09:00")) fail("position_override_not_authorized");
    const row = Object.freeze({ ...input, id: this.#nextAssignmentId++, version: 1 });
    this.assignments.push(row);
    return row;
  }

  previewYear(year: number, members: Array<{ id: number; memberKind: "member" | "honorary" }>) {
    const candidates = members.map((member) => ({ memberId: member.id, selected: this.#selectTier(member.id, member.memberKind, year), persisted: false }));
    return { year, status: "draft_preview" as const, candidates, tierRowsCreated: 0, pledgeRowsCreated: 0, rightsRowsCreated: 0 };
  }

  activateSyntheticYear(year: number, members: Array<{ id: number; memberKind: "member" | "honorary" }>, resolutionRef: string, effectiveAt: string): void {
    if (!resolutionRef.startsWith("SYNTHETIC-")) fail("live_board_resolution_required");
    if (this.#approvedYears.has(year)) fail("policy_year_already_approved");
    const seeds = POLICY_SEEDS.filter((row) => row.year === year);
    if (seeds.length === 0) fail("policy_year_missing");
    for (const member of members) {
      const selected = this.#selectTier(member.id, member.memberKind, year);
      const policy = seeds.find((row) => row.tierCode === selected.tierCode) ?? fail("approved_policy_mapping_missing");
      this.tierHistory.push(Object.freeze({ memberId: member.id, year, tierCode: policy.tierCode, priority: policy.priority, version: 1, effectiveAt }));
      this.pledges.push({ memberId: member.id, year, monthlyAmount: policy.monthlyMinimum, status: "confirmed" });
    }
    this.#approvedYears.add(year);
  }

  derivePromotion(memberId: number, memberKind: "member" | "honorary", year: number, effectiveAt: string): TierHistory {
    if (!this.#approvedYears.has(year)) fail("unapproved_policy_derivation_forbidden");
    const selected = this.#selectTier(memberId, memberKind, year);
    const prior = this.tierHistory.filter((row) => row.memberId === memberId && row.year === year).at(-1) ?? fail("tier_root_missing");
    if (selected.priority < prior.priority) return prior;
    if (selected.priority === prior.priority && selected.tierCode !== prior.tierCode) fail("overlapping_tier_tie");
    if (selected.priority === prior.priority) return prior;
    const row = Object.freeze({ memberId, year, tierCode: selected.tierCode, priority: selected.priority, version: prior.version + 1, effectiveAt });
    this.tierHistory.push(row);
    return row;
  }

  evaluateRights(memberId: number, year: number, paidTotal: number): { rightsStatus: "rights_member" | "member" | "honorary"; reasonCode: string } {
    if (!this.#approvedYears.has(year)) fail("rights_unavailable_without_approved_policy");
    const tier = this.tierHistory.filter((row) => row.memberId === memberId && row.year === year).at(-1) ?? fail("tier_missing");
    const policy = POLICY_SEEDS.find((row) => row.year === year && row.tierCode === tier.tierCode)!;
    const result = tier.tierCode === "honorary" ? { rightsStatus: "honorary" as const, reasonCode: "honorary" } : paidTotal >= policy.annualMinimum ? { rightsStatus: "rights_member" as const, reasonCode: "annual_complete" } : { rightsStatus: "member" as const, reasonCode: "monthly_shortfall" };
    this.rightsSnapshots.push({ memberId, year, ...result });
    return result;
  }

  #selectTier(memberId: number, memberKind: "member" | "honorary", year: number): { tierCode: TierCode; priority: number } {
    const candidates: Array<{ tierCode: TierCode; priority: number }> = [];
    for (const assignment of this.assignments.filter((row) => row.memberId === memberId && this.#overlapsYear(row, year))) {
      const mapped = mapPositionToTier(assignment.positionCode, year);
      if (mapped) candidates.push(mapped);
    }
    candidates.push(memberKind === "honorary" ? { tierCode: "honorary", priority: 0 } : { tierCode: "member", priority: 100 });
    return candidates.sort((a, b) => b.priority - a.priority)[0];
  }

  #overlapsYear(row: Assignment, year: number): boolean {
    const start = `${year}-01-01T00:00:00+09:00`;
    const end = `${year + 1}-01-01T00:00:00+09:00`;
    return row.effectiveFrom < end && (row.effectiveTo === null || row.effectiveTo > start);
  }
}

export function mapPositionToTier(positionCode: string, year: number): { tierCode: TierCode; priority: number } | null {
  if (SECONDARY_POSITION_CODES.includes(positionCode)) return null;
  if (positionCode === "president") return { tierCode: "president", priority: 500 };
  if (positionCode === "senior_vice_president") return { tierCode: "senior_vice_president", priority: 400 };
  if (["vice_president", "auditor"].includes(positionCode) || (year === 2026 && positionCode === "general_assembly_chair")) return { tierCode: "vice_president_auditor_chair", priority: 300 };
  if (/(^|_)director$/.test(positionCode) && !positionCode.startsWith("branch_")) return { tierCode: "director", priority: 200 };
  if (positionCode === "general_assembly_chair") fail("general_assembly_chair_mapping_absent_before_2026");
  fail("unknown_position_mapping");
}
