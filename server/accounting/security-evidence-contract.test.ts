import assert from "node:assert/strict";
import test from "node:test";
import { assertClosedSecurityCatalog, assertSensitiveEvidenceAbsent } from "./security-evidence-contract";

const catalog = {
  publicSchemaCreate: false,
  publicRelationPrivileges: 0,
  publicSequencePrivileges: 0,
  publicRoutinePrivileges: 0,
  defaultPublicPrivileges: 0,
  rlsEnabled: 0,
  rlsForced: 0,
  policies: 0,
  securityDefiner: 0,
  relationOwnerMismatch: 0,
  routineOwnerMismatch: 0,
  roleMembershipCount: 3,
  roleMembershipDigest: "a".repeat(64),
};

test("closed Development security aggregate is accepted", () => {
  assert.doesNotThrow(() => assertClosedSecurityCatalog(catalog));
});

test("PUBLIC grant, RLS, owner and membership digest drift fail closed", () => {
  for (const drift of [
    { publicRelationPrivileges: 1 },
    { publicSchemaCreate: true },
    { rlsEnabled: 1 },
    { relationOwnerMismatch: 1 },
    { roleMembershipDigest: "bad" },
  ]) {
    assert.throws(
      () => assertClosedSecurityCatalog({ ...catalog, ...drift }),
      /security_catalog_drift/,
    );
  }
});

test("synthetic credential-shaped log tokens are rejected without echoing them", () => {
  for (const token of [
    "postgresql://synthetic.invalid/db",
    "password = synthetic",
    "client_secret: synthetic",
    "-----BEGIN PRIVATE KEY-----",
  ]) {
    assert.throws(
      () => assertSensitiveEvidenceAbsent(["safe", token]),
      /sensitive_evidence_detected/,
    );
  }
  assert.doesNotThrow(() => assertSensitiveEvidenceAbsent(["counts only", "token_count=0"]));
});
