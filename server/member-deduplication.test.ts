import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizePhoneForComparison } from "./storage";

const routesPath = new URL("./routes.ts", import.meta.url);
const storagePath = new URL("./storage.ts", import.meta.url);

test("Kakao login uses PostgreSQL alumni matching without Google Sheets", async () => {
  const routesSource = await readFile(routesPath, "utf8");
  const authorizeRoute = routesSource.slice(
    routesSource.indexOf('app.post("/api/auth/kakao/authorize"'),
    routesSource.indexOf('app.get("/api/auth/me"'),
  );

  assert.doesNotMatch(authorizeRoute, /findAlumniByPhoneAndName|\.\/google-sheets/);
  assert.match(authorizeRoute, /getUserByNormalizedPhone/);
  assert.match(authorizeRoute, /createUserWithAlumniClaim/);
});

test("storage compares normalized phone numbers and claims one unlinked alumni row", async () => {
  const storageSource = await readFile(storagePath, "utf8");
  const claimMethod = storageSource.slice(
    storageSource.indexOf("async claimAlumniRecord("),
    storageSource.indexOf("async getAlumniRecordByUserId("),
  );

  assert.match(storageSource, /getUserByNormalizedPhone\(phoneNumber: string\)/);
  assert.match(storageSource, /claimAlumniRecord\(name: string, phoneNumber: string, userId: number\)/);
  assert.match(claimMethod, /db\.transaction/);
  assert.match(claimMethod, /isNull\(alumniDatabase\.matchedUserId\)/);
  assert.match(claimMethod, /normalizePhoneForComparison/);
});

test("member creation and alumni claim share one database transaction", async () => {
  const storageSource = await readFile(storagePath, "utf8");
  const registrationMethod = storageSource.slice(
    storageSource.indexOf("async createUserWithAlumniClaim("),
    storageSource.indexOf("async getAlumniRecordByUserId("),
  );

  assert.match(registrationMethod, /db\.transaction/);
  assert.match(registrationMethod, /tx\.insert\(users\)/);
  assert.match(registrationMethod, /isNull\(alumniDatabase\.matchedUserId\)/);
  assert.match(registrationMethod, /throw new AlumniClaimConflictError/);
});

test("phone normalization compares Kakao country code with domestic alumni numbers", () => {
  assert.equal(normalizePhoneForComparison("+82 10-9876-5432"), "01098765432");
  assert.equal(normalizePhoneForComparison("010-9876-5432"), "01098765432");
  assert.equal(
    normalizePhoneForComparison("+82 (0)10 9876 5432"),
    normalizePhoneForComparison("010.9876.5432"),
  );
});

test("transactional alumni lookup uses the same normalized phone SQL expression", async () => {
  const storageSource = await readFile(storagePath, "utf8");
  const registrationMethod = storageSource.slice(
    storageSource.indexOf("async createUserWithAlumniClaim("),
    storageSource.indexOf("async getAlumniRecordByUserId("),
  );

  assert.match(storageSource, /function normalizedPhoneSql/);
  assert.match(registrationMethod, /normalizedPhoneSql\(alumniDatabase\.mobile\)/);
  assert.doesNotMatch(
    registrationMethod,
    /regexp_replace\(coalesce\(\$\{alumniDatabase\.mobile\}/,
  );
});

test("atomic registration locks the phone before rechecking users", async () => {
  const storageSource = await readFile(storagePath, "utf8");
  const sharedRegistration = storageSource.slice(
    storageSource.indexOf("async function withPhoneRegistrationLock"),
    storageSource.indexOf("// 회원 활동지역"),
  );
  const lockIndex = sharedRegistration.indexOf("pg_advisory_xact_lock");
  const userRecheckIndex = sharedRegistration.indexOf("tx.select().from(users)");

  assert.ok(lockIndex >= 0, "normalized phone advisory lock is required");
  assert.ok(userRecheckIndex > lockIndex, "existing users must be checked after the lock");
  assert.match(sharedRegistration, /throw new PhoneRegistrationConflictError/);
});

test("every member creation path uses the shared phone registration transaction", async () => {
  const storageSource = await readFile(storagePath, "utf8");
  const createMethod = storageSource.slice(
    storageSource.indexOf("async createUser("),
    storageSource.indexOf("async updateUser("),
  );
  const registrationMethod = storageSource.slice(
    storageSource.indexOf("async createUserWithAlumniClaim("),
    storageSource.indexOf("async getAlumniRecordByUserId("),
  );
  const pendingMethod = storageSource.slice(
    storageSource.indexOf("async updatePendingRegistrationStatus("),
    storageSource.indexOf("async searchPosts("),
  );

  assert.match(storageSource, /async function withPhoneRegistrationLock/);
  assert.match(createMethod, /withPhoneRegistrationLock/);
  assert.match(registrationMethod, /withPhoneRegistrationLock/);
  assert.match(registrationMethod, /normalizedStoredPhone !== normalizedPhone/);
  assert.match(registrationMethod, /insertUser\.phoneNumber \?\? ""/);
  assert.match(pendingMethod, /withPhoneRegistrationLock/);
  assert.match(pendingMethod, /tx\.update\(pendingRegistrations\)/);
});

test("admin approval delegates atomically and never calls createUser separately", async () => {
  const routesSource = await readFile(routesPath, "utf8");
  const approvalRoute = routesSource.slice(
    routesSource.indexOf('app.patch("/api/admin/pending-registrations/:id"'),
    routesSource.indexOf("// Google Sheets 동기화 API"),
  );

  assert.match(approvalRoute, /updatePendingRegistrationStatus/);
  assert.doesNotMatch(approvalRoute, /storage\.createUser\(/);
  assert.match(approvalRoute, /PhoneRegistrationConflictError/);
  assert.match(approvalRoute, /res\.status\(409\)/);
});

test("pending registration retries use identity advisory locks and refresh one pending row", async () => {
  const storageSource = await readFile(storagePath, "utf8");
  const identityLock = storageSource.slice(
    storageSource.indexOf("async function lockRegistrationIdentities("),
    storageSource.indexOf("function parsePendingUserData("),
  );
  const pendingMethod = storageSource.slice(
    storageSource.indexOf("async createOrRefreshPendingRegistration("),
    storageSource.indexOf("async updatePendingRegistrationStatus("),
  );

  assert.match(storageSource, /createOrRefreshPendingRegistration/);
  assert.match(pendingMethod, /db\.transaction/);
  assert.match(identityLock, /pg_advisory_xact_lock/);
  assert.match(pendingMethod, /lockRegistrationIdentities/);
  assert.match(pendingMethod, /pendingRegistrations\.kakaoId/);
  assert.match(pendingMethod, /pendingRegistrations\.email/);
  assert.match(pendingMethod, /tx\.update\(pendingRegistrations\)/);
  assert.match(pendingMethod, /tx\.insert\(pendingRegistrations\)/);
});

test("admin approval rechecks identity and alumni ownership before creating a member", async () => {
  const storageSource = await readFile(storagePath, "utf8");
  const approvalMethod = storageSource.slice(
    storageSource.indexOf("async updatePendingRegistrationStatus("),
    storageSource.indexOf("async searchPosts("),
  );
  const routesSource = await readFile(routesPath, "utf8");
  const approvalRoute = routesSource.slice(
    routesSource.indexOf('app.patch("/api/admin/pending-registrations/:id"'),
    routesSource.indexOf("// Google Sheets 동기화 API"),
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
