import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  assertReadOnlyGeneratedSql,
  CANONICAL_EMAIL_VECTORS,
  CANONICAL_MANIFEST_SHA256,
  canonicalEmail,
  canonicalEmailVectorSql,
  detectIdentityAnchorBlockers,
  developmentIdentityAnchorPreflightSql,
  IDENTITY_ANCHOR_DEFINITIONS,
  IDENTITY_BLOCKER_CODES,
  previewCurrentExactLinks,
  requireExpectedIdentityBlockers,
  resolveTaskNineCommitSha,
  type IdentityFixture,
  validateIdentityAnchorContract,
  validateCanonicalEmailNormalizer,
} from "../scripts/member-identity-anchor";
import { canonicalPhone, canonicalPhoneSql } from "../scripts/database-domain-constraints";

const fixture = <T>(name: string): T => JSON.parse(
  readFileSync(`server/fixtures/database-architecture/task-9/${name}`, "utf8"),
) as T;

test("manifest and application definitions close the exact Todo 9 brownfield contract", () => {
  assert.equal(validateIdentityAnchorContract(), IDENTITY_ANCHOR_DEFINITIONS);
  assert.deepEqual(IDENTITY_ANCHOR_DEFINITIONS.map((definition) => definition.table), [
    "users", "alumni_database", "pending_registrations",
  ]);
  assert.equal(Object.keys(IDENTITY_BLOCKER_CODES).length, 12);
  assert.ok(IDENTITY_ANCHOR_DEFINITIONS[0].columns.includes("user_uid uuid NOT NULL DEFAULT gen_random_uuid()"));
  assert.ok(IDENTITY_ANCHOR_DEFINITIONS[2].columns.includes("status text NOT NULL DEFAULT 'pending'"));
  assert.equal(
    execFileSync("shasum", ["-a", "256", "docs/database-manifest.yaml"], { encoding: "utf8" }).trim().split(/\s+/)[0],
    CANONICAL_MANIFEST_SHA256,
  );
});

