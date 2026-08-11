import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { materializeAnnualPolicyActivation } from "./annual-policy-activation-write";

const actor = {
  userId: 7,
  userUid: "11111111-1111-4111-8111-111111111111",
  name: "synthetic admin",
  authorizationVersion: "a".repeat(64),
};
const tiers = ["president", "senior_vice_president", "vice_president_auditor_chair", "director", "member", "honorary"];

class Fixture {
  calls: string[] = [];
  committed: string[] = [];
  private staged: string[] = [];
  private nextId = 100;
  constructor(private readonly failMapping = false, private readonly isolation = "serializable") {}

  client = { query: async (sql: string, params?: unknown[]) => {
    this.calls.push(sql.replace(/\s+/g, " ").trim());
    if (sql === "SELECT current_setting('transaction_isolation') transaction_isolation") return { rowCount: 1, rows: [{ transaction_isolation: this.isolation }] };
    if (sql.includes("FROM public.users")) return { rowCount: 1, rows: [{ id: actor.userId, user_uid: actor.userUid, name: actor.name, is_admin: true }] };
    if (sql.includes("FROM public.dues_policies") && sql.includes("status='draft'")) return { rowCount: 6, rows: tiers.map((tier, index) => ({ id: String(index + 1), tier_code: tier, priority: 600 - index, monthly_minimum: "1000", annual_minimum: "12000", due_day: 10, reminder_day: 11, source_logical_id: "9", source_row_version_id: null, version: 1 })) };
    if (sql.includes("FROM public.dues_position_tier_mappings") && sql.includes("status='draft'")) return { rowCount: 2, rows: [
      { id: "20", position_code: "member", tier_code: "member", priority: 100, adds_obligation: true, source_logical_id: "9", source_row_version_id: null, version: 1 },
      { id: "21", position_code: "secondary", tier_code: null, priority: 0, adds_obligation: false, source_logical_id: "9", source_row_version_id: null, version: 1 },
    ] };
    if (sql.includes("version<>1")) return { rowCount: 1, rows: [{ policies: 0, mappings: 0 }] };
    if (sql.startsWith("SELECT nextval")) return { rowCount: 1, rows: [{ id: String(this.nextId++) }] };
    if (sql.startsWith("INSERT INTO public.dues_policies")) { this.staged.push(`policy:${String(params?.[2])}:${String(params?.[0])}`); return { rowCount: 1, rows: [] }; }
    if (sql.startsWith("INSERT INTO public.dues_position_tier_mappings")) {
      if (this.failMapping) throw new Error("synthetic_mapping_failure");
      this.staged.push(`mapping:${String(params?.[2])}:${String(params?.[0])}`); return { rowCount: 1, rows: [] };
    }
    throw new Error(`unexpected_query:${sql}`);
  }} as unknown as Pick<PoolClient, "query">;

  async transaction(work: () => Promise<void>): Promise<void> {
    this.staged = [];
    try { await work(); this.committed = [...this.staged]; }
    catch (error) { this.staged = []; this.committed = []; throw error; }
  }
}

test("DB writer locks the complete draft graph, reserves afterward, then inserts every policy before mappings", async () => {
  const fixture = new Fixture();
  await fixture.transaction(async () => {
    const result = await materializeAnnualPolicyActivation(fixture.client, { duesYear: 2026, effectiveAt: "2026-01-01T00:00:00+09:00", resolutionRef: "synthetic-resolution", actor });
    assert.equal(result.policyIds.length, 6);
    assert.equal(result.mappingIds.length, 2);
    assert.deepEqual(result.executionOrder.map((entry) => entry.split(":")[0]), ["policy", "policy", "policy", "policy", "policy", "policy", "mapping", "mapping"]);
  });
  assert.deepEqual(fixture.committed.map((entry) => entry.split(":")[0]), ["policy", "policy", "policy", "policy", "policy", "policy", "mapping", "mapping"]);
  const lastLock = fixture.calls.findLastIndex((sql) => sql.includes("ORDER BY position_code FOR UPDATE"));
  const firstReservation = fixture.calls.findIndex((sql) => sql.startsWith("SELECT nextval"));
  assert.ok(lastLock >= 0 && firstReservation > lastLock);
});

test("mapping insertion failure leaves no separately committed policy successor", async () => {
  const fixture = new Fixture(true);
  await assert.rejects(fixture.transaction(async () => {
    await materializeAnnualPolicyActivation(fixture.client, { duesYear: 2026, effectiveAt: "2026-01-01T00:00:00+09:00", resolutionRef: "synthetic-resolution", actor });
  }), /synthetic_mapping_failure/);
  assert.deepEqual(fixture.committed, []);
});

test("writer refuses a non-SERIALIZABLE caller before locks or reservations", async () => {
  const fixture = new Fixture(false, "read committed");
  await assert.rejects(materializeAnnualPolicyActivation(fixture.client, { duesYear: 2026, effectiveAt: "2026-01-01T00:00:00+09:00", resolutionRef: "synthetic-resolution", actor }), /annual_activation_serializable_required/);
  assert.equal(fixture.calls.length, 1);
});
