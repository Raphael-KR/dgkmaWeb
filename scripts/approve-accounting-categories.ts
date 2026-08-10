import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  createOrResumeDisposableTarget,
  closeDisposableTarget,
  createTargetPool,
  resolveDevelopmentTarget,
  resolveDisposableControlTarget,
  shutdownPool,
  verifyDevelopmentTarget,
} from "../server/db-target";
import { verifyActorReceipt, type ActorReceiptRoute, type VerifiedActor } from "./admin-actor-receipt";

const CATEGORY_CODES = [
  "DUES_INCOME",
  "OTHER_INCOME",
  "DUES_REFUND",
  "GENERAL_EXPENSE",
  "INTERNAL_TRANSFER_IN",
  "INTERNAL_TRANSFER_OUT",
] as const;

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing_argument:${name}`);
  return process.argv[index + 1];
}

async function approve(pool: Pool, actor: VerifiedActor): Promise<"approved" | "verified_noop"> {
  await pool.query("BEGIN");
  try {
    const lockedActor = await pool.query<{ ok: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM public.users WHERE id=$1 AND user_uid=$2::uuid AND is_admin=true FOR UPDATE
      ) AS ok
    `, [actor.userId, actor.userUid]);
    if (lockedActor.rows[0]?.ok !== true) throw new Error("blocked_actor");
    const rows = await pool.query<{
      id: string; category_code: string; version: number; status: string; display_name: string;
      report_section: string; dues_effect: string; active_from: string; active_to: string | null;
      effective_at: string; supersedes_id: string | null;
    }>(`
      SELECT id::text,category_code,version,status,display_name,report_section,dues_effect,
             active_from::text,active_to::text,effective_at::text,supersedes_id::text
      FROM public.accounting_categories
      WHERE category_code = ANY($1::text[])
      ORDER BY category_code,version
      FOR UPDATE
    `, [[...CATEGORY_CODES]]);
    const byCode = new Map<string, typeof rows.rows>();
    for (const row of rows.rows) byCode.set(row.category_code, [...(byCode.get(row.category_code) ?? []), row]);
    let inserts = 0;
    for (const code of CATEGORY_CODES) {
      const versions = byCode.get(code) ?? [];
      const tip = versions.at(-1);
      if (!tip) throw new Error(`category_seed_missing:${code}`);
      if (
        versions.length === 2 && versions[0].version === 1 && versions[0].status === "draft" &&
        tip.version === 2 && tip.status === "approved" && tip.supersedes_id === versions[0].id
      ) {
        continue;
      }
      if (versions.length !== 1 || tip.version !== 1 || tip.status !== "draft" || tip.supersedes_id !== null) {
        throw new Error(`category_tip_drift:${code}`);
      }
      const correlationUid = randomUUID();
      await pool.query(`
        INSERT INTO public.accounting_categories
          (category_code,version,display_name,report_section,dues_effect,active_from,active_to,status,effective_at,
           supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
           recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version,
           approval_actor_user_id,approval_actor_uid_snapshot,approval_actor_name_snapshot,approval_actor_scope,
           approval_actor_at,approval_actor_correlation_uid,approval_actor_authorization_version)
        VALUES ($1,2,$2,$3,$4,$5::date,$6::date,'approved',$7::timestamptz,$8::bigint,
                $9,$10::uuid,$11,'admin',clock_timestamp(),$12::uuid,$13,
                $9,$10::uuid,$11,'admin',clock_timestamp(),$12::uuid,$13)
      `, [
        code, tip.display_name, tip.report_section, tip.dues_effect, tip.active_from, tip.active_to,
        tip.effective_at, tip.id, actor.userId, actor.userUid, actor.name, correlationUid,
        actor.authorizationVersion,
      ]);
      inserts += 1;
    }
    const state = await pool.query<{
      approved_category_tips: number; draft_policy_tips: number; approved_policy_tips: number;
      draft_mapping_tips: number; approved_mapping_tips: number;
    }>(`
      SELECT
        (SELECT count(*)::int FROM public.accounting_categories c
          WHERE c.status='approved' AND NOT EXISTS (
            SELECT 1 FROM public.accounting_categories child WHERE child.supersedes_id=c.id
          )) AS approved_category_tips,
        (SELECT count(*)::int FROM public.dues_policies p
          WHERE p.status='draft' AND NOT EXISTS (SELECT 1 FROM public.dues_policies child WHERE child.supersedes_id=p.id)) AS draft_policy_tips,
        (SELECT count(*)::int FROM public.dues_policies p
          WHERE p.status='approved' AND NOT EXISTS (SELECT 1 FROM public.dues_policies child WHERE child.supersedes_id=p.id)) AS approved_policy_tips,
        (SELECT count(*)::int FROM public.dues_position_tier_mappings m
          WHERE m.status='draft' AND NOT EXISTS (SELECT 1 FROM public.dues_position_tier_mappings child WHERE child.supersedes_id=m.id)) AS draft_mapping_tips,
        (SELECT count(*)::int FROM public.dues_position_tier_mappings m
          WHERE m.status='approved' AND NOT EXISTS (SELECT 1 FROM public.dues_position_tier_mappings child WHERE child.supersedes_id=m.id)) AS approved_mapping_tips
    `);
    const observed = state.rows[0];
    if (
      observed.approved_category_tips !== 6 || observed.draft_policy_tips !== 16 ||
      observed.approved_policy_tips !== 0 || observed.draft_mapping_tips !== 46 ||
      observed.approved_mapping_tips !== 0
    ) {
      throw new Error("category_approval_scope_mismatch");
    }
    await pool.query("COMMIT");
    return inserts === 0 ? "verified_noop" : "approved";
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function runWithTarget(
  pool: Pool,
  route: ActorReceiptRoute,
  receiptPath: string,
): Promise<void> {
  const actor = await verifyActorReceipt(pool, receiptPath, route);
  const outcome = await approve(pool, actor);
  console.log(JSON.stringify({
    schema_version: "dgkma-accounting-category-approval-v1",
    target: route.kind,
    target_fingerprint: route.targetFingerprint,
    category_codes: CATEGORY_CODES,
    approved_category_tips: 6,
    draft_policy_tips: 16,
    approved_policy_tips: 0,
    draft_mapping_tips: 46,
    approved_mapping_tips: 0,
    outcome,
    result: "approved",
  }));
}