test("shared TypeScript and manifest-generated SQL normalization cover +82, punctuation, blank, invalid, and duplicates", () => {
  const cases = fixture<{
    email_cases: Array<{ vector_id: string; raw: string | null; expected: string | null }>;
    phone_cases: Array<{ raw: string | null; expected: string | null }>;
  }>("normalization-cases.json");
  assert.deepEqual(cases.email_cases, CANONICAL_EMAIL_VECTORS);
  for (const entry of cases.email_cases) assert.equal(canonicalEmail(entry.raw), entry.expected);
  assert.doesNotThrow(() => validateCanonicalEmailNormalizer(canonicalEmail, cases.email_cases));
  for (const entry of cases.phone_cases) assert.equal(canonicalPhone(entry.raw), entry.expected);
  const manifest = JSON.parse(readFileSync("docs/database-manifest.yaml", "utf8"));
  assert.equal(canonicalPhoneSql("phone_number"), manifest.canonical_phone_sql.replace(/\braw\b/g, "phone_number"));
  assert.equal(canonicalPhoneSql("mobile"), manifest.canonical_phone_sql.replace(/\braw\b/g, "mobile"));
  const emailSql = canonicalEmailVectorSql();
  assert.equal((emailSql.match(/\('users\.email'/g) ?? []).length, CANONICAL_EMAIL_VECTORS.length);
  assert.equal((emailSql.match(/\('pending_registrations\.email'/g) ?? []).length, CANONICAL_EMAIL_VECTORS.length);
  assert.match(emailSql, /lower\(btrim\(raw_value\)\) IS NOT DISTINCT FROM expected/);
});

test("legacy JavaScript trim semantics are rejected for PostgreSQL btrim differential vectors", () => {
  const legacyTrim = (raw: string | null) => raw === null ? null : raw.trim().toLowerCase();
  assert.notEqual(legacyTrim("\tMember@Example.COM\t"), canonicalEmail("\tMember@Example.COM\t"));
  assert.notEqual(legacyTrim("\nMember@Example.COM\n"), canonicalEmail("\nMember@Example.COM\n"));
  assert.notEqual(legacyTrim("\u00a0Member@Example.COM\u00a0"), canonicalEmail("\u00a0Member@Example.COM\u00a0"));
  assert.throws(
    () => validateCanonicalEmailNormalizer(legacyTrim),
    /canonical_email_normalizer_parity_mismatch:tab_edges/,
  );
  const source = readFileSync("scripts/member-identity-anchor.ts", "utf8");
  assert.doesNotMatch(source, /raw\.trim\(\)\.toLowerCase\(\)/);
  assert.match(source, /raw\.replace\(\/\^ \+\| \+\$\/g, ""\)\.toLowerCase\(\)/);
});

test("current exact matched_user_id preview is FK-backed and rerun-stable with no name inference", () => {
  const exact = fixture<{ state: IdentityFixture; expected_links: unknown[]; expected_name_only_link_count: number }>("exact-link-cases.json");
  const first = previewCurrentExactLinks(exact.state);
  const second = previewCurrentExactLinks(exact.state);
  assert.equal(first.result, "ready_for_todo_12_input");
  assert.deepEqual(first.links, exact.expected_links);
  assert.deepEqual(second, first);
  assert.equal(first.links.filter((link) => link.alumni_record_id === 12).length, exact.expected_name_only_link_count);
  assert.equal(first.source_mutations, 0);
  assert.equal(first.rows_backfilled, 0);

  const nameOnly = fixture<{ state: IdentityFixture; expected_blocker_count: number; expected_link_count: number }>("name-only-cases.json");
  const nameOnlyPreview = previewCurrentExactLinks(nameOnly.state);
  assert.equal(nameOnlyPreview.blockers.length, nameOnly.expected_blocker_count);
  assert.equal(nameOnlyPreview.links.length, nameOnly.expected_link_count);
});

test("duplicate and invalid nonblank identity plus NULL pending status block terminally without partial links", () => {
  const conflict = fixture<{ state: IdentityFixture; expected_blocker_codes: string[]; expected_link_count: number }>("conflict-cases.json");
  const blockers = detectIdentityAnchorBlockers(conflict.state);
  assert.deepEqual([...new Set(blockers.map((entry) => entry.blocker_code))].sort(), conflict.expected_blocker_codes);
  assert.ok(blockers.every((entry) => entry.exception_class === "pre_anchor_blocking"));
  assert.ok(blockers.every((entry) => entry.terminal && entry.sequence20_outcome === "block_before_ddl"));
  const preview = previewCurrentExactLinks(conflict.state);
  assert.equal(preview.result, "blocked_pre_anchor");
  assert.equal(preview.links.length, conflict.expected_link_count);
  assert.equal(preview.rows_backfilled, 0);
  assert.equal(preview.source_mutations, 0);
  assert.throws(
    () => requireExpectedIdentityBlockers(conflict.state, conflict.expected_blocker_codes.slice(1)),
    /task_9_fixture_blocker_mismatch/,
  );
});

test("explicit task commit SHA is validated without reading local Git and fallback is local-only", () => {
  const valid = "c29929c17dcc52e834476ce1d12424c7f1b6554d";
  let fallbackCalls = 0;
  const fallback = () => {
    fallbackCalls += 1;
    return valid;
  };
  assert.equal(resolveTaskNineCommitSha(valid, fallback), valid);
  assert.equal(fallbackCalls, 0);
  assert.throws(() => resolveTaskNineCommitSha("not-a-sha", fallback), /task_9_commit_sha_invalid/);
  assert.equal(fallbackCalls, 0);
  assert.equal(resolveTaskNineCommitSha(undefined, fallback), valid);
  assert.equal(fallbackCalls, 1);
});

test("generated Development query is guarded read-only and produces no schema, backfill, or admin receipt", () => {
  const sql = developmentIdentityAnchorPreflightSql();
  assert.doesNotThrow(() => assertReadOnlyGeneratedSql(sql));
  assert.match(sql, /^BEGIN TRANSACTION READ ONLY;/);
  assert.match(sql, /current_setting\('transaction_read_only'\)/);
  assert.match(sql, /lower\(btrim\(email\)\) AS email_canonical/);
  assert.match(sql, /alumni_database\.matched_user_id/);
  assert.match(sql, /'pre_anchor_blocking'/);
  assert.match(sql, /projection_equal/);
  assert.equal((sql.match(/\('users\.email'/g) ?? []).length, CANONICAL_EMAIL_VECTORS.length);
  assert.equal((sql.match(/\('pending_registrations\.email'/g) ?? []).length, CANONICAL_EMAIL_VECTORS.length);
  assert.match(sql, /ROLLBACK;\n$/);
  assert.doesNotMatch(sql, /^\s*(?:ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE|MERGE|GRANT|REVOKE)\b/im);
  assert.throws(
    () => assertReadOnlyGeneratedSql("BEGIN TRANSACTION READ ONLY;\nUPDATE users SET name='x';\nROLLBACK;\n"),
    /identity_preflight_write_keyword_rejected/,
  );
  assert.equal(existsSync("migrations/0020_existing_integrity.sql"), true);
  assert.equal(existsSync("development-admin-approved.json"), false);
});

test("Todo 9 harness excludes the audited account-deletion write integration with an exact static-only guard", () => {
  const verifier = readFileSync("scripts/verify-database-architecture.ts", "utf8");
  const start = verifier.indexOf("function runTaskNine");
  const end = verifier.indexOf("if (process.argv[2]", start);
  const taskNine = start >= 0 && end > start ? verifier.slice(start, end) : "";
  const pattern = "--test-name-pattern=deleteUserAccount processes every approved relation in one transaction";
  const patternIndex = taskNine.indexOf(pattern);
  const deletionFileIndex = taskNine.indexOf('"server/account-deletion-storage.test.ts"');
  assert.ok(patternIndex >= 0 && deletionFileIndex > patternIndex);
  assert.equal((taskNine.match(/"server\/account-deletion-storage\.test\.ts"/g) ?? []).length, 1);
  assert.doesNotMatch(taskNine, /development PostgreSQL deletes one member while preserving public content/);

  const deletionSource = readFileSync("server/account-deletion-storage.test.ts", "utf8");
  assert.match(deletionSource, /development PostgreSQL deletes one member while preserving public content/);
  assert.match(deletionSource, /insert into users/);
  assert.match(deletionSource, /storage\.deleteUserAccount/);
});
