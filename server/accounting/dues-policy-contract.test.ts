import assert from "node:assert/strict";
import test from "node:test";
import { DIRECTOR_DISPLAY_CODES, DuesPolicyContract, POLICY_SEEDS, SECONDARY_POSITION_CODES, mapPositionToTier, normalizePositionCode, validateDuesPolicyManifest } from "./dues-policy-contract";

test("Todo 13 manifest and exact 2024-2026 draft seeds are closed", () => {
  const result = validateDuesPolicyManifest();
  assert.deepEqual(result, { tableCount: 7, policySeedCount: 16, secondaryCodeCount: 11 });
  assert.equal(POLICY_SEEDS.every((row) => row.status === "draft" && row.dueDay === 10 && row.reminderDay === 11), true);
  assert.deepEqual(POLICY_SEEDS.find((row) => row.year === 2026 && row.tierCode === "vice_president_auditor_chair"), { year: 2026, tierCode: "vice_president_auditor_chair", priority: 300, monthlyMinimum: 30000, annualMinimum: 400000, dueDay: 10, reminderDay: 11, status: "draft" });
});

test("all six director displays map to director while secondary roles add no tier", () => {
  for (const [display, code] of Object.entries(DIRECTOR_DISPLAY_CODES)) {
    assert.equal(normalizePositionCode(display), code);
    assert.deepEqual(mapPositionToTier(code, 2026), { tierCode: "director", priority: 200 });
  }
  for (const code of SECONDARY_POSITION_CODES) assert.equal(mapPositionToTier(code, 2026), null);
  assert.deepEqual(mapPositionToTier("general_assembly_chair", 2026), { tierCode: "vice_president_auditor_chair", priority: 300 });
  assert.throws(() => mapPositionToTier("general_assembly_chair", 2025), /general_assembly_chair_mapping_absent_before_2026/);
  assert.throws(() => normalizePositionCode("미승인직책"), /unknown_position_mapping/);
});

test("overlapping officer and class roles are preserved while only highest tier is derived", () => {
  const contract = new DuesPolicyContract();
  contract.addAssignment({ memberId: 1, administrationNo: 22, positionCode: "external_cooperation_director", displayPosition: "내외협력이사", effectiveFrom: "2026-03-06T00:00:00+09:00", effectiveTo: null, sourceAppointmentDate: "2026-03-06", appointmentBasis: "appointment", overrideReason: null });
  contract.addAssignment({ memberId: 1, administrationNo: 22, positionCode: "class_41_captain", displayPosition: "졸업41기 기장", effectiveFrom: "2026-03-06T00:00:00+09:00", effectiveTo: null, sourceAppointmentDate: "2026-03-06", appointmentBasis: "concurrent", overrideReason: null });
  assert.equal(contract.assignments.length, 2);
  const preview = contract.previewYear(2026, [{ id: 1, memberKind: "member" }]);
  assert.equal(preview.candidates[0].selected.tierCode, "director");
  assert.deepEqual([preview.tierRowsCreated, preview.pledgeRowsCreated, preview.rightsRowsCreated], [0, 0, 0]);
});

test("draft policy is preview-only; synthetic approval creates tier and pledge atomically", () => {
  const contract = new DuesPolicyContract();
  contract.addAssignment({ memberId: 1, administrationNo: 22, positionCode: "general_assembly_chair", displayPosition: "총회의장", effectiveFrom: "2026-02-28T12:38:00+09:00", effectiveTo: null, sourceAppointmentDate: "2026-02-27", appointmentBasis: "election", overrideReason: null });
  const preview = contract.previewYear(2026, [{ id: 1, memberKind: "member" }, { id: 2, memberKind: "honorary" }]);
  assert.equal(preview.status, "draft_preview");
  assert.equal(contract.tierHistory.length, 0);
  assert.throws(() => contract.evaluateRights(1, 2026, 400000), /rights_unavailable_without_approved_policy/);
  assert.throws(() => contract.activateSyntheticYear(2026, [{ id: 1, memberKind: "member" }], "BOARD-UNAPPROVED", "2026-01-01T00:00:00+09:00"), /live_board_resolution_required/);
  contract.activateSyntheticYear(2026, [{ id: 1, memberKind: "member" }, { id: 2, memberKind: "honorary" }], "SYNTHETIC-TEST-ONLY", "2026-01-01T00:00:00+09:00");
  assert.deepEqual(contract.tierHistory.map((row) => row.tierCode), ["vice_president_auditor_chair", "honorary"]);
  assert.deepEqual(contract.pledges.map((row) => row.monthlyAmount), [30000, 0]);
  assert.deepEqual(contract.evaluateRights(1, 2026, 400000), { rightsStatus: "rights_member", reasonCode: "annual_complete" });
  assert.deepEqual(contract.evaluateRights(2, 2026, 0), { rightsStatus: "honorary", reasonCode: "honorary" });
});

test("promotion appends a higher tip and a later lower role never lowers the year", () => {
  const contract = new DuesPolicyContract();
  contract.addAssignment({ memberId: 1, administrationNo: 22, positionCode: "director", displayPosition: "이사", effectiveFrom: "2026-01-01T00:00:00+09:00", effectiveTo: null, sourceAppointmentDate: "2026-01-01", appointmentBasis: "appointment", overrideReason: null });
  contract.activateSyntheticYear(2026, [{ id: 1, memberKind: "member" }], "SYNTHETIC-PROMOTION", "2026-01-01T00:00:00+09:00");
  contract.addAssignment({ memberId: 1, administrationNo: 22, positionCode: "vice_president", displayPosition: "부회장", effectiveFrom: "2026-06-01T00:00:00+09:00", effectiveTo: null, sourceAppointmentDate: "2026-06-01", appointmentBasis: "appointment", overrideReason: null });
  const promoted = contract.derivePromotion(1, "member", 2026, "2026-06-01T00:00:00+09:00");
  assert.deepEqual({ tier: promoted.tierCode, version: promoted.version }, { tier: "vice_president_auditor_chair", version: 2 });
  const unchanged = contract.derivePromotion(1, "member", 2026, "2026-07-01T00:00:00+09:00");
  assert.strictEqual(unchanged, promoted);
});

test("21st correction uses only the owner-approved AGM36 close override", () => {
  const contract = new DuesPolicyContract();
  assert.throws(() => contract.addAssignment({ memberId: 1, administrationNo: 21, positionCode: "director", displayPosition: "이사", effectiveFrom: "2024-01-01T00:00:00+09:00", effectiveTo: "2026-02-28T12:38:00+09:00", sourceAppointmentDate: null, appointmentBasis: "historical", overrideReason: "OTHER" }), /position_override_not_authorized/);
  contract.addAssignment({ memberId: 1, administrationNo: 21, positionCode: "director", displayPosition: "이사", effectiveFrom: "2024-01-01T00:00:00+09:00", effectiveTo: "2026-02-28T12:38:00+09:00", sourceAppointmentDate: null, appointmentBasis: "historical", overrideReason: "OWNER_APPROVED_21ST_TERM_TO_AGM36_CLOSE" });
  assert.equal(contract.assignments.length, 1);
});