async function main(): Promise<void> {
  const target = arg("--target");
  const receiptPath = arg("--actor-receipt");
  const requestedCodes = arg("--codes");
  if (requestedCodes !== CATEGORY_CODES.join(",")) throw new Error("category_approval_codes_mismatch");
  if (target === "development") {
    const resolved = resolveDevelopmentTarget(process.env, "migration");
    const pool = createTargetPool(resolved);
    try {
      const verified = await verifyDevelopmentTarget(pool, resolved);
      await runWithTarget(pool, {
        kind: "development",
        targetFingerprint: verified.targetFingerprint,
        candidateUserId: 315,
      }, receiptPath);
    } finally {
      await shutdownPool(pool);
    }
    return;
  }
  if (target !== "disposable-test") throw new Error("category_approval_target_invalid");
  const runUid = arg("--run-uid");
  const controlResolved = resolveDisposableControlTarget(process.env, runUid);
  const controlPool = createTargetPool(controlResolved);
  let disposable: Awaited<ReturnType<typeof createOrResumeDisposableTarget>> | undefined;
  try {
    const development = await verifyDevelopmentTarget(controlPool, { ...controlResolved, kind: "development" });
    disposable = await createOrResumeDisposableTarget(controlPool, development, runUid);
    await runWithTarget(disposable.pool, {
      kind: "disposable-test",
      targetFingerprint: disposable.targetFingerprint,
      disposableRunUid: runUid,
      parentTargetFingerprint: disposable.parentTargetFingerprint,
    }, receiptPath);
  } finally {
    if (disposable) await closeDisposableTarget(controlPool, disposable);
    await shutdownPool(controlPool);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    schema_version: "dgkma-accounting-category-approval-error-v1",
    error_code: error instanceof Error ? error.message : "unknown",
    result: "rejected",
  }));
  process.exitCode = 1;
});
