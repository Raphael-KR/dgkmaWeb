import assert from "node:assert/strict";
import test from "node:test";
import { readServerSource, readDeclarationSource } from "../../tests/source";

const alumniPath = "modules/registry/alumni-record-storage.ts";
const pendingPath = "modules/registry/pending-registration-storage.ts";
const identityPath = "modules/identity/storage.ts";
const supportPath = "modules/identity/registration-support.ts";

test("Kakao login uses PostgreSQL alumni matching without Google Sheets", async () => {
  const authorizeRoute = await readServerSource("modules/identity/kakao-login.ts");

  assert.doesNotMatch(authorizeRoute, /findAlumniByPhoneAndName|\.\/google-sheets/);
  assert.match(authorizeRoute, /getUserByNormalizedPhone/);
  assert.match(authorizeRoute, /createUserWithAlumniClaim/);
});

test("storage compares normalized phone numbers and claims one unlinked alumni row", async () => {
  const claimMethod = await readDeclarationSource(alumniPath, "createUserWithAlumniClaim");

  await readDeclarationSource(identityPath, "getUserByNormalizedPhone");
  assert.match(claimMethod, /db\.transaction/);
  assert.match(claimMethod, /isNull\(alumniDatabase\.matchedUserId\)/);
  assert.match(claimMethod, /normalizePhoneForComparison/);
});

test("member creation and alumni claim share one database transaction", async () => {
  const registrationMethod = await readDeclarationSource(alumniPath, "createUserWithAlumniClaim");

  assert.match(registrationMethod, /db\.transaction/);
  assert.match(registrationMethod, /tx\.insert\(users\)/);
  assert.match(registrationMethod, /isNull\(alumniDatabase\.matchedUserId\)/);
  assert.match(registrationMethod, /throw new AlumniClaimConflictError/);
});

test("transactional alumni lookup uses the same normalized phone SQL expression", async () => {
  const registrationMethod = await readDeclarationSource(alumniPath, "createUserWithAlumniClaim");

  await readDeclarationSource(supportPath, "normalizedPhoneSql");
  assert.match(registrationMethod, /normalizedPhoneSql\(alumniDatabase\.mobile\)/);
  assert.doesNotMatch(registrationMethod, /regexp_replace\(coalesce\(\$\{alumniDatabase\.mobile\}/);
});

test("atomic registration locks the phone before rechecking users", async () => {
  const sharedRegistration = await readDeclarationSource(supportPath, "withPhoneRegistrationLock");
  const lockIndex = sharedRegistration.indexOf("pg_advisory_xact_lock");
  const userRecheckIndex = sharedRegistration.indexOf("tx.select().from(users)");

  assert.ok(lockIndex >= 0, "normalized phone advisory lock is required");
  assert.ok(userRecheckIndex > lockIndex, "existing users must be checked after the lock");
  assert.match(sharedRegistration, /throw new PhoneRegistrationConflictError/);
});

test("automatic registration and admin approval use the shared phone registration transaction", async () => {
  const registrationMethod = await readDeclarationSource(alumniPath, "createUserWithAlumniClaim");
  const pendingMethod = await readDeclarationSource(pendingPath, "approvePendingRegistration");

  await readDeclarationSource(supportPath, "withPhoneRegistrationLock");
  assert.match(registrationMethod, /withPhoneRegistrationLock/);
  assert.match(registrationMethod, /normalizedStoredPhone !== normalizedPhone/);
  assert.match(registrationMethod, /insertUser\.phoneNumber \?\? ""/);
  assert.match(pendingMethod, /withPhoneRegistrationLock/);
  assert.match(pendingMethod, /tx\.update\(pendingRegistrations\)/);
});

test("admin approval delegates atomically and never calls createUser separately", async () => {
  const approvalRoute = await readDeclarationSource(
    "modules/registry/routes.ts",
    "registerRegistryAdminRoutes",
  );

  assert.match(approvalRoute, /approvePendingRegistration/);
  assert.doesNotMatch(approvalRoute, /storage\.createUser\(/);
  assert.match(approvalRoute, /PhoneRegistrationConflictError/);
  assert.match(approvalRoute, /res\.status\(409\)/);
});

test("pending registration retries use identity advisory locks and refresh one pending row", async () => {
  const identityLock = await readDeclarationSource(supportPath, "lockRegistrationIdentities");
  const pendingMethod = await readDeclarationSource(
    pendingPath,
    "createOrRefreshPendingRegistration",
  );

  assert.match(pendingMethod, /db\.transaction/);
  assert.match(identityLock, /pg_advisory_xact_lock/);
  assert.match(pendingMethod, /lockRegistrationIdentities/);
  assert.match(pendingMethod, /pendingRegistrations\.kakaoId/);
  assert.match(pendingMethod, /pendingRegistrations\.email/);
  assert.match(pendingMethod, /tx\.update\(pendingRegistrations\)/);
  assert.match(pendingMethod, /tx\.insert\(pendingRegistrations\)/);
});

test("admin approval rechecks identity and alumni ownership before creating a member", async () => {
  const approvalMethod = await readDeclarationSource(pendingPath, "approvePendingRegistration");
  const approvalRoute = await readDeclarationSource(
    "modules/registry/routes.ts",
    "registerRegistryAdminRoutes",
  );

  assert.match(approvalMethod, /pendingRegistrations\.status, "pending"/);
  assert.match(approvalMethod, /users\.kakaoId/);
  assert.match(approvalMethod, /users\.email/);
  assert.match(approvalMethod, /alumniDatabase\.matchedUserId/);
  assert.match(approvalMethod, /isNull\(alumniDatabase\.matchedUserId\)/);
  assert.match(approvalMethod, /PendingRegistrationConflictError/);
  assert.match(approvalRoute, /PendingRegistrationConflictError/);
  assert.match(approvalRoute, /res\.status\(409\)/);
});
