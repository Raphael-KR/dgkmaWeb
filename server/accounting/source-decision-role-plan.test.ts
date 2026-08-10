import assert from "node:assert/strict";
import test from "node:test";
import { loadRoleApplyPlans, type RoleDecisionEvidence } from "./source-decision-role-plan";
import { projectRoleOperation, reserveRoleExecution } from "./source-decision-role-materialization";

const operationUid = "11111111-1111-4111-8111-111111111111";
const memberUid = "22222222-2222-4222-8222-222222222222";
const evidence: RoleDecisionEvidence = {
  decisionItemId: "10",
  coordinateId: "20",
  coordinateKey: "notion:role:synthetic:1",
  sourceRowVersionId: "30",
  contentDigest: "a".repeat(64),
  normalizedPayload: {
    administration_no: 22,
    appointment_basis: "appointment",
    date_precision: "day",
    display_position: "이사",
    effective_from: "2026-03-01T00:00:00+09:00",
    effective_to: null,
    generation: 20,
    name_key_digest: "b".repeat(64),
    position_code: "director",
    source_appointment_date: "2026-03-01",
    source_date_text: "2026-03-01",
  },
  decisionPayload: {
    candidate_member_uid_or_null: memberUid,
    case_uid: "33333333-3333-4333-8333-333333333333",
    evidence_digest: "c".repeat(64),
    evidence_kind: "board_roster_row",
    outcome: "approve",
    score_basis: "exact_board_name_generation_position",
  },
};

test("locks an approved role match and derives one deterministic position plan", async () => {
  const calls: string[] = [];
  const client = { query: async (sql: string) => {
    calls.push(sql);
    if (sql.includes("FROM public.association_members")) return { rowCount: 1, rows: [{ id: "40", member_uid: memberUid, status: "active" }] };
    return { rowCount: 0, rows: [] };
  } };
  const first = await loadRoleApplyPlans(client as never, "NOTION_ORGANIZATION_ROLE_HISTORY", operationUid, [evidence]);
  const second = await loadRoleApplyPlans(client as never, "NOTION_ORGANIZATION_ROLE_HISTORY", operationUid, [evidence]);
  assert.equal(first.length, 1);
  assert.equal(first[0].memberId, "40");
  assert.equal(first[0].assignmentUid, second[0].assignmentUid);
  assert.equal(calls.length, 6);
});

test("rejects a name-only approval before member locking", async () => {
  const client = { query: async () => { throw new Error("unexpected_query"); } };
  await assert.rejects(() => loadRoleApplyPlans(client as never, "NOTION_ORGANIZATION_ROLE_HISTORY", operationUid, [{ ...evidence, decisionPayload: { ...evidence.decisionPayload, evidence_kind: "name_only", score_basis: "name_only_unapprovable" } }]), /source_decision_role_evidence_invalid/);
});

test("reserves only inserted role rows and projects a closed result/audit bijection", async () => {
  const client = { query: async (_sql: string, values: unknown[]) => {
    const table = String(values[0]).slice("public.".length);
    const id = String(client.nextId++);
    return { rowCount: 1, rows: [{ id, sequence_name: `public.${table}_id_seq` }] };
  }, nextId: 1 };
  const plans = await loadRoleApplyPlans({ query: async (sql: string) => sql.includes("FROM public.association_members") ? { rowCount: 1, rows: [{ id: "40", member_uid: memberUid, status: "active" }] } : { rowCount: 0, rows: [] } } as never, "NOTION_ORGANIZATION_ROLE_HISTORY", operationUid, [evidence]);
  const reservation = await reserveRoleExecution(client as never, plans, operationUid, "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555", "50", "60");
  const projection = projectRoleOperation(reservation);
  assert.equal(projection.expectedResults.length, 7);
  assert.equal(projection.reservationSlots.length, 12);
  assert.deepEqual(projection.reservationSlots.map((slot) => slot.phase), [0, 10, 10, 10, 10, 30, 30, 30, 30, 30, 30, 30]);
  assert.equal(new Set(projection.expectedResults.map((result) => result.action_correlation_uid)).size, 7);
});
